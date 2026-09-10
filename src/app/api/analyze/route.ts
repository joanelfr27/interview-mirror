import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { AI_MODEL, languageInstruction, normalizeLanguage, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { AnalysisProvenance, CvAnalysis, EvidenceChainItem } from "@/types";

const NO_EVIDENCE = "NO CV EVIDENCE FOUND";
const CONTRACT_VERSION = "v5.1" as const;

function canonicalize(value: string): string { return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function sha256(value: string): string { return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`; }
function cvStoragePath(userId: string, cvText: string): string { return `${userId}/${createHash("sha256").update(cvText).digest("hex").slice(0, 32)}.txt`; }

async function ensureReusableCv(supabase: any, userId: string, cvText: string, fileName: string) {
  const existing = await supabase.from("user_cvs").select("id, storage_path").eq("user_id", userId).eq("cv_text", cvText).limit(1).maybeSingle();
  if (existing.error) throw new Error(existing.error.message); if (existing.data) return existing.data;
  const path = cvStoragePath(userId, cvText);
  const upload = await supabase.storage.from("cvs").upload(path, new Blob([cvText], { type: "text/plain" }), { contentType: "text/plain", upsert: false });
  if (upload.error && !/already exists/i.test(upload.error.message)) throw new Error(upload.error.message);
  const { data, error } = await supabase.from("user_cvs").insert({ user_id: userId, file_name: fileName, cv_text: cvText, storage_path: path }).select("id, storage_path").single();
  if (error || !data) throw new Error(error?.message || "Failed to persist CV"); return data;
}

const BOILERPLATE = ["cookie policy", "cookies", "accept", "reject", "agree & join", "skip to main content", "linkedin respects your privacy", "you can update your choices", "privacy policy", "terms of use", "sign in", "sign up", "follow", "share", "comments"];
function stripHtml(html: string): string { return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim(); }
function extractSubstantiveJdText(html: string): string { const raw = stripHtml(html); if (!raw) return ""; const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean); const cleaned = canonicalize(sentences.filter((s) => !BOILERPLATE.some((p) => s.toLocaleLowerCase().includes(p))).join(" ")); const words = cleaned.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)); const substantive = words.filter((w) => w.length >= 4 && !/^(https?|www|linkedin)$/i.test(w)); const hits = BOILERPLATE.reduce((n, p) => n + (raw.toLocaleLowerCase().split(p).length - 1), 0); if (cleaned.length < 300 || substantive.length < 45 || (hits > 0 && hits / Math.max(1, sentences.length) > 0.25)) return ""; return cleaned.slice(0, 16000); }
async function tryFetchJobDescription(url: string): Promise<string> { try { const response = await fetch(url, { headers: { "User-Agent": "InterviewMirror/1.0 (+job-description-import)" }, signal: AbortSignal.timeout(8000), cache: "no-store" }); if (!response.ok) return ""; const contentType = response.headers.get("content-type") ?? ""; if (contentType.includes("application/pdf")) return ""; return extractSubstantiveJdText(await response.text()); } catch { return ""; } }
function extractStandaloneUrl(value: string): string | null { const t = value.trim(); if (!/^https?:\/\/\S+$/i.test(t)) return null; try { return new URL(t).toString(); } catch { return null; } }
function removeUrls(value: string): string { return canonicalize(value.replace(/https?:\/\/\S+/gi, " ")); }

function generic(value: string): boolean { return /\b(prepare examples|prepare simple examples|be ready|show your strengths|connect your experience|based on your cv|prepare for the interview|préparez des exemples|soyez prêt|montrez vos points forts|reliez votre expérience|à partir de votre cv|préparez-vous)\b/i.test(value); }

function isValidAnalysis(value: unknown): value is CvAnalysis {
  if (!value || typeof value !== "object") return false;
  const a = value as any;
  if (!Number.isInteger(a.matchScore) || a.matchScore < 1 || a.matchScore > 100 || typeof a.summary !== "string" || !a.summary.trim()) return false;
  if (!Array.isArray(a.strengths) || !Array.isArray(a.gaps) || !Array.isArray(a.keywordAlignment) || !Array.isArray(a.suggestedFocusAreas) || !Array.isArray(a.evidenceChain) || !a.evidenceChain.length) return false;
  if (a.strengths.length > 5 || a.gaps.length > 5 || a.keywordAlignment.length > 10 || a.suggestedFocusAreas.length > 5 || a.evidenceChain.length > 8) return false;
  if (![...a.strengths, ...a.gaps, ...a.keywordAlignment, ...a.suggestedFocusAreas].every((x: any) => typeof x === "string" && x.trim())) return false;
  return a.evidenceChain.every((x: any) => typeof x?.jd_requirement === "string" && x.jd_requirement.trim() && typeof x.cv_evidence === "string" && x.cv_evidence.trim() && typeof x.gap_identified === "string" && x.gap_identified.trim() && typeof x.interview_implication === "string" && x.interview_implication.trim() && typeof x.actionable_recommendation === "string" && x.actionable_recommendation.trim() && !generic(x.actionable_recommendation));
}

function extractEvidence(cvText: string, jd: string, language: "en" | "fr"): EvidenceChainItem[] {
  const cv = canonicalize(cvText);
  const jdSentences = jd.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const cvLower = cv.toLocaleLowerCase();
  return jdSentences.filter((s) => s.length > 25).slice(0, 8).map((requirement) => {
    const words = requirement.toLocaleLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter((w) => w.length > 5).slice(0, 10);
    const phraseCandidates = words.flatMap((word, index) => words.slice(index + 1, index + 3).map((next) => `${word} ${next}`));
    const matchedPhrase = phraseCandidates.find((phrase) => cvLower.includes(phrase));
    const pos = matchedPhrase ? cvLower.indexOf(matchedPhrase) : -1;
    const cvEvidence = pos >= 0 ? cv.slice(Math.max(0, pos - 100), Math.min(cv.length, pos + matchedPhrase!.length + 180)).trim() : null;
    const missing = !cvEvidence;
    return {
      jd_requirement: requirement,
      cv_evidence: cvEvidence || NO_EVIDENCE,
      gap_identified: missing ? (language === "fr" ? "Aucune preuve du CV n'a été trouvée pour cette exigence." : "No CV evidence was found for this requirement.") : (language === "fr" ? "La preuve existe dans le CV; préparez un exemple concret et son résultat." : "Evidence exists in the CV; prepare a concrete example and its outcome."),
      interview_implication: missing ? (language === "fr" ? "L'intervieweur peut vous demander comment vous répondez à cette exigence. N'attribuez pas à votre expérience ce que votre CV ne permet pas de démontrer." : "The interviewer may ask how you meet this requirement. Do not claim experience that your CV does not demonstrate.") : (language === "fr" ? "L'intervieweur peut demander un exemple précis, votre rôle personnel et le résultat obtenu." : "The interviewer may ask for a specific example, your personal contribution, and the result."),
      actionable_recommendation: missing ? (language === "fr" ? `Répondez honnêtement à « ${requirement} » en expliquant soit l'écart, soit l'expérience la plus proche que vous pouvez réellement démontrer.` : `Answer “${requirement}” honestly by explaining the gap or the closest experience you can genuinely demonstrate.`) : (language === "fr" ? `Construisez un exemple précis lié à « ${requirement} ». Expliquez le contexte, ce que vous avez fait personnellement et le résultat, en restant fidèle à votre CV.` : `Build one specific example linked to “${requirement}”. Explain the context, what you personally did, and the result, staying faithful to your CV.`)
    };
  });
}

function fallbackAnalysis(cvText: string, jobDescription: string, language: "en" | "fr"): CvAnalysis {
  const jdWords = jobDescription.toLocaleLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter((w) => w.length > 4);
  const cvLower = cvText.toLocaleLowerCase();
  const keywordPairs = [...new Set(jdWords)].flatMap((word, index, all) => all.slice(index + 1, index + 3).map((next) => `${word} ${next}`)).filter((phrase) => cvLower.includes(phrase)).slice(0, 8);
  const evidenceChain = extractEvidence(cvText, jobDescription, language);
  const supported = evidenceChain.filter((x) => x.cv_evidence !== NO_EVIDENCE).length;
  const score = Math.min(92, 40 + supported * 6);
  const strengths = evidenceChain.filter((x) => x.cv_evidence !== NO_EVIDENCE).slice(0, 4).map((x) => language === "fr" ? `Correspondance : ${x.jd_requirement} — preuve : ${x.cv_evidence}` : `Strong match: ${x.jd_requirement} — evidence: ${x.cv_evidence}`);
  const gaps = evidenceChain.filter((x) => x.cv_evidence === NO_EVIDENCE).slice(0, 4).map((x) => language === "fr" ? `Écart à traiter : ${x.jd_requirement}` : `Gap to address: ${x.jd_requirement}`);
  const summary = language === "fr" ? "L'analyse distingue les exigences que votre CV démontre clairement de celles pour lesquelles aucune preuve directe n'est visible. Concentrez-vous sur les écarts les plus susceptibles d'être testés en entretien." : "The analysis separates requirements your CV demonstrates clearly from those for which no direct evidence is visible. Focus first on the gaps most likely to be tested in the interview.";
  return { matchScore: score, strengths, gaps, keywordAlignment: keywordPairs, summary, suggestedFocusAreas: evidenceChain.slice(0, 4).map((item) => item.actionable_recommendation), evidenceChain };
}

async function runAnalysis(cvText: string, jobDescription: string, language: "en" | "fr", priorContext?: { sessions: unknown[]; coaching_progress: unknown[] }): Promise<CvAnalysis> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.1, messages: [
      { role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's evidence-grounded candidate coach. Analyze only the current CV and job description. Candidate-facing values must be entirely in the selected preparation language; JSON keys remain English. Return exactly: matchScore, strengths, gaps, keywordAlignment, summary, suggestedFocusAreas, evidenceChain. EvidenceChain objects use exactly: jd_requirement, cv_evidence, gap_identified, interview_implication, actionable_recommendation.\n\nSCORING: Give an integer 1-100 based on semantic assessment of important JD requirements against documented CV evidence. Never count keywords and never use a default score. Equivalent CVs in English and French must receive materially equivalent assessments.\n\nGROUNDING: cv_evidence must quote or closely reproduce real CV text; use exactly \"${NO_EVIDENCE}\" when absent. jd_requirement may paraphrase the requirement. Never invent facts. Every strength, gap, focus area and recommendation must be specific to the current JD and/or CV. Every recommendation must reference the requirement/evidence and give one concrete interview action. Keep summary to 2-3 concise sentences. Avoid generic advice and repetition.` },
      { role: "user", content: `CURRENT CV:\n${cvText.slice(0, 12000)}\n\nCURRENT JOB DESCRIPTION:\n${jobDescription.slice(0, 10000)}\n\nPRIOR CONTEXT (not evidence):\n${JSON.stringify(priorContext ?? { sessions: [], coaching_progress: [] }).slice(0, 12000)}` }
    ]});
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as CvAnalysis;
    console.error("[ANALYSIS DEBUG] AI response parsed successfully");
    const valid = isValidAnalysis(parsed);
    console.error("[ANALYSIS DEBUG] validation result:", valid);
    if (!valid) throw new Error("Invalid evidence-grounded analysis");
    return parsed;
  } catch (error) {
    console.warn("[ANALYSIS FALLBACK] Using deterministic CV/JD-grounded fallback:", error instanceof Error ? error.message : "analysis failure");
    return fallbackAnalysis(cvText, jobDescription, language);
  }
}

function buildProvenance(language: "en" | "fr", cvText: string, jobDescription: string): AnalysisProvenance { return { preparation_language: language, jd_content_hash: sha256(jobDescription), cv_content_hash: sha256(cvText), contract_version: CONTRACT_VERSION }; }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const cvText = canonicalize(String(body.cvText ?? ""));
  let jobDescription = canonicalize(String(body.jobDescription ?? ""));
  let jobDescriptionUrl = String(body.jobDescriptionUrl ?? "").trim() || null;
  const title = canonicalize(String(body.title ?? "Interview preparation"));
  const sessionId = body.sessionId as string | null | undefined;
  const preparationPurpose = body.preparationPurpose === "improve_skills" ? "improve_skills" : "upcoming_interview";
  const language = normalizeLanguage(body.preparation_language);
  const interviewDate = String(body.interviewDate ?? "").trim();
  const embeddedUrl = extractStandaloneUrl(jobDescription);
  if (!jobDescriptionUrl && embeddedUrl) { jobDescriptionUrl = embeddedUrl; jobDescription = ""; }
  if (jobDescription) jobDescription = removeUrls(jobDescription);
  if (!cvText) return NextResponse.json({ error: "CV is required" }, { status: 400 });
  if (preparationPurpose === "upcoming_interview" && !interviewDate) return NextResponse.json({ error: "Interview date is required for an upcoming interview" }, { status: 400 });
  if (preparationPurpose === "improve_skills" && interviewDate) return NextResponse.json({ error: "Interview date must be empty when improving interview skills" }, { status: 400 });
  if (!jobDescription && jobDescriptionUrl) {
    jobDescription = await tryFetchJobDescription(jobDescriptionUrl);
    if (!jobDescription) return NextResponse.json({ code: "JD_EXTRACTION_FAILED", error: "We could not reliably extract a job description from this link. Please paste the job description or upload the PDF." }, { status: 422 });
  }
  if (preparationPurpose === "upcoming_interview" && jobDescription.length < 300) return NextResponse.json({ code: "JD_EXTRACTION_FAILED", error: "The job description is too short to analyze reliably. Please paste the full job description or upload the PDF." }, { status: 422 });
  const parsedInterviewDate = interviewDate ? new Date(`${interviewDate}T12:00:00.000Z`) : null;
  if (parsedInterviewDate && Number.isNaN(parsedInterviewDate.getTime())) return NextResponse.json({ error: "Invalid interview date" }, { status: 400 });
  try { await ensureReusableCv(supabase, user.id, cvText, String(body.fileName ?? "CV")); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to persist CV" }, { status: 500 }); }
  let priorContext: { sessions: unknown[]; coaching_progress: unknown[] } | undefined;
  if (!sessionId) { const { data, error } = await supabase.rpc("get_candidate_preparation_context", { p_user_id: user.id }); if (!error && data) priorContext = data; }
  const canonicalCv = canonicalize(cvText);
  const canonicalJd = canonicalize(jobDescription);
  const analysis = await runAnalysis(canonicalCv, canonicalJd, language, priorContext);
  const validatedAnalysis = { ...analysis, provenance: buildProvenance(language, canonicalCv, canonicalJd) } satisfies CvAnalysis;
  const sessionFields = { title, cv_text: canonicalCv, job_description: canonicalJd, job_description_url: jobDescriptionUrl, preparation_purpose: preparationPurpose, preparation_language: language, interview_date: parsedInterviewDate?.toISOString() ?? null, cv_analysis: validatedAnalysis, status: "analyzed" };
  let id = sessionId ?? null;
  if (id) { const { error } = await supabase.from("sessions").update(sessionFields).eq("id", id).eq("user_id", user.id); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); }
  else { const { data, error } = await supabase.from("sessions").insert({ user_id: user.id, ...sessionFields }).select("id").single(); if (error || !data) return NextResponse.json({ error: error?.message || "Failed to create session" }, { status: 500 }); id = data.id; }
  await supabase.from("questions").delete().eq("session_id", id);
  return NextResponse.json({ sessionId: id, analysis: validatedAnalysis });
}
