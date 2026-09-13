import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { FeedbackQuestion, FeedbackResult, SessionRecord } from "@/types";
import { createClient } from "@/lib/supabase/server";

function normalizeFocusKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function fallbackFeedback(pairs: { questionId: string; question: string; answer: string }[], language: "en" | "fr"): FeedbackResult {
  const isFrench = language === "fr";
  const evidenceHint = new RegExp("\\b(result|improved|led|managed|increased|reduced|delivered|launched|implemented|designed|owned|success|metric|percentage|customers|impact|outcome)\\b", "i");
  const questionFeedback: FeedbackQuestion[] = pairs.map((p) => {
    const answer = p.answer.trim(); const hasEvidence = evidenceHint.test(answer); const baseScore = answer.length > 140 ? 64 : answer.length > 80 ? 58 : 50; const score = Math.min(88, baseScore + (hasEvidence ? 10 : 0));
    return { questionId: p.questionId, question: p.question, questionText: p.question, candidateAnswer: answer,
      score, scoreDeductions: hasEvidence ? [isFrench ? "Le résultat et le lien avec le poste pourraient être plus explicites." : "The result and connection to the role could be more explicit."] : [isFrench ? "La réponse manque de preuves concrètes et de résultat." : "The answer lacks concrete evidence and an outcome."],
      evidenceExtracted: hasEvidence ? [answer] : [],
      comment: hasEvidence ? (isFrench ? "La réponse contient des éléments concrets, mais le lien avec le poste peut être renforcé." : "Your answer contains concrete detail, but the role connection can be stronger.") : (isFrench ? "Votre réponse a besoin d'un exemple plus précis et de preuves liées à la question." : "Your answer needs a more specific example and evidence tied to the question."),
      keyStrength: hasEvidence ? (isFrench ? "Vous apportez un détail concret ou axé sur les résultats." : "You include concrete or result-oriented detail.") : (isFrench ? "Vous répondez directement à la question." : "You attempt to answer directly."),
      keyImprovement: isFrench ? "Précisez votre action, le résultat et le lien avec le poste." : "Clarify your action, outcome, and connection to the role.",
      whatWorked: isFrench ? "Vous avez essayé de répondre directement." : "You addressed the question directly.",
      whatWasMissing: isFrench ? "Un résultat ou une preuve plus précise." : "A more specific result or piece of evidence.",
      actionableImprovement: isFrench ? "Présentez brièvement le problème, ce que vous avez fait, puis le résultat et son importance pour ce poste." : "State the problem briefly, explain what you did, then give the outcome and why it matters for this role.",
      suggestedRewrite: isFrench ? "Restez centré sur l'exemple et précisez le contexte, votre action et le résultat." : "Keep the example focused: give the context, your action, and the outcome.",
      evidenceGroundedBetterAnswer: isFrench ? "Construisez une réponse uniquement à partir de faits étayés par votre réponse ou votre CV; n'inventez aucun indicateur." : "Build the answer only from facts supported by your answer or CV; do not invent metrics." };
  });
  const overall = questionFeedback.length ? Math.min(85, Math.max(50, Math.round(questionFeedback.reduce((sum, q) => sum + q.score, 0) / questionFeedback.length))) : 50;
  return { overallScore: overall, communication: Math.min(90, overall + 2), relevance: Math.max(50, overall - 4), structure: Math.min(88, Math.max(0, overall - 1)), confidence: Math.min(90, overall + 1),
    strengths: isFrench ? ["Vous répondez directement aux questions.", "Vous utilisez des détails concrets lorsqu'ils sont disponibles."] : ["You address the questions directly.", "You use concrete detail when it is available."],
    improvements: isFrench ? ["Rendez le lien avec le poste plus explicite.", "Utilisez un langage clair centré sur l'action et le résultat.", "Répondez directement à chaque question avec une structure claire."] : ["Make the connection to the target role more explicit.", "Use clear action-and-outcome language.", "Answer each question directly with a clear structure."],
    sampleRewrite: isFrench ? "Présentez le contexte, votre action précise, le résultat et la pertinence pour le poste. Ajoutez uniquement des détails étayés." : "State the context, your specific action, the outcome, and why it is relevant to the role. Add only substantiated details.", questionFeedback,
    summary: isFrench ? "Concentrez-vous sur un meilleur lien avec le poste, des preuves étayées et une structure claire." : "Focus on stronger role alignment, substantiated evidence, and clearer structure." };
}

function normalizeAiFeedback(value: unknown, pairs: { questionId: string; question: string; answer: string }[]): FeedbackResult {
  if (!value || typeof value !== "object") throw new Error("Invalid AI feedback object");
  const raw = value as Partial<FeedbackResult> & { questionFeedback?: unknown };
  if (!Array.isArray(raw.questionFeedback) || raw.questionFeedback.length !== pairs.length) throw new Error("AI feedback question count does not match the interview");
  const rawItems = raw.questionFeedback as Record<string, unknown>[];
  const matchedItems = pairs.map((pair, index) => rawItems.find((item) => item?.questionId === pair.questionId) ?? rawItems.find((item) => item?.question === pair.question) ?? rawItems[index]);
  if (matchedItems.some((item) => !item)) throw new Error("AI feedback is missing question feedback");

  const rawQuestionScores = matchedItems.map((item) => Number(item?.score));
  if (rawQuestionScores.some((score) => !Number.isFinite(score) || score < 0 || score > 100)) throw new Error("AI feedback contains an invalid per-question score");

  const rawOverall = Number(raw.overallScore);
  if (!Number.isFinite(rawOverall) || rawOverall <= 0 || rawOverall > 100) throw new Error("AI feedback contains an invalid overall score");

  // Some model responses use a 0-10 scale even though the product contract is 0-100.
  // Detect that representation consistently and convert it once at the boundary.
  const questionUsesTenPointScale = rawOverall <= 10 && rawQuestionScores.every((score) => score <= 10);
  if (rawQuestionScores.every((score) => score === 0) && rawOverall > 0) throw new Error("AI feedback contains zero scores inconsistent with the overall score");
  const toProductScore = (score: number) => Math.round(questionUsesTenPointScale ? score * 10 : score);

  const normalizedItems: FeedbackQuestion[] = pairs.map((pair, index) => {
    const rawItem = matchedItems[index] as Record<string, unknown>;
    const scoreDeductions = Array.isArray(rawItem.scoreDeductions) ? rawItem.scoreDeductions.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 3) : [];
    const evidenceSpans = Array.isArray(rawItem.evidenceSpans) ? rawItem.evidenceSpans : [];
    const evidenceExtracted = evidenceSpans.map((span) => {
      if (!span || typeof span !== "object") throw new Error(`AI feedback contains invalid evidence span for question ${pair.questionId}`);
      const start = Number((span as Record<string, unknown>).start);
      const end = Number((span as Record<string, unknown>).end);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > pair.answer.length) throw new Error(`AI feedback contains invalid evidence span for question ${pair.questionId}`);
      return pair.answer.slice(start, end);
    });
    const comment = typeof rawItem.comment === "string" ? rawItem.comment.trim() : "";
    const whatWorked = typeof rawItem.whatWorked === "string" ? rawItem.whatWorked.trim() : "";
    const whatWasMissing = typeof rawItem.whatWasMissing === "string" ? rawItem.whatWasMissing.trim() : "";
    const actionableImprovement = typeof rawItem.actionableImprovement === "string" ? rawItem.actionableImprovement.trim() : "";
    const evidenceGroundedBetterAnswer = typeof rawItem.evidenceGroundedBetterAnswer === "string" ? rawItem.evidenceGroundedBetterAnswer.trim() : "";
    if (!scoreDeductions.length || !comment || !whatWorked || !whatWasMissing || !actionableImprovement || !evidenceGroundedBetterAnswer) throw new Error(`AI feedback is incomplete for question ${pair.questionId}`);
    if (evidenceExtracted.some((quote) => !pair.answer.includes(quote))) throw new Error(`AI feedback contains unsupported evidence for question ${pair.questionId}`);
    return { questionId: pair.questionId, question: pair.question, questionText: pair.question, candidateAnswer: pair.answer, score: toProductScore(rawQuestionScores[index]),
      scoreDeductions, evidenceExtracted,
      comment, keyStrength: typeof rawItem.keyStrength === "string" ? rawItem.keyStrength : undefined, keyImprovement: typeof rawItem.keyImprovement === "string" ? rawItem.keyImprovement : undefined,
      whatWorked, whatWasMissing,
      actionableImprovement, suggestedRewrite: typeof rawItem.suggestedRewrite === "string" ? rawItem.suggestedRewrite : undefined,
      evidenceGroundedBetterAnswer };
  });

  const numeric = (value: unknown, fallback: number) => { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(questionUsesTenPointScale ? n * 10 : n))) : fallback; };
  const overallScore = numeric(raw.overallScore, 0);
  if (!overallScore || !raw.summary || !Array.isArray(raw.strengths) || !Array.isArray(raw.improvements)) throw new Error("AI feedback is missing required fields");
  return { overallScore, communication: numeric(raw.communication, overallScore), relevance: numeric(raw.relevance, overallScore), structure: numeric(raw.structure, overallScore), confidence: numeric(raw.confidence, overallScore), strengths: raw.strengths.filter((v): v is string => typeof v === "string").slice(0, 5), improvements: raw.improvements.filter((v): v is string => typeof v === "string").slice(0, 5), sampleRewrite: String(raw.sampleRewrite ?? ""), questionFeedback: normalizedItems, summary: String(raw.summary), focusScore: raw.focusScore == null ? undefined : numeric(raw.focusScore, overallScore), focusEvidence: typeof raw.focusEvidence === "string" ? raw.focusEvidence : undefined, focusNextStep: typeof raw.focusNextStep === "string" ? raw.focusNextStep : undefined };
}

async function generateFeedback(session: SessionRecord, pairs: { questionId: string; question: string; answer: string }[]): Promise<{ feedback: FeedbackResult; usedFallback: boolean }> {
  try {
    const openai = getOpenAI(); const isCoachingSession = Boolean(session.coaching_focus); const coachingFocus = session.coaching_focus; const language = normalizeLanguage(session.preparation_language);
    const coachingInstruction = `${isCoachingSession ? `\nThis is a TARGETED COACHING session.\nThe coaching focus is: \"${coachingFocus}\".\nEvaluate primarily on this focus. Return focusScore, focusEvidence, and focusNextStep. Focus evidence must come from the answer and/or CV.` : ""}\n\nBefore returning the JSON, verify EVERY questionFeedback item. The following fields are mandatory and MUST contain substantive, question-specific, non-empty strings: comment, whatWorked, whatWasMissing, actionableImprovement, and evidenceGroundedBetterAnswer. scoreDeductions MUST contain at least one substantive, question-specific string. NEVER return empty strings, whitespace-only strings, an empty scoreDeductions array, or null for any of these mandatory question-level fields. If the candidate answer contains little or no usable evidence, do not leave a field empty; instead, provide a substantive limitation, explanation, or coaching instruction grounded in the available candidate answer, CV, question, and role context. Every field must address the specific question and candidate answer. Do not reuse generic text across different questions. evidenceSpans must be an array of objects using zero-based JavaScript UTF-16 offsets with an exclusive end index, measured against the corresponding candidateAnswer. Return [] when there is no usable evidence. Never use evidence from the CV, question, role, strategy, or any other context for evidenceSpans. When populated, every span must identify an exact substring of candidateAnswer.`;
    const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_schema", json_schema: { name: "interview_feedback", strict: true, schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        overallScore: { type: "integer" },
        communication: { type: "integer" },
        relevance: { type: "integer" },
        structure: { type: "integer" },
        confidence: { type: "integer" },
        strengths: { type: "array", items: { type: "string" } },
        improvements: { type: "array", items: { type: "string" } },
        sampleRewrite: { type: "string" },
        questionFeedback: { type: "array", items: {
          type: "object",
          additionalProperties: false,
          properties: {
            questionId: { type: "string" },
            question: { anyOf: [{ type: "string" }, { type: "null" }] },
            questionText: { type: "string" },
            candidateAnswer: { type: "string" },
            score: { type: "integer" },
            scoreDeductions: { type: "array", items: { type: "string" } },
            evidenceSpans: { type: "array", items: {
              type: "object",
              additionalProperties: false,
              properties: {
                start: { type: "integer" },
                end: { type: "integer" },
              },
              required: ["start", "end"],
            } },
            comment: { type: "string" },
            keyStrength: { anyOf: [{ type: "string" }, { type: "null" }] },
            keyImprovement: { anyOf: [{ type: "string" }, { type: "null" }] },
            whatWorked: { type: "string" },
            whatWasMissing: { type: "string" },
            actionableImprovement: { type: "string" },
            suggestedRewrite: { anyOf: [{ type: "string" }, { type: "null" }] },
            evidenceGroundedBetterAnswer: { type: "string" },
          },
          required: ["questionId", "question", "questionText", "candidateAnswer", "score", "scoreDeductions", "evidenceSpans", "comment", "keyStrength", "keyImprovement", "whatWorked", "whatWasMissing", "actionableImprovement", "suggestedRewrite", "evidenceGroundedBetterAnswer"],
        } },
        summary: { type: "string" },
        focusScore: { anyOf: [{ type: "integer" }, { type: "null" }] },
        focusEvidence: { anyOf: [{ type: "string" }, { type: "null" }] },
        focusNextStep: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["overallScore", "communication", "relevance", "structure", "confidence", "strengths", "improvements", "sampleRewrite", "questionFeedback", "summary", "focusScore", "focusEvidence", "focusNextStep"],
    } } }, temperature: 0.3, messages: [
      { role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's coaching engine. Speak directly to the candidate like a demanding but supportive professional interview coach, not like an HR or audit report. Use "you/vous" throughout candidate-facing feedback. Keep feedback concise and easy to scan. Use this coaching sequence for each answer: 1) whatWorked — what the candidate did well, 2) whatWasMissing — the most important missing element, and 3) actionableImprovement — the exact adjustment to make next time. Make actionableImprovement concrete and immediately usable, preferably with an action verb such as quantify, lead, clarify, structure, connect, or give an example. Use keyStrength and keyImprovement only to reinforce the same direct coaching message.\n\nUse only facts in the supplied CV, job description, and candidate answers. Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, or outcomes. Return evidenceSpans, not evidenceExtracted text. For evidenceSpans, return zero-based JavaScript UTF-16 offsets with an exclusive end index, measured against the corresponding candidateAnswer. Return [] when there is no usable evidence. Never use evidence from the CV, question, role, strategy, or any other context. scoreDeductions must contain at least one non-empty, question-specific reason why the score is not higher. comment, whatWorked, whatWasMissing, actionableImprovement, and evidenceGroundedBetterAnswer must all be non-empty and specific to this question and answer. Do not return generic text that could be reused for another question.\n\nFor every questionFeedback item, return exactly these fields: questionId, question, questionText, candidateAnswer, score, scoreDeductions, evidenceSpans, comment, keyStrength, keyImprovement, whatWorked, whatWasMissing, actionableImprovement, suggestedRewrite, and evidenceGroundedBetterAnswer. Copy questionId, questionText, and candidateAnswer exactly from input.\n\nevidenceGroundedBetterAnswer and sampleRewrite may use only facts explicitly present in the supplied CV or candidateAnswer. The CV verifies only facts explicitly present in the CV. A claim made only in candidateAnswer remains the candidate's claim, not a CV-verified fact; do not present it as CV-confirmed. Never add an unsupported metric, percentage, result, responsibility, credential, employer, tool, date, or outcome. If no metric is supplied, do not invent one.\n\nEvaluate responsiveness, role relevance, evidence, structure, communication, and role alignment without inflating scores. EVERY SCORE MUST BE AN INTEGER FROM 0 TO 100. Do not use a 0-10 scale. Return exactly one questionFeedback item per Q&A pair in order. For non-coaching sessions, focusScore, focusEvidence, and focusNextStep MUST be returned as null. For coaching sessions, they may contain their corresponding values. Avoid dense multi-sentence paragraphs when a short direct instruction is clearer.\n${coachingInstruction}\n\nReturn JSON: overallScore, communication, relevance, structure, confidence, strengths, improvements, sampleRewrite, questionFeedback, summary, focusScore, focusEvidence, focusNextStep.` },
      { role: "user", content: `Role/session: ${session.title}\nCV:\n${session.cv_text.slice(0, 6000)}\nJob description:\n${session.job_description.slice(0, 4000)}\nQ&A:\n${JSON.stringify(pairs.map(({ questionId, question, answer }) => ({ questionId, questionText: question, candidateAnswer: answer })))}` },
    ]});
    const raw = completion.choices[0]?.message?.content; if (!raw) throw new Error("Empty AI response"); return { feedback: normalizeAiFeedback(JSON.parse(raw), pairs), usedFallback: false };
  } catch (error) {
    console.error("[FEEDBACK FAILED]", error);
    throw new Error("FEEDBACK_GENERATION_FAILED");
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: session } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const { data: questions } = await supabase.from("questions").select("*").eq("session_id", id).order("order_index", { ascending: true });
  const { data: answers } = await supabase.from("answers").select("*").eq("session_id", id);
  if (!questions?.length) return NextResponse.json({ error: "No interview questions found" }, { status: 400 });
  const answerMap = new Map((answers ?? []).map((a) => [a.question_id, a.answer_text]));
  const pairs = questions.map((q) => ({ questionId: q.id as string, question: q.question as string, answer: (answerMap.get(q.id) as string) || "" }));
  if (pairs.some((p) => !p.answer.trim())) return NextResponse.json({ error: "Please answer all questions before requesting feedback" }, { status: 400 });
  let feedback: FeedbackResult;
  let usedFallback: boolean;
  try {
    ({ feedback, usedFallback } = await generateFeedback(session as SessionRecord, pairs));
  } catch (error) {
    if (error instanceof Error && error.message === "FEEDBACK_GENERATION_FAILED") {
      return NextResponse.json({ code: "FEEDBACK_GENERATION_FAILED", error: "We could not produce reliable interview feedback. Please retry." }, { status: 422 });
    }
    throw error;
  }
  await supabase.from("feedback").delete().eq("session_id", id);
  const { error: insertError } = await supabase.from("feedback").insert({ session_id: id, feedback });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  if (!usedFallback && session.coaching_focus) {
    const focusScore = feedback.focusScore ?? feedback.overallScore; const focusKey = normalizeFocusKey(session.coaching_focus);
    const { data: previousProgress, error: progressReadError } = await supabase.from("coaching_progress").select("baseline_score, latest_score, status, evidence").eq("user_id", user.id).eq("focus_key", focusKey).maybeSingle();
    if (progressReadError) return NextResponse.json({ error: "Failed to read coaching progress" }, { status: 500 });
    const baselineScore = previousProgress?.baseline_score ?? focusScore; const status = previousProgress ? (focusScore > baselineScore ? "improved" : "in_progress") : "identified";
    const { error: coachingError } = await supabase.rpc("upsert_coaching_progress", { p_user_id: user.id, p_session_id: id, p_focus_area: session.coaching_focus, p_focus_key: focusKey, p_status: status, p_score: focusScore, p_evidence: { coachingFocus: session.coaching_focus, focusScore, focusEvidence: feedback.focusEvidence ?? "", focusNextStep: feedback.focusNextStep ?? "", baselineScore, questionFeedback: feedback.questionFeedback }, p_coaching_action: feedback.focusNextStep ?? feedback.sampleRewrite });
    if (coachingError) return NextResponse.json({ error: "Failed to save coaching progress" }, { status: 500 });
  } else if (!usedFallback) {
    for (const improvementArea of feedback.improvements) {
      const focusKey = normalizeFocusKey(improvementArea);
      const { error: coachingError } = await supabase.rpc("upsert_coaching_progress", { p_user_id: user.id, p_session_id: id, p_focus_area: improvementArea, p_focus_key: focusKey, p_status: "identified", p_score: feedback.overallScore, p_evidence: { improvementArea, questionFeedback: feedback.questionFeedback, overallScore: feedback.overallScore }, p_coaching_action: feedback.sampleRewrite });
      if (coachingError) return NextResponse.json({ error: "Failed to save coaching progress" }, { status: 500 });
    }
  }
  await supabase.from("sessions").update({ status: "completed" }).eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ feedback });
}
