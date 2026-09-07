import OpenAI from "openai";
import type { SessionLanguage } from "@/types";

export function normalizeLanguage(value: unknown): SessionLanguage {
  return value === "fr" ? "fr" : "en";
}

export function languageInstruction(language: SessionLanguage): string {
  return language === "fr"
    ? "Write all candidate-facing text in French (Français). Keep JSON keys, field names, scores, evidence quotes, and structure exactly as specified."
    : "Write all candidate-facing text in English. Keep JSON keys, field names, scores, evidence quotes, and structure exactly as specified.";
}

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({ apiKey });
}

export const AI_MODEL = "gpt-4o-mini";

export async function generateCandidateAnalysis(cvText: string, jobDescription: string, targetRole: string, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an expert HR evaluator. ${languageInstruction(language)} Return a JSON object with alignment_score, summary, strengths, gaps, risks, keywords, and focus_areas.`,
      },
      {
        role: "user",
        content: `Target Role: ${targetRole}\nJob Description: ${jobDescription}\nCV: ${cvText}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content || "{}");
}

export async function generateInterviewStrategy(analysis: any, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an interview strategy coach. ${languageInstruction(language)} Return a JSON object with preparation_timeline, key_themes, focus_areas, potential_questions, and preparation_tips.`,
      },
      {
        role: "user",
        content: `Candidate Analysis: ${JSON.stringify(analysis)}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content || "{}");
}

export async function generateInterviewQuestions(analysis: any, strategy: any, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: `Generate 5 interview questions based on candidate analysis and strategy. ${languageInstruction(language)} Return a JSON object with a 'questions' key containing an array of strings.`,
      },
      {
        role: "user",
        content: `Analysis: ${JSON.stringify(analysis)}\nStrategy: ${JSON.stringify(strategy)}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content || "{\"questions\":[]}");
}

export async function evaluateAnswer(questionText: string, transcript: string, language: SessionLanguage = "en") {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: `Evaluate the interview candidate's response. ${languageInstruction(language)} Return a JSON object containing score, strengths, and areas_for_improvement.`,
      },
      {
        role: "user",
        content: `Question: ${questionText}\nCandidate Answer: ${transcript}`,
      },
    ],
    response_format: { type: "json_object" },
  });
  return JSON.parse(response.choices[0].message.content || "{}");
}
