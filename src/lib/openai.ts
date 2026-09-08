import OpenAI from "openai";
import type { SessionLanguage } from "@/types";

export function normalizeLanguage(value: unknown): SessionLanguage {
  return value === "fr" ? "fr" : "en";
}

export function languageInstruction(language: SessionLanguage): string {
  return language === "fr"
    ? "Write all candidate-facing text in French (Français). Address the candidate directly and professionally using 'vous', not third-person phrasing such as 'le candidat'. Keep JSON keys, field names, scores, evidence quotes, and structure exactly as specified."
    : "Write all candidate-facing text in English. Address the candidate directly and professionally using 'you', not third-person phrasing such as 'the candidate'. Keep JSON keys, field names, scores, evidence quotes, and structure exactly as specified.";
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
        content: `You are Interview Mirror's professional interview coach and diagnostic expert. ${languageInstruction(language)} Your job is to help the candidate understand what will matter in the interview and what to prepare next. Be direct, specific, and concise. Prefer "You have...", "Your gap is...", "Prepare to...", and "In the interview..." over third-person assessment language. Avoid corporate, audit-report, or HR jargon when a simpler coaching sentence is clearer. Preserve professional credibility for experienced candidates. Every gap, risk, strength, and recommendation must be grounded in the supplied CV and job description; never invent evidence. Return a JSON object with alignment_score, summary, strengths, gaps, risks, keywords, and focus_areas.`,
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
        content: `You are Interview Mirror's interview strategy coach. ${languageInstruction(language)} Turn the diagnostic into a practical preparation plan for the candidate. Speak directly to the candidate. Make each recommendation action-led and concise: start with a clear action, then give the evidence or reason that makes it relevant. Prefer "Prepare to...", "Lead with...", "Bridge this gap by...", and "Be ready to..." over phrases such as "It is recommended that the candidate..." or "The candidate should...". Avoid audit-report, HR, or consulting jargon. Do not weaken specificity or evidence grounding. Return a JSON object with preparation_timeline, key_themes, focus_areas, potential_questions, and preparation_tips.`,
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
        content: `You are Interview Mirror's interview practice coach. Generate exactly 5 interview questions, but ONLY from the current Interview Strategy. The Strategy is the source of truth for what this practice session should test. ${languageInstruction(language)} Return a JSON object with a 'questions' key containing an array of exactly 5 objects. Each object must contain exactly two string fields: 'question' and 'strategy_basis'.\n\nSTRICT PRACTICE RULES:\n- Every question must directly test, probe, or deepen a specific point already identified in the Interview Strategy. Do not introduce a new concern, competency, topic, or generic interview theme that the Strategy does not identify.\n- Each 'strategy_basis' must be copied VERBATIM from one existing string in the Strategy, so the question has an auditable reason for being asked. Do not paraphrase the basis.\n- Prioritize the Strategy's interviewPriorities, gapsOrRisks, likelyDifficultQuestions, storiesToPrepare, and strengthsToLeverage.\n- Use the Strategy's likelyDifficultQuestions as direct candidates where appropriate, then add targeted probes that deepen the same Strategy points.\n- Questions must be specific to this candidate and this target role. Use the CV evidence and JD only to make the Strategy-grounded question precise; do not use them to introduce unrelated topics.\n- If the Strategy identifies a gap or credibility risk, test it honestly without implying the candidate has experience that the Strategy says is missing.\n- Follow-up-style questions are allowed only when they remain tied to the same Strategy point.\n- Never ask generic questions simply because they are common interview questions.\n- Reject questions about unrelated teamwork, conflict, leadership, motivation, hobbies, strengths, weaknesses, or career goals unless that topic is explicitly represented in the Strategy.\n- Do not invent employers, achievements, metrics, tools, responsibilities, industry experience, stakeholders, or outcomes.\n- Candidate-facing questions must be entirely in the selected preparation language.\n- Do not mention the CV, job description, AI, Strategy, or documents in the question stem. Ask as a realistic interviewer would ask in the room.\n- A question is invalid if you cannot point to the exact Strategy string that justifies it.\n\nThe practice interview must feel like the candidate is being tested on the preparation plan they just received, not starting a separate generic interview.`
      },
      {
        role: "user",
        content: `CURRENT INTERVIEW STRATEGY (SOURCE OF TRUTH):\n${JSON.stringify(strategy)}\n\nPROFESSIONAL MIRROR DIAGNOSTIC (supporting context only):\n${JSON.stringify(analysis)}\n\nGenerate exactly 5 Strategy-grounded questions.`
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
        content: `You are Interview Mirror's interview coach reviewing a candidate's answer. ${languageInstruction(language)} Give direct, concise, actionable coaching rather than an assessment report. Tell the candidate what worked, what held the answer back, and the exact adjustment to make next time. Prefer "You..." and action verbs. Avoid third-person language, corporate jargon, and vague encouragement. Ground every point in the supplied question and answer. Return a JSON object containing score, strengths, and areas_for_improvement.`,
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
