import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStrategy, SessionRecord, CvAnalysis } from "@/types";

function canonicalize(value: string): string { return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value: string): string { return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`; }
function parseAnalysis(value: unknown): CvAnalysis | null { if (typeof value === "string") { try { return JSON.parse(value) as CvAnalysis; } catch { return null; } } return value && typeof value === "object" ? value as CvAnalysis : null; }
function hasValidProvenance(value: unknown, session: SessionRecord): boolean { const a = parseAnalysis(value); const p = a?.provenance; return Boolean(p && p.contract_version === "v5.1" && p.preparation_language === session.preparation_language && p.cv_content_hash === hash(session.cv_text) && p.jd_content_hash === hash(session.job_description)); }
function isValidStrategy(strategy: unknown): strategy is InterviewStrategy { if (!strategy || typeof strategy !== "object") return false; const s = strategy as any; const generic = /\b(clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|prepare examples|prepare simple examples|préparez des exemples|be ready|show your|connect your experience|reliez votre expérience|based on the cv|à partir du cv)\b/i; return typeof s.candidatePositioning === "string" && typeof s.strongestValueProposition === "string" && Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) && Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) && Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) && typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" && typeof s.personalization === "string" && !generic.test(JSON.stringify(s)); }
async function generateStrategy(session: SessionRecord): Promise<InterviewStrategy> {
  const openai = getOpenAI(); const language = normalizeLanguage(session.preparation_language);
  const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.1, messages: [
    { role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's senior interview strategy coach. Build a precise candidate-specific strategy from the current validated Professional Mirror diagnostic, CV, and JD. Candidate-facing text must be entirely in the selected language. Never invent facts. Return exactly: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization. Keep it concise, specific, action-led and evidence-grounded.` },
    { role: "user", content: `CV:\n${session.cv_text.slice(0,12000)}\n\nJOB DESCRIPTION:\n${session.job_description.slice(0,10000)}\n\nVALIDATED PROFESSIONAL MIRROR:\n${JSON.stringify(session.cv_analysis).slice(0,16000)}` }
  ]});
  const raw = completion.choices[0]?.message?.content; if (!raw) throw new Error("Empty AI response"); const parsed = JSON.parse(raw) as InterviewStrategy; if (!isValidStrategy(parsed)) throw new Error("Invalid strategy format"); return parsed;
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: session, error } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", user.id).single(); if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const record = session as SessionRecord; if (!hasValidProvenance(record.cv_analysis, record)) return NextResponse.json({ code: "ANALYSIS_PROVENANCE_INVALID", error: "The Professional Mirror analysis must be refreshed before an interview strategy can be generated." }, { status: 422 });
  if (isValidStrategy(record.interview_strategy)) return NextResponse.json({ strategy: record.interview_strategy });
  try {
    const strategy = await generateStrategy(record); const { error: updateError } = await supabase.from("sessions").update({ interview_strategy: strategy }).eq("id", id).eq("user_id", user.id); if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 }); return NextResponse.json({ strategy });
  } catch { return NextResponse.json({ code: "STRATEGY_GENERATION_FAILED", error: "We could not produce a reliable interview strategy. Please retry." }, { status: 422 }); }
}
