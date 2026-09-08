import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { CvAnalysis, EvidenceChainItem } from "@/types";

const NO_EVIDENCE = "NO CV EVIDENCE FOUND";

function extractEvidence(cvText: string, jd: string, language: "en" | "fr"): EvidenceChainItem[] {
  const cv = cvText.replace(/\s+/g, " ").trim();
  const jdSentences = jd.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const cvLower = cv.toLocaleLowerCase();
  const requirements = jdSentences.filter((s) => s.length > 25).slice(0, 8);
  return requirements.map((requirement) => {
    const words = requirement.toLocaleLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter((w) => w.length > 5).slice(0, 8);
    const match = words.find((word) => cvLower.includes(word));
    const cvEvidence = match ? cv.slice(Math.max(0, cvLower.indexOf(match) - 100), Math.min(cv.length, cvLower.indexOf(match) + match.length + 180)).trim() : null;
    const missing = !cvEvidence;
    return {
      jd_requirement: requirement,
      cv_evidence: cvEvidence || NO_EVIDENCE,
      gap_identified: missing ? (language === "fr" ? `Aucune preuve du CV n'a été trouvée pour cette exigence.` : "No CV evidence was found for this requirement.") : (language === "fr" ? "La preuve existe dans le CV; préparez un exemple concret et son résultat." : "Evidence exists in the CV; prepare a concrete example and its outcome."),
      interview_implication: missing ? (language === "fr" ? "L'intervieweur peut demander comment vous répondez à cette exigence; ne présentez pas une expérience non documentée comme un fait." : "The interviewer may ask how you meet this requirement; do not present undocumented experience as fact.") : (language === "fr" ? "L'intervieweur peut demander un exemple précis et votre contribution personnelle." : "The interviewer may ask for a specific example and your personal contribution."),
      actionable_recommendation: missing ? (language === "fr" ? `Préparez une réponse honnête à l'exigence « ${requirement} » ou expliquez l'expérience la plus proche que vous pouvez réellement démontrer.` : `Prepare an honest response to the requirement “${requirement}” or explain the closest experience you can genuinely demonstrate.`) : (language === "fr" ? `Préparez un exemple directement lié à « ${requirement} », en utilisant uniquement les faits, outils, responsabilités et résultats présents dans votre CV.` : `Prepare an example directly tied to “${requirement}”, using only the facts, tools, responsibilities, and outcomes present in your CV.`),
    };
  });
}

function isValidAnalysis(value: unknown, language: "en" | "fr"): value is CvAnalysis {
  if (!value || typeof value !== "object") return false;
  const a = value as any;
  if (!Number.isFinite(Number(a.matchScore)) || !Array.isArray(a.strengths) || !Array.isArray(a.gaps) || !Array.isArray(a.keywordAlignment) || typeof a.summary !== "string" || !Array.isArray(a.suggestedFocusAreas) || !Array.isArray(a.evidenceChain)) return false;
  if (!a.evidenceChain.length) return false;
  const generic = /\b(prepare examples|be ready|prepare for|show your|improve your|prepare simple examples|préparez des exemples|soyez prêt|améliorez votre)\b/i;
  return a.evidenceChain.every((item: any) =>
    item && typeof item.jd_requirement === "string" && item.jd_requirement.trim() &&
    typeof item.cv_evidence === "string" && item.cv_evidence.trim() &&
    typeof item.gap_identified === "string" && item.gap_identified.trim() &&
    typeof item.interview_implication === "string" && item.interview_implication.trim() &&
    typeof item.actionable_recommendation === "string" && item.actionable_recommendation.trim() &&
    item.cv_evidence !== "" && !generic.test(item.actionable_recommendation)
  ) && (language === "en" || true);
}

function fallbackAnalysis(cvText: string, jobDescription: string, language: "en" | "fr"): CvAnalysis {
  const cvLower = cvText.toLocaleLowerCase();
  const jdWords = jobDescription.toLocaleLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter((w) => w.length > 4);
  const unique = [...new Set(jdWords)].slice(0, 40);
  const matched = unique.filter((w) => cvLower.includes(w)).slice(0, 8);
  const score = Math.min(92, 40 + matched.length * 6);
  const evidenceChain = extractEvidence(cvText, jobDescription, language);
  const focus = evidenceChain.slice(0, 4).map((item) => item.actionable_recommendation);
  if (language === "fr") return {
    matchScore: score,
    strengths: evidenceChain.filter((x) => x.cv_evidence !== NO_EVIDENCE).slice(0, 4).map((x) => `${x.jd_requirement} — preuve CV : ${x.cv_evidence}`),
    gaps: evidenceChain.filter((x) => x.cv_evidence === NO_EVIDENCE).slice(0, 4).map((x) => x.jd_requirement),
    keywordAlignment: matched,
    summary: "Cette analyse est fondée sur les éléments fournis dans votre CV et l'offre. Utilisez la chaîne de preuves pour préparer vos réponses sans inventer d'expérience.",
    suggestedFocusAreas: focus,
    evidenceChain,
  };
  return {
    matchScore: score,
    strengths: evidenceChain.filter((x) => x.cv_evidence !== NO_EVIDENCE).slice(0, 4).map((x) => `${x.jd_requirement} — CV evidence: ${x.cv_evidence}`),
    gaps: evidenceChain.filter((x) => x.cv_evidence === NO_EVIDENCE).slice(0, 4).map((x) => x.jd_requirement),
    keywordAlignment: matched,
    summary: "This analysis is grounded in the supplied CV and job description. Use the evidence chain to prepare answers without inventing experience.",
    suggestedFocusAreas: focus,
    evidenceChain,
  };
}

async function runAnalysis(cvText: string, jobDescription: string, language: "en" | "fr", priorContext?: { sessions: unknown[]; coaching_progress: unknown[] }): Promise<CvAnalysis> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.2, messages: [
      { role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's evidence-grounded candidate coach. Every candidate-facing value must be entirely in the selected preparation language. JSON keys remain exactly in English.\n\nReturn exactly these keys: matchScore, strengths, gaps, keywordAlignment, summary, suggestedFocusAreas, evidenceChain.\nevidenceChain must be an array of objects using exactly these English structural keys: jd_requirement, cv_evidence, gap_identified, interview_implication, actionable_recommendation.\n\nMANDATORY EVIDENCE CHAIN for every item:\n1. jd_requirement: quote or precisely identify one concrete requirement from the JD.\n2. cv_evidence: quote or precisely identify supporting CV evidence. If there is no supporting CV evidence, the value MUST be exactly "${NO_EVIDENCE}".\n3. gap_identified: state the evidence gap.\n4. interview_implication: explain what this means for the interview.\n5. actionable_recommendation: give one specific preparation action that references the actual JD requirement and/or concrete CV evidence (role, employer, tool, process, responsibility, metric, achievement, or competency).\n\nDo not invent facts. Do not turn prior preparation context into CV evidence. Do not give generic recommendations such as “prepare examples”, “be ready”, or “improve your communication” without a concrete CV/JD reference. If evidence is missing, say so exactly and coach the candidate to address the specific requirement honestly. Keep arrays concise.` },
      { role: "user", content: `CV:\n${cvText.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nPRIOR PREPARATION CONTEXT:\n${JSON.stringify(priorContext ?? { sessions: [], coaching_progress: [] }).slice(0, 12000)}\n\nAnalyze only the current CV and JD as evidence.` },
    ]});
    const raw = completion.choices[0]?.message?.content; if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as CvAnalysis;
    if (!isValidAnalysis(parsed, language)) throw new Error("Invalid evidence-grounded analysis");
    return parsed;
  } catch { return fallbackAnalysis(cvText, jobDescription, language); }
}

async function tryFetchJobDescription(url: string): Promise<string> {
  try { const response = await fetch(url, { headers: { "User-Agent": "InterviewMirror/1.0 (+job-description-import)" }, signal: AbortSignal.timeout(8000), cache: "no-store" }); if (!response.ok) return ""; const contentType = response.headers.get("content-type") ?? ""; if (contentType.includes("application/pdf")) return ""; const html = await response.text(); if (!html.trim()) return ""; return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim().slice(0, 16000); } catch { return ""; }
}

export async function POST(request: Request) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json(); const cvText = String(body.cvText ?? "").trim(); let jobDescription = String(body.jobDescription ?? "").trim(); const jobDescriptionUrl = String(body.jobDescriptionUrl ?? "").trim() || null; const title = String(body.title ?? "Interview preparation").trim(); const sessionId = body.sessionId as string | null | undefined; const preparationPurpose = body.preparationPurpose === "improve_skills" ? "improve_skills" : "upcoming_interview"; const language = normalizeLanguage(body.language); const interviewDate = String(body.interviewDate ?? "").trim();
  if (!cvText) return NextResponse.json({ error: "CV is required" }, { status: 400 });
  if (preparationPurpose === "upcoming_interview" && !interviewDate) return NextResponse.json({ error: "Interview date is required for an upcoming interview" }, { status: 400 });
  if (preparationPurpose === "improve_skills" && interviewDate) return NextResponse.json({ error: "Interview date must be empty when improving interview skills" }, { status: 400 });
  if (!jobDescription && jobDescriptionUrl) jobDescription = await tryFetchJobDescription(jobDescriptionUrl);
  if (!jobDescription && preparationPurpose === "upcoming_interview") return NextResponse.json({ error: "Please paste the job description or upload its PDF. We could not reliably read the supplied link." }, { status: 400 });
  const parsedInterviewDate = interviewDate ? new Date(`${interviewDate}T12:00:00.000Z`) : null; if (parsedInterviewDate && Number.isNaN(parsedInterviewDate.getTime())) return NextResponse.json({ error: "Invalid interview date" }, { status: 400 });
  let priorContext: { sessions: unknown[]; coaching_progress: unknown[] } | undefined; if (!sessionId) { const { data, error } = await supabase.rpc("get_candidate_preparation_context", { p_user_id: user.id }); if (!error && data) priorContext = data; }
  const analysis = await runAnalysis(cvText, jobDescription, language, priorContext); let id = sessionId ?? null;
  const sessionFields = { title, cv_text: cvText, job_description: jobDescription, job_description_url: jobDescriptionUrl, preparation_purpose: preparationPurpose, preparation_language: language, interview_date: parsedInterviewDate?.toISOString() ?? null, cv_analysis: analysis, status: "analyzed" };
  if (id) { const { error } = await supabase.from("sessions").update(sessionFields).eq("id", id).eq("user_id", user.id); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); }
  else { const { data, error } = await supabase.from("sessions").insert({ user_id: user.id, ...sessionFields }).select("id").single(); if (error || !data) return NextResponse.json({ error: error?.message || "Failed to create session" }, { status: 500 }); id = data.id; }
  await supabase.from("questions").delete().eq("session_id", id);
  const rawQuestions = (analysis as any)?.questions || (analysis as any)?.interviewQuestions || (analysis as any)?.interview_questions || [];
  const questionsToInsert = rawQuestions.map((q: any, index: number) => ({ session_id: id, question: typeof q === "string" ? q : (q.question || q.question_text || q.text || String(q)), category: typeof q === "object" && q.category ? q.category : "General", order_index: index + 1 }));
  if (questionsToInsert.length > 0) { const { error: questionsError } = await supabase.from("questions").insert(questionsToInsert); if (questionsError) return NextResponse.json({ error: questionsError.message }, { status: 500 }); }
  return NextResponse.json({ sessionId: id, analysis });
}
