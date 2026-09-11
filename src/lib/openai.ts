import OpenAI from "openai";
import type { SessionLanguage } from "@/types";

export function normalizeLanguage(value: unknown): SessionLanguage { return value === "fr" ? "fr" : "en"; }
export function languageInstruction(language: SessionLanguage): string {
  return language === "fr"
    ? "Write ALL candidate-facing text only in natural, professional French (Français). Address the candidate directly using 'vous'. Use short, clear sentences and everyday professional words. Avoid jargon, academic language, consultant-style wording, and unnecessary technical terms. Do not translate English phrases literally. Never include candidate-facing English. JSON keys, field names, scores, evidence quotes, and structure must remain exactly as specified; evidence quotes may remain verbatim source text when explicitly requested."
    : "Write ALL candidate-facing text only in clear, natural professional English. Address the candidate directly using 'you'. Use short, clear sentences and everyday professional words. Avoid jargon, academic language, consultant-style wording, and unnecessary technical terms. Never include candidate-facing French. JSON keys, field names, scores, evidence quotes, and structure must remain exactly as specified; evidence quotes may remain verbatim source text when explicitly requested.";
}
export const candidateStyleInstruction = "Keep candidate-facing writing concise and practical. Prefer simple verbs and short sentences. Explain what the candidate should do, not abstract concepts. Do not use phrases such as 'value proposition', 'competency alignment', 'strategic positioning', 'stakeholder alignment', or similar consultant/academic jargon unless the source itself requires the exact term.";
export function getOpenAI() { const apiKey = process.env.OPENAI_API_KEY; if (!apiKey) throw new Error("OPENAI_API_KEY is not configured"); return new OpenAI({ apiKey }); }
export const AI_MODEL = "gpt-4o-mini";

export async function generateCandidateAnalysis(cvText: string, jobDescription: string, targetRole: string, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({ model: AI_MODEL, temperature: 0.1, response_format: { type: "json_object" }, messages: [
    { role: "system", content: `You are Interview Mirror's evidence-grounded professional interview coach. ${languageInstruction(language)} ${candidateStyleInstruction} Analyze the supplied CV against this specific job only. Every candidate-facing field must be in the selected preparation language. Use semantic assessment, never keyword counting or a default score. Ground every claim in the supplied CV/JD and never invent facts. Return JSON only.` },
    { role: "user", content: `Target Role: ${targetRole}\nJob Description: ${jobDescription}\nCV: ${cvText}` }
  ]});
  return JSON.parse(response.choices[0]?.message?.content || "{}");
}

export async function generateInterviewStrategy(analysis: any, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({ model: AI_MODEL, temperature: 0.1, response_format: { type: "json_object" }, messages: [
    { role: "system", content: `You are Interview Mirror's senior interview strategy coach. ${languageInstruction(language)} ${candidateStyleInstruction} Turn the validated diagnostic into a precise, practical preparation strategy. Use only evidence in the diagnostic. Never invent credentials, achievements, metrics, tools, responsibilities, dates, or outcomes. Return exactly these JSON keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization.` },
    { role: "user", content: `Validated Professional Mirror diagnostic:\n${JSON.stringify(analysis)}` }
  ]});
  return JSON.parse(response.choices[0]?.message?.content || "{}");
}

export async function generateInterviewQuestions(analysis: any, strategy: any, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({ model: AI_MODEL, temperature: 0.1, response_format: { type: "json_object" }, messages: [
    { role: "system", content: `You are Interview Mirror's interview practice coach. Generate exactly 5 questions ONLY from the current Interview Strategy. ${languageInstruction(language)} ${candidateStyleInstruction} Every question must test a specific Strategy point. Each strategy_basis must be copied verbatim from an existing Strategy string. Candidate-facing questions must be entirely in the selected language. Do not introduce unrelated or generic topics. Return {"questions":[{"question":"...","strategy_basis":"..."}]} and nothing else.` },
    { role: "user", content: `CURRENT INTERVIEW STRATEGY:\n${JSON.stringify(strategy)}\n\nSUPPORTING DIAGNOSTIC:\n${JSON.stringify(analysis)}` }
  ]});
  return JSON.parse(response.choices[0]?.message?.content || "{\"questions\":[]}");
}

export async function evaluateAnswer(questionText: string, transcript: string, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({ model: AI_MODEL, temperature: 0.1, response_format: { type: "json_object" }, messages: [
    { role: "system", content: `You are Interview Mirror's interview coach reviewing a candidate's answer. ${languageInstruction(language)} ${candidateStyleInstruction} Give direct, concise, actionable coaching grounded in the supplied question and answer. Return JSON containing score, strengths, and areas_for_improvement.` },
    { role: "user", content: `Question: ${questionText}\nCandidate Answer: ${transcript}` }
  ]});
  return JSON.parse(response.choices[0]?.message?.content || "{}");
}
