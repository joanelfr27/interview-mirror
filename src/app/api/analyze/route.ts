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

function extractStandaloneUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;

  try {
    const url = new URL(match[0]);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return match[0];
  } catch {
    return null;
  }
}
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

type AnalysisDiagnosticPredicates = {
  response_present: boolean;
  response_json_parseable: boolean;
  match_score_valid: boolean;
  strengths_array: boolean;
  gaps_array: boolean;
  keyword_alignment_array: boolean;
  summary_string: boolean;
  focus_areas_array: boolean;
  evidence_chain_array: boolean;
  evidence_chain_nonempty: boolean;
  evidence_item_shape: boolean;
  actionable_recommendations_non_generic: boolean;
  jd_grounding: boolean;
  cv_grounding: boolean;
  strengths_items_valid: boolean;
  gaps_items_valid: boolean;
  focus_area_items_valid: boolean;
};

type AnalysisInputFingerprint = {
  length: number;
  md5: string;
};

type AnalysisInputDiagnostics = {
  raw_request: {
    cv: AnalysisInputFingerprint;
    job_description: AnalysisInputFingerprint;
  };
  canonical: {
    cv: AnalysisInputFingerprint;
    job_description: AnalysisInputFingerprint;
  };
  reusable_cv_id: string;
};

type AnalysisFailureCode =
  | "EMPTY_AI_RESPONSE"
  | "INVALID_AI_JSON"
  | "INVALID_EVIDENCE_GROUNDED_ANALYSIS"
  | "ANALYSIS_RUNTIME_FAILURE";

class AnalysisFailure extends Error {
  readonly code: AnalysisFailureCode;
  readonly predicates: AnalysisDiagnosticPredicates | null;

  constructor(code: AnalysisFailureCode, predicates: AnalysisDiagnosticPredicates) {
    super(code);
    this.name = "AnalysisFailure";
    this.code = code;
    this.predicates = predicates;
  }
}

function md5(value: string): string {
  return createHash("md5").update(value, "utf8").digest("hex");
}

function inputFingerprint(value: string): AnalysisInputFingerprint {
  return {
    length: Array.from(value).length,
    md5: md5(value),
  };
}

function validateAnalysis(value: unknown, cvText: string, jobDescription: string): { valid: boolean; predicates: AnalysisDiagnosticPredicates } {
  const predicates: AnalysisDiagnosticPredicates = {
    response_present: value !== null && value !== undefined,
    response_json_parseable: true,
    match_score_valid: false,
    strengths_array: false,
    gaps_array: false,
    keyword_alignment_array: false,
    summary_string: false,
    focus_areas_array: false,
    evidence_chain_array: false,
    evidence_chain_nonempty: false,
    evidence_item_shape: false,
    actionable_recommendations_non_generic: false,
    jd_grounding: false,
    cv_grounding: false,
    strengths_items_valid: false,
    gaps_items_valid: false,
    focus_area_items_valid: false,
  };
  if (!value || typeof value !== "object") return { valid: false, predicates };

  const a = value as any;
  predicates.match_score_valid = Number.isFinite(Number(a.matchScore));
  predicates.strengths_array = Array.isArray(a.strengths);
  predicates.gaps_array = Array.isArray(a.gaps);
  predicates.keyword_alignment_array = Array.isArray(a.keywordAlignment);
  predicates.summary_string = typeof a.summary === "string";
  predicates.focus_areas_array = Array.isArray(a.suggestedFocusAreas);
  predicates.evidence_chain_array = Array.isArray(a.evidenceChain);
  predicates.evidence_chain_nonempty = predicates.evidence_chain_array && a.evidenceChain.length > 0;

  const generic = /\b(prepare examples|be ready|prepare for|show your|improve your|prepare simple examples|préparez des exemples|soyez prêt|améliorez votre|clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|based on the cv|à partir du cv)\b/i;
  const cvSource = canonicalize(cvText);
  const jdSource = canonicalize(jobDescription);
  let evidenceItemShape = true;
  let recommendationsNonGeneric = true;
  let jdGrounding = true;
  let cvGrounding = true;

  if (predicates.evidence_chain_array) {
    for (const item of a.evidenceChain) {
      const shapeValid = !!item
        && typeof item.jd_requirement === "string" && !!item.jd_requirement.trim()
        && typeof item.cv_evidence === "string" && !!item.cv_evidence.trim()
        && typeof item.gap_identified === "string" && !!item.gap_identified.trim()
        && typeof item.interview_implication === "string" && !!item.interview_implication.trim()
        && typeof item.actionable_recommendation === "string" && !!item.actionable_recommendation.trim();
      evidenceItemShape = evidenceItemShape && shapeValid;

      if (!shapeValid) {
        recommendationsNonGeneric = false;
        jdGrounding = false;
        cvGrounding = false;
        continue;
      }

      recommendationsNonGeneric = recommendationsNonGeneric && !generic.test(item.actionable_recommendation);
      const itemJdGrounded = !jdSource
        ? item.jd_requirement === "NO JOB DESCRIPTION PROVIDED"
        : item.jd_requirement !== NO_EVIDENCE && groundingOverlap(item.jd_requirement, jdSource) >= 0.20;
      const itemCvGrounded = item.cv_evidence === NO_EVIDENCE
        ? true
        : groundingOverlap(item.cv_evidence, cvSource) >= 0.20;
      jdGrounding = jdGrounding && itemJdGrounded;
      cvGrounding = cvGrounding && itemCvGrounded;
    }
  } else {
    evidenceItemShape = false;
    recommendationsNonGeneric = false;
    jdGrounding = false;
    cvGrounding = false;
  }

  predicates.evidence_item_shape = evidenceItemShape;
  predicates.actionable_recommendations_non_generic = recommendationsNonGeneric;
  predicates.jd_grounding = jdGrounding;
  predicates.cv_grounding = cvGrounding;
  predicates.strengths_items_valid = predicates.strengths_array && a.strengths.every((x: any) => typeof x === "string" && x.trim());
  predicates.gaps_items_valid = predicates.gaps_array && a.gaps.every((x: any) => typeof x === "string" && x.trim());
  predicates.focus_area_items_valid = predicates.focus_areas_array && a.suggestedFocusAreas.every((x: any) => typeof x === "string" && x.trim());

  return { valid: Object.values(predicates).every(Boolean), predicates };
}

async function runAnalysis(cvText: string, jobDescription: string, language: "en" | "fr", priorContext: { sessions: unknown[]; coaching_progress: unknown[] } | undefined, inputDiagnostics: AnalysisInputDiagnostics): Promise<CvAnalysis> {
  const openai = getOpenAI();
  try {
    const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.2, messages: [
      { role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's evidence-grounded candidate coach. Your job is to give the candidate a precise diagnostic of how their CV fits this specific job and what the interview is likely to test. The output must feel like expert coaching, not an ATS report or generic AI advice.\n\nCandidate-facing values must be entirely in the selected preparation language. Use short, clear, natural professional language. Avoid jargon, academic wording, consultant-style phrases, and abstract language. Explain practical next steps in terms the candidate can immediately understand. JSON keys remain exactly in English. Return exactly: matchScore, strengths, gaps, keywordAlignment, summary, suggestedFocusAreas, evidenceChain. EvidenceChain objects use exactly: jd_requirement, cv_evidence, gap_identified, interview_implication, actionable_recommendation.\n\nDIAGNOSTIC RULES:\n- When a job description is provided, judge each important JD requirement against the CV, not against general knowledge or prior context.
- When NO job description is provided, do not invent employer requirements. Set every evidenceChain.jd_requirement to exactly "NO JOB DESCRIPTION PROVIDED" and ground the analysis in the candidate CV, transferable interview competencies, and prior preparation context only.\n- Separate direct evidence, transferable/partial evidence, and missing evidence. Never turn a related job title or keyword into proof of a responsibility the CV does not state.\n- Do not inflate the match score. A strong candidate with material industry or responsibility gaps should not receive a near-perfect score.\n- Strengths must say WHAT matches and WHY, using concrete CV evidence.\n- Gaps must identify the specific requirement that is not clearly demonstrated and why it may matter in the interview.\n- KeywordAlignment must contain useful themes or capabilities, never raw filler words such as company, sector, manager, improve, services, or location names.\n- Summary must be 2-3 concise sentences explaining the candidate's strongest fit and most important risks.\n- SuggestedFocusAreas must be 3-5 prioritized preparation actions tied to real CV/JD evidence.\n\nEVIDENCE CHAIN RULES:\n- For every item, identify one concrete JD requirement and one concrete CV passage when evidence exists. Without a JD, use exactly "NO JOB DESCRIPTION PROVIDED" as jd_requirement.\n- When evidence is absent, use exactly "${NO_EVIDENCE}" and say so plainly.\n- State what the interviewer may test because of the evidence or gap.\n- Give one concrete preparation action that references the actual requirement and/or CV evidence.\n- Never invent employers, credentials, responsibilities, metrics, tools, industry experience, dates, stakeholders, or outcomes.\n- Avoid repetitive filler such as 'your CV shows a clear professional story', 'your experience is relevant', 'prepare examples', or 'connect your experience'.` },
      { role: "user", content: `CV:\n${cvText.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nPRIOR PREPARATION CONTEXT:\n${JSON.stringify(priorContext ?? { sessions: [], coaching_progress: [] }).slice(0, 12000)}\n\nAnalyze only the current CV and JD as evidence.` }
    ]});
    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new AnalysisFailure("EMPTY_AI_RESPONSE", {
        response_present: false, response_json_parseable: false, match_score_valid: false,
        strengths_array: false, gaps_array: false, keyword_alignment_array: false, summary_string: false,
        focus_areas_array: false, evidence_chain_array: false, evidence_chain_nonempty: false,
        evidence_item_shape: false, actionable_recommendations_non_generic: false, jd_grounding: false,
        cv_grounding: false, strengths_items_valid: false, gaps_items_valid: false, focus_area_items_valid: false,
      });
    }

    let parsed: CvAnalysis;
    try {
      parsed = JSON.parse(raw) as CvAnalysis;
    } catch {
      throw new AnalysisFailure("INVALID_AI_JSON", {
        response_present: true, response_json_parseable: false, match_score_valid: false,
        strengths_array: false, gaps_array: false, keyword_alignment_array: false, summary_string: false,
        focus_areas_array: false, evidence_chain_array: false, evidence_chain_nonempty: false,
        evidence_item_shape: false, actionable_recommendations_non_generic: false, jd_grounding: false,
        cv_grounding: false, strengths_items_valid: false, gaps_items_valid: false, focus_area_items_valid: false,
      });
    }

    const validation = validateAnalysis(parsed, cvText, jobDescription);
    if (!validation.valid) throw new AnalysisFailure("INVALID_EVIDENCE_GROUNDED_ANALYSIS", validation.predicates);
    return parsed;
  } catch (error) {
    const failure = error instanceof AnalysisFailure
      ? error
      : new AnalysisFailure("ANALYSIS_RUNTIME_FAILURE", {
          response_present: false,
          response_json_parseable: false,
          match_score_valid: false,
          strengths_array: false,
          gaps_array: false,
          keyword_alignment_array: false,
          summary_string: false,
          focus_areas_array: false,
          evidence_chain_array: false,
          evidence_chain_nonempty: false,
          evidence_item_shape: false,
          actionable_recommendations_non_generic: false,
          jd_grounding: false,
          cv_grounding: false,
          strengths_items_valid: false,
          gaps_items_valid: false,
          focus_area_items_valid: false,
        });
    console.error("[ANALYSIS DIAGNOSTIC]", JSON.stringify({
      code: failure.code,
      predicates: failure.predicates,
      inputs: inputDiagnostics,
    }));
    if (failure.code === "ANALYSIS_RUNTIME_FAILURE") {
      const runtimeError = error as {
        name?: unknown;
        status?: unknown;
        type?: unknown;
        code?: unknown;
        message?: unknown;
      };
      console.error("[ANALYSIS RUNTIME ERROR]", JSON.stringify({
        name: error instanceof Error ? error.name : typeof error,
        status: typeof runtimeError.status === "number" ? runtimeError.status : undefined,
        type: typeof runtimeError.type === "string" ? runtimeError.type : undefined,
        code: typeof runtimeError.code === "string" ? runtimeError.code : undefined,
        message: typeof runtimeError.message === "string" ? runtimeError.message.slice(0, 300) : undefined,
      }));
    }
    console.error("[ANALYSIS FAILED]", failure.code);
    throw new Error("ANALYSIS_GENERATION_FAILED");
  }
}

function buildProvenance(language: "en" | "fr", cvText: string, jobDescription: string): AnalysisProvenance { return { preparation_language: language, jd_content_hash: sha256(jobDescription), cv_content_hash: sha256(cvText), contract_version: CONTRACT_VERSION }; }

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const rawRequestCvText = typeof body.cvText === "string" ? body.cvText : "";
  const rawRequestJobDescription = typeof body.jobDescription === "string" ? body.jobDescription : "";
  const rawCvText = rawRequestCvText;
  let rawJobDescription = rawRequestJobDescription;
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
  let reusableCv: { id: string; storage_path: string | null };
  try {
    reusableCv = await ensureReusableCv(supabase, user.id, cvText, String(body.fileName ?? "CV"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to persist CV" }, { status: 500 });
  }

  const inputDiagnostics: AnalysisInputDiagnostics = {
    raw_request: {
      cv: inputFingerprint(rawRequestCvText),
      job_description: inputFingerprint(rawRequestJobDescription),
    },
    canonical: {
      cv: inputFingerprint(cvText),
      job_description: inputFingerprint(jobDescription),
    },
    reusable_cv_id: reusableCv.id,
  };
  console.info("[ANALYSIS INPUT DIAGNOSTIC]", JSON.stringify(inputDiagnostics));
  let priorContext: { sessions: unknown[]; coaching_progress: unknown[] } | undefined;
  if (!sessionId || journey === "continue_skills") {
    const { data, error } = await supabase.rpc("get_candidate_preparation_context", { p_user_id: user.id });
    if (!error && data) priorContext = journey === "continue_skills"
      ? { ...data, sessions: (data.sessions ?? []).filter((s: { id?: string }) => s.id !== sessionId) }
      : data;
  }
  const canonicalCv = cvDocument.text; const canonicalJd = jobDescriptionDocument?.text ?? "";
  let analysis: CvAnalysis;
  try { analysis = await runAnalysis(canonicalCv, canonicalJd, language, priorContext, inputDiagnostics); }
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
