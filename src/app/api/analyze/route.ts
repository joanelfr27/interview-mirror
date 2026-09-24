import { createHash } from "crypto";

export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { AI_MODEL, languageInstruction, normalizeLanguage, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import { continuationInputsChanged, continuationResetState, isContinuationJourney, isJourney, isNewJourney, isResumableSessionStatus, purposeForJourney } from "@/lib/journey";
import type { AnalysisProvenance, CvAnalysis } from "@/types";
import { buildIngestedDocument, fetchLinkedDocument, type IngestedDocument, type IngestionSourceType } from "@/lib/universal-ingestion";
import { assertPublicIngestionUrl } from "@/lib/server-ingestion-url";

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

function preparationPurposeForBody(body: Record<string, unknown>): "upcoming_interview" | "improve_skills" {
  return body.preparationPurpose === "improve_skills" ? "improve_skills" : "upcoming_interview";
}

function isIngestionSourceType(value: unknown): value is IngestionSourceType {
  return value === "pdf" || value === "word" || value === "link" || value === "paste" || value === "text";
}

async function canonicalDocumentFromBody(value: unknown, fallbackText: unknown, fallbackSource: IngestionSourceType): Promise<IngestedDocument> {
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.text === "string" && candidate.text.trim()) {
      const sourceType = isIngestionSourceType(candidate.sourceType) ? candidate.sourceType : fallbackSource;
      return buildIngestedDocument(candidate.text, sourceType, typeof candidate.sourceName === "string" ? candidate.sourceName : undefined, typeof candidate.sourceUrl === "string" ? candidate.sourceUrl : undefined);
    }
  }
  if (typeof fallbackText === "string" && fallbackText.trim()) return buildIngestedDocument(fallbackText, fallbackSource);
  throw new Error("NO_READABLE_TEXT");
}

async function canonicalLinkedDocument(url: string): Promise<IngestedDocument> {
  const safeUrl = new URL(url).toString();
  const text = await fetchLinkedDocument(safeUrl, assertPublicIngestionUrl);
  return buildIngestedDocument(text, "link", undefined, safeUrl);
}

function evidenceTokenSet(value: string): Set<string> {
  return new Set(
    canonicalize(value)
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((token) => token.length >= 5)
  );
}

function groundingOverlap(claim: string, source: string): number {
  const claimTokens = evidenceTokenSet(claim);
  const sourceTokens = evidenceTokenSet(source);
  if (!claimTokens.size || !sourceTokens.size) return 0;
  let common = 0;
  for (const token of claimTokens) if (sourceTokens.has(token)) common++;
  return common / Math.min(claimTokens.size, sourceTokens.size);
}

function isValidAnalysis(value: unknown, cvText?: string, jobDescription?: string): value is CvAnalysis {
  if (!value || typeof value !== "object") return false;
  const a = value as any;
  if (!Number.isFinite(Number(a.matchScore)) || !Array.isArray(a.strengths) || !Array.isArray(a.gaps) || !Array.isArray(a.keywordAlignment) || typeof a.summary !== "string" || !Array.isArray(a.suggestedFocusAreas) || !Array.isArray(a.evidenceChain) || !a.evidenceChain.length) return false;
  const generic = /\b(prepare examples|be ready|prepare for|show your|improve your|prepare simple examples|préparez des exemples|soyez prêt|améliorez votre|clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|based on the cv|à partir du cv)\b/i;
  const cvSource = cvText ? canonicalize(cvText) : "";
  const jdSource = jobDescription ? canonicalize(jobDescription) : "";
  const evidenceGrounded = a.evidenceChain.every((item: any) => {
    if (!item || typeof item.jd_requirement !== "string" || !item.jd_requirement.trim() || typeof item.cv_evidence !== "string" || !item.cv_evidence.trim() || typeof item.gap_identified !== "string" || !item.gap_identified.trim() || typeof item.interview_implication !== "string" || !item.interview_implication.trim() || typeof item.actionable_recommendation !== "string" || !item.actionable_recommendation.trim() || generic.test(item.actionable_recommendation)) return false;
    const jdGrounded = !jdSource
      ? item.jd_requirement === "NO JOB DESCRIPTION PROVIDED"
      : item.jd_requirement === NO_EVIDENCE
        ? false
        : groundingOverlap(item.jd_requirement, jdSource) >= 0.20;
    const cvGrounded = item.cv_evidence === NO_EVIDENCE
      ? true
      : groundingOverlap(item.cv_evidence, cvSource) >= 0.20;
    return jdGrounded && cvGrounded;
  });
  return evidenceGrounded
    && a.strengths.every((x: any) => typeof x === "string" && x.trim())
    && a.gaps.every((x: any) => typeof x === "string" && x.trim())
    && a.suggestedFocusAreas.every((x: any) => typeof x === "string" && x.trim());
}

async function runAnalysis(cvText: string, jobDescription: string, language: "en" | "fr", priorContext?: { sessions: unknown[]; coaching_progress: unknown[] }): Promise<CvAnalysis> {
  const openai = getOpenAI();
  try {
    const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.2, messages: [
      { role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's evidence-grounded candidate coach. Your job is to give the candidate a precise diagnostic of how their CV fits this specific job and what the interview is likely to test. The output must feel like expert coaching, not an ATS report or generic AI advice.\n\nCandidate-facing values must be entirely in the selected preparation language. Use short, clear, natural professional language. Avoid jargon, academic wording, consultant-style phrases, and abstract language. Explain practical next steps in terms the candidate can immediately understand. JSON keys remain exactly in English. Return exactly: matchScore, strengths, gaps, keywordAlignment, summary, suggestedFocusAreas, evidenceChain. EvidenceChain objects use exactly: jd_requirement, cv_evidence, gap_identified, interview_implication, actionable_recommendation.\n\nDIAGNOSTIC RULES:\n- When a job description is provided, judge each important JD requirement against the CV, not against general knowledge or prior context.
- When NO job description is provided, do not invent employer requirements. Set every evidenceChain.jd_requirement to exactly "NO JOB DESCRIPTION PROVIDED" and ground the analysis in the candidate CV, transferable interview competencies, and prior preparation context only.\n- Separate direct evidence, transferable/partial evidence, and missing evidence. Never turn a related job title or keyword into proof of a responsibility the CV does not state.\n- Do not inflate the match score. A strong candidate with material industry or responsibility gaps should not receive a near-perfect score.\n- Strengths must say WHAT matches and WHY, using concrete CV evidence.\n- Gaps must identify the specific requirement that is not clearly demonstrated and why it may matter in the interview.\n- KeywordAlignment must contain useful themes or capabilities, never raw filler words such as company, sector, manager, improve, services, or location names.\n- Summary must be 2-3 concise sentences explaining the candidate's strongest fit and most important risks.\n- SuggestedFocusAreas must be 3-5 prioritized preparation actions tied to real CV/JD evidence.\n\nEVIDENCE CHAIN RULES:\n- For every item, identify one concrete JD requirement and one concrete CV passage when evidence exists. Without a JD, use exactly "NO JOB DESCRIPTION PROVIDED" as jd_requirement.\n- When evidence is absent, use exactly "${NO_EVIDENCE}" and say so plainly.\n- State what the interviewer may test because of the evidence or gap.\n- Give one concrete preparation action that references the actual requirement and/or CV evidence.\n- Never invent employers, credentials, responsibilities, metrics, tools, industry experience, dates, stakeholders, or outcomes.\n- Avoid repetitive filler such as 'your CV shows a clear professional story', 'your experience is relevant', 'prepare examples', or 'connect your experience'.` },
      { role: "user", content: `CV:\n${cvText.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nPRIOR PREPARATION CONTEXT:\n${JSON.stringify(priorContext ?? { sessions: [], coaching_progress: [] }).slice(0, 12000)}\n\nAnalyze only the current CV and JD as evidence.` }
    ]});
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as CvAnalysis;
    if (!isValidAnalysis(parsed, cvText, jobDescription)) throw new Error("Invalid evidence-grounded analysis");
    return parsed;
  } catch (error) {
    console.error("[ANALYSIS FAILED]", error instanceof Error ? error.message : "analysis failure");
    throw new Error("ANALYSIS_GENERATION_FAILED");
  }
}

function buildProvenance(language: "en" | "fr", cvText: string, jobDescription: string): AnalysisProvenance { return { preparation_language: language, jd_content_hash: sha256(jobDescription), cv_content_hash: sha256(cvText), contract_version: CONTRACT_VERSION }; }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const rawCvText = typeof body.cvText === "string" ? body.cvText : "";
  let rawJobDescription = typeof body.jobDescription === "string" ? body.jobDescription : "";
  let jobDescriptionUrl = String(body.jobDescriptionUrl ?? "").trim() || null;
  let cvDocument: IngestedDocument;
  let jobDescriptionDocument: IngestedDocument | null = null;
  if (!body.cvDocument) return NextResponse.json({ code: "CANONICAL_CV_REQUIRED", error: "The CV must pass through universal ingestion before analysis" }, { status: 400 });
  if (preparationPurposeForBody(body) === "upcoming_interview" && !body.jobDescriptionDocument && !String(body.jobDescriptionUrl ?? "").trim() && !String(body.jobDescription ?? "").trim()) {
    return NextResponse.json({ code: "CANONICAL_JD_REQUIRED", error: "A job description must pass through universal ingestion before analysis" }, { status: 400 });
  }
  try {
    cvDocument = await canonicalDocumentFromBody(body.cvDocument, rawCvText, "text");
    if (body.jobDescriptionDocument) {
      jobDescriptionDocument = await canonicalDocumentFromBody(body.jobDescriptionDocument, "", "text");
    } else if (rawJobDescription.trim()) {
      const embedded = extractStandaloneUrl(rawJobDescription);
      if (embedded && !jobDescriptionUrl) jobDescriptionUrl = embedded;
      if (embedded && rawJobDescription.trim() === embedded) rawJobDescription = "";
      if (rawJobDescription.trim()) jobDescriptionDocument = await canonicalDocumentFromBody(null, rawJobDescription, "paste");
    }
    if (!jobDescriptionDocument && jobDescriptionUrl) jobDescriptionDocument = await canonicalLinkedDocument(jobDescriptionUrl);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INGESTION_FAILED";
    return NextResponse.json({ code, error: "We could not reliably ingest the CV or job description. Please upload, paste, or provide another source." }, { status: 422 });
  }
  const cvText = cvDocument.text;
  let jobDescription = jobDescriptionDocument?.text ?? "";
  if (jobDescriptionDocument?.sourceUrl) jobDescriptionUrl = jobDescriptionDocument.sourceUrl;
  const title = canonicalize(String(body.title ?? "Interview preparation"));
  const sessionId = body.sessionId as string | null | undefined;
  const journey = String(body.journey ?? "").trim();
  const preparationPurpose = body.preparationPurpose === "improve_skills" ? "improve_skills" : "upcoming_interview";
  const language = normalizeLanguage(body.experience_language ?? body.preparation_language);
  const interviewLanguage = normalizeLanguage(body.interview_language ?? body.preparation_language);
  const interviewDate = String(body.interviewDate ?? "").trim();
  if (!isJourney(journey)) return NextResponse.json({ code: "INVALID_JOURNEY", error: "A valid preparation journey is required" }, { status: 400 });
  const expectedPurpose = purposeForJourney(journey);
  if (preparationPurpose !== expectedPurpose) return NextResponse.json({ code: "JOURNEY_PURPOSE_MISMATCH", error: "The selected preparation journey determines the preparation purpose" }, { status: 409 });
  if (isContinuationJourney(journey) && !sessionId) return NextResponse.json({ code: "SESSION_REQUIRED", error: "A valid preparation session is required to continue" }, { status: 409 });
  if (isNewJourney(journey) && sessionId) return NextResponse.json({ code: "NEW_JOURNEY_REQUIRES_FRESH_SESSION", error: "A new preparation journey must start a fresh preparation session" }, { status: 409 });
  if (!cvText) return NextResponse.json({ error: "CV is required" }, { status: 400 });
  if (preparationPurpose === "improve_skills" && interviewDate) return NextResponse.json({ error: "Interview date must be empty when improving interview skills" }, { status: 400 });

  if (preparationPurpose === "upcoming_interview" && jobDescription.length < 300) return NextResponse.json({ code: "JD_EXTRACTION_FAILED", error: "The job description is too short to analyze reliably. Please paste the full job description or upload the PDF." }, { status: 422 });
  const parsedInterviewDate = interviewDate ? new Date(`${interviewDate}T12:00:00.000Z`) : null;
  if (parsedInterviewDate && Number.isNaN(parsedInterviewDate.getTime())) return NextResponse.json({ error: "Invalid interview date" }, { status: 400 });
  try { await ensureReusableCv(supabase, user.id, cvText, String(body.fileName ?? "CV")); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to persist CV" }, { status: 500 }); }
  let priorContext: { sessions: unknown[]; coaching_progress: unknown[] } | undefined;
  if (!sessionId || journey === "continue_skills") {
    const { data, error } = await supabase.rpc("get_candidate_preparation_context", { p_user_id: user.id });
    if (!error && data) priorContext = journey === "continue_skills"
      ? { ...data, sessions: (data.sessions ?? []).filter((s: { id?: string }) => s.id !== sessionId) }
      : data;
  }
  const canonicalCv = cvDocument.text; const canonicalJd = jobDescriptionDocument?.text ?? "";
  let analysis: CvAnalysis;
  try { analysis = await runAnalysis(canonicalCv, canonicalJd, language, priorContext); }
  catch { return NextResponse.json({ code: "ANALYSIS_GENERATION_FAILED", error: "We could not produce a reliable Professional Mirror analysis. Please retry." }, { status: 422 }); }
  const validatedAnalysis = { ...analysis, provenance: buildProvenance(language, canonicalCv, canonicalJd) } satisfies CvAnalysis;
  const sessionFields = { title, cv_text: canonicalCv, job_description: canonicalJd, job_description_url: jobDescriptionUrl, preparation_purpose: preparationPurpose, preparation_language: language, experience_language: language, interview_language: interviewLanguage, interview_date: parsedInterviewDate?.toISOString() ?? null, cv_analysis: validatedAnalysis, status: "analyzed" };
  let id = sessionId ?? null;
  let inputsChanged = false;
  if (id) {
    const { data: existingSession, error: existingSessionError } = await supabase
      .from("sessions")
      .select("id, preparation_purpose, status, cv_text, job_description")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingSessionError) return NextResponse.json({ error: existingSessionError.message }, { status: 500 });
    if (!existingSession) return NextResponse.json({ code: "SESSION_NOT_FOUND", error: "Preparation session not found or expired" }, { status: 404 });
    if (existingSession.preparation_purpose !== preparationPurpose) {
      return NextResponse.json({ code: "SESSION_PURPOSE_MISMATCH", error: "The selected preparation journey does not match this session" }, { status: 409 });
    }
    if (isContinuationJourney(journey) && !isResumableSessionStatus(existingSession.status)) {
      return NextResponse.json({ code: "SESSION_NOT_RESUMABLE", error: "Completed preparation sessions cannot be resumed" }, { status: 409 });
    }
    inputsChanged = continuationInputsChanged(
      existingSession.cv_text ?? "",
      existingSession.job_description ?? "",
      canonicalCv,
      canonicalJd,
    );
    const continuationState = continuationResetState(existingSession.status, inputsChanged);
    const updateFields = isContinuationJourney(journey)
      ? {
          ...sessionFields,
          status: continuationState.status,
          ...(continuationState.resetStrategy ? { interview_strategy: null } : {}),
        }
      : sessionFields;
    const { data: updatedSession, error } = await supabase
      .from("sessions")
      .update(updateFields)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updatedSession) return NextResponse.json({ code: "SESSION_NOT_FOUND", error: "Preparation session could not be updated" }, { status: 404 });
  } else {
    const { data, error } = await supabase.from("sessions").insert({ user_id: user.id, ...sessionFields }).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Failed to create session" }, { status: 500 });
    id = data.id;
  }
  if (!isContinuationJourney(journey) || inputsChanged) {
    // Continuation preserves practice history when the preparation inputs are unchanged.
    // If the candidate changed the CV/JD, the prior questions no longer match the analysis.
    await supabase.from("questions").delete().eq("session_id", id);
  }
  return NextResponse.json({ sessionId: id, analysis: validatedAnalysis });
}
