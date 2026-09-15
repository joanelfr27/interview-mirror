import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { FeedbackQuestion, FeedbackResult, SessionRecord } from "@/types";
import { createClient } from "@/lib/supabase/server";

function normalizeFocusKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function fallbackFeedback(pairs: { questionId: string; question: string; answer: string }[], language: "en" | "fr"): FeedbackResult {
  const isFrench = language === "fr";
  const evidenceHint = new RegExp("\\b(result|improved|led|managed|increased|reduced|delivered|launched|implemented|designed|owned|success|metric|percentage|customers|impact|outcome|launched|implemented)\\b", "i");
  const questionFeedback: FeedbackQuestion[] = pairs.map((p) => {
    const answer = p.answer.trim(); const hasEvidence = evidenceHint.test(answer); const baseScore = answer.length > 140 ? 64 : answer.length > 80 ? 58 : 50; const score = Math.min(88, baseScore + (hasEvidence ? 10 : 0));
    return { questionId: p.questionId, question: p.question, questionText: p.question, candidateAnswer: answer,
      score, scoreDeductions: hasEvidence ? [isFrench ? "Le résultat et le lien avec le poste pourraient être plus explicites." : "The result and connection to the role could be more explicit."] : [isFrench ? "La réponse manque de preuves concrètes et de résultat." : "The answer lacks concrete evidence and an outcome."],
      evidenceExtracted: hasEvidence ? [answer] : [], evidenceStatus: "no_material_evidence",
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
  return { overallScore: overall, communication: Math.min(90, overall + 2), relevance: Math.max(50, overall - 4), structure: Math.min(88, Math.max(0, overall - 1)), confidence: Math.min(90, overall + 1), strengths: isFrench ? ["Vous répondez directement aux questions.", "Vous utilisez des détails concrets lorsqu'ils sont disponibles."] : ["You address the questions directly.", "You use concrete detail when it is available."], improvements: isFrench ? ["Rendez le lien avec le poste plus explicite.", "Utilisez un langage clair centré sur l'action et le résultat.", "Répondez directement à chaque question avec une structure claire."] : ["Make the connection to the target role more explicit.", "Use clear action-and-outcome language.", "Answer each question directly with a clear structure."], sampleRewrite: isFrench ? "Présentez le contexte, votre action précise, le résultat et la pertinence pour le poste. Ajoutez uniquement des détails étayés." : "State the context, your specific action, the outcome, and why it is relevant to the role. Add only substantiated details.", questionFeedback, summary: isFrench ? "Concentrez-vous sur un meilleur lien avec le poste, des preuves étayées et une structure claire." : "Focus on stronger role alignment, substantiated evidence, and clearer structure." };
}

type FeedbackPair = { questionId: string; question: string; answer: string };
type QuestionEvaluation = { feedback: FeedbackQuestion; communication: number; relevance: number; structure: number; confidence: number };

function average(values: number[]): number {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function enforceFeedbackQuality(evaluation: QuestionEvaluation, pair: FeedbackPair, language: "en" | "fr"): QuestionEvaluation {
  const feedback = evaluation.feedback;
  const anchor = (feedback.evidenceExtracted?.[0] || pair.answer.trim()).slice(0, 180).trim();
  const isFrench = language === "fr";
  const claimNote = feedback.evidenceStatus === "candidate_claim" || feedback.evidenceStatus === "mixed"
    ? (isFrench ? `Preuve non confirmée par le CV : vous indiquez « ${anchor} ». Cette information doit être présentée comme une déclaration de votre part, pas comme une expérience vérifiée.` : `Evidence not confirmed by the CV: you stated, “${anchor}”. Treat this as your stated claim, not verified experience.`)
    : "";
  const generic = /\b(add an example|provide an example|be more specific|add more detail|provide evidence|include an example)\b|\b(ajoutez un exemple|ajouter un exemple|ajoutez des exemples|ajouter des exemples|soyez plus précis|précisez davantage|ajoutez plus de détails|fournissez des preuves|incluez un exemple|inclure un exemple)\b/i;
  const fields = ["comment", "whatWorked", "whatWasMissing", "actionableImprovement", "scoreDeductions", "keyStrength", "keyImprovement", "suggestedRewrite", "evidenceGroundedBetterAnswer"] as const;
  const next = { ...feedback } as FeedbackQuestion;
  for (const field of fields) {
    const value = next[field];
    if (typeof value === "string" && generic.test(value)) {
      next[field] = `${value} ${isFrench ? `Dans votre réponse, vous avez indiqué « ${anchor} » ; pour cette question, développez précisément cet élément et montrez comment il répond à la compétence demandée.` : `In your answer, you stated “${anchor}”; for this question, develop that specific point and show how it demonstrates the competency being tested.`}` as never;
    }
  }
  if (claimNote) {
    next.comment = `${claimNote} ${next.comment}`;
    next.whatWorked = `${claimNote} ${next.whatWorked}`;
    next.whatWasMissing = `${claimNote} ${next.whatWasMissing}`;
    next.actionableImprovement = `${claimNote} ${next.actionableImprovement}`;
    next.keyStrength = next.keyStrength ? `${claimNote} ${next.keyStrength}` : claimNote;
    next.keyImprovement = next.keyImprovement ? `${claimNote} ${next.keyImprovement}` : claimNote;
    next.suggestedRewrite = next.suggestedRewrite ? `${claimNote} ${next.suggestedRewrite}` : claimNote;
    next.evidenceGroundedBetterAnswer = `${claimNote} ${next.evidenceGroundedBetterAnswer}`;
  }
  return { ...evaluation, feedback: next };
}

function normalizeQuestionFeedback(value: unknown, pair: FeedbackPair): QuestionEvaluation {
  if (!value || typeof value !== "object") throw new Error(`Invalid AI feedback for question ${pair.questionId}`);
  const raw = value as Record<string, unknown>;
  const item = raw.questionFeedback && Array.isArray(raw.questionFeedback) ? raw.questionFeedback[0] : raw;
  if (!item || typeof item !== "object") throw new Error(`AI feedback is missing question ${pair.questionId}`);
  const rawItem = item as Record<string, unknown>;
  const score = Number(rawItem.score);
  const communication = Number(rawItem.communication);
  const relevance = Number(rawItem.relevance);
  const structure = Number(rawItem.structure);
  const confidence = Number(rawItem.confidence);
  if (![score, communication, relevance, structure, confidence].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error(`AI feedback contains an invalid score for question ${pair.questionId}`);
  const scoreDeductions = Array.isArray(rawItem.scoreDeductions) ? rawItem.scoreDeductions.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 3) : [];
  const evidenceSpans = Array.isArray(rawItem.evidenceSpans) ? rawItem.evidenceSpans : [];
  const evidenceExtracted = evidenceSpans.map((span) => {
    if (!span || typeof span !== "object") throw new Error(`AI feedback contains invalid evidence span for question ${pair.questionId}`);
    const start = Number((span as Record<string, unknown>).start); const end = Number((span as Record<string, unknown>).end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > pair.answer.length) throw new Error(`AI feedback contains invalid evidence span for question ${pair.questionId}`);
    return pair.answer.slice(start, end);
  });
  const evidenceStatus = rawItem.evidenceStatus;
  if (evidenceStatus !== "cv_verified" && evidenceStatus !== "candidate_claim" && evidenceStatus !== "mixed" && evidenceStatus !== "no_material_evidence") throw new Error(`AI feedback contains an invalid evidence status for question ${pair.questionId}`);
  const text = (key: string) => typeof rawItem[key] === "string" ? String(rawItem[key]).trim() : "";
  const comment = text("comment"); const whatWorked = text("whatWorked"); const whatWasMissing = text("whatWasMissing"); const actionableImprovement = text("actionableImprovement"); const evidenceGroundedBetterAnswer = text("evidenceGroundedBetterAnswer");
  if (!scoreDeductions.length || !comment || !whatWorked || !whatWasMissing || !actionableImprovement || !evidenceGroundedBetterAnswer) throw new Error(`AI feedback is incomplete for question ${pair.questionId}`);
  if (evidenceExtracted.some((quote) => !pair.answer.includes(quote))) throw new Error(`AI feedback contains unsupported evidence for question ${pair.questionId}`);
  const boundedDimension = (value: number) => Math.max(score - 12, Math.min(score + 12, Math.round(value)));
  return { feedback: {
    questionId: pair.questionId, question: pair.question, questionText: pair.question, candidateAnswer: pair.answer,
    score: Math.round(score), scoreDeductions, evidenceExtracted, evidenceStatus, comment,
    keyStrength: text("keyStrength") || undefined, keyImprovement: text("keyImprovement") || undefined,
    whatWorked, whatWasMissing, actionableImprovement, suggestedRewrite: text("suggestedRewrite") || undefined, evidenceGroundedBetterAnswer,
  }, communication: boundedDimension(communication), relevance: boundedDimension(relevance), structure: boundedDimension(structure), confidence: boundedDimension(confidence) };
}

async function generateFeedback(session: SessionRecord, pairs: FeedbackPair[]): Promise<{ feedback: FeedbackResult; usedFallback: boolean }> {
  try {
    const openai = getOpenAI();
    const language = normalizeLanguage(session.preparation_language);
    const isCoachingSession = Boolean(session.coaching_focus);
    const coachingFocus = session.coaching_focus;
    const coachingInstruction = isCoachingSession
      ? `\nThis is a TARGETED COACHING session. The coaching focus is: "${coachingFocus}". Evaluate this answer primarily on that focus.`
      : "";

    const questionSchema = {
      type: "object", additionalProperties: false,
      properties: {
        questionId: { type: "string" }, question: { type: "string" }, questionText: { type: "string" }, candidateAnswer: { type: "string" },
        score: { type: "integer" }, communication: { type: "integer" }, relevance: { type: "integer" }, structure: { type: "integer" }, confidence: { type: "integer" },
        scoreDeductions: { type: "array", items: { type: "string" } },
        evidenceSpans: { type: "array", items: { type: "object", additionalProperties: false, properties: { start: { type: "integer" }, end: { type: "integer" } }, required: ["start", "end"] } },
        evidenceStatus: { type: "string", enum: ["cv_verified", "candidate_claim", "mixed", "no_material_evidence"] },
        comment: { type: "string" }, keyStrength: { type: "string" }, keyImprovement: { type: "string" }, whatWorked: { type: "string" }, whatWasMissing: { type: "string" }, actionableImprovement: { type: "string" }, suggestedRewrite: { type: "string" }, evidenceGroundedBetterAnswer: { type: "string" },
      },
      required: ["questionId", "question", "questionText", "candidateAnswer", "score", "communication", "relevance", "structure", "confidence", "scoreDeductions", "evidenceSpans", "evidenceStatus", "comment", "keyStrength", "keyImprovement", "whatWorked", "whatWasMissing", "actionableImprovement", "suggestedRewrite", "evidenceGroundedBetterAnswer"],
    };

    const systemPrompt = `${languageInstruction(language)}\n\nYou are Interview Mirror's coaching engine. Evaluate ONLY the candidate answer supplied for the specific question. Do not evaluate the whole interview. Speak directly to the candidate using "you/vous". Keep feedback concise and specific.\n\nUse only facts in the supplied CV, job description, and candidate answer. Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, or outcomes. Evidence spans must use zero-based JavaScript UTF-16 offsets with an exclusive end index against candidateAnswer only. Return [] when there is no usable evidence.\n\nEVIDENCE STATUS: compare the candidate answer with the CV. Use cv_verified only when the relevant claim is explicitly supported by the CV; candidate_claim when the claim is stated by the candidate but not supported by the CV; mixed when both occur; no_material_evidence when there is no material factual evidence. Candidate claims are not CV facts. For candidate_claim or mixed, candidate-facing feedback MUST explicitly distinguish the candidate's statement from verified CV evidence: use wording equivalent to "you stated..." / "vous indiquez..." and identify what would verify the claim. NEVER describe a candidate-only claim as "your experience", "your background", or an established fact.\n\nANSWER-SPECIFICITY: diagnose THIS answer, not the topic generally. Every comment, whatWorked, whatWasMissing, actionableImprovement, and scoreDeductions must name the actual statement, action, limitation, example, or omission that caused the assessment. Do not use generic advice such as "add an example", "be more specific", "add more detail", or "provide evidence" by itself. If an example or evidence is missing, state exactly what example/evidence is missing from THIS answer and why it matters for THIS question. If the answer contains a candidate-only claim, the missing element may be verification of that specific claim. The coaching instruction must tell the candidate the single most useful adjustment to make on the next attempt.\n\nSCORING: score the answer independently from 0-100 using responsiveness, demonstrated evidence, role alignment, structure, credibility, and written communication. Do not score by length or by the strength of the CV. 90-100 strong; 75-89 good with material gaps; 60-74 partial; 40-59 weak; 0-39 largely non-responsive or unsupported. scoreDeductions must state why THIS answer is not higher. The dimension scores communication, relevance, structure, and confidence must also reflect THIS answer only; do not infer vocal or body-language confidence from text.\n\nThe stronger-answer fields are coaching guidance, not a script. suggestedRewrite must be a short structural blueprint using only facts supported by the CV or candidate answer. If no metric/result was supplied, instruct the candidate to add one they can substantiate rather than inventing one.\n${coachingInstruction}`;

    const evaluations = await Promise.all(pairs.map(async (pair) => {
      const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        response_format: { type: "json_schema", json_schema: { name: "interview_question_feedback", strict: true, schema: questionSchema } },
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Role/session: ${session.title}\nCV:\n${session.cv_text.slice(0, 6000)}\nJob description:\n${session.job_description.slice(0, 4000)}\nQuestion ID: ${pair.questionId}\nQuestion: ${pair.question}\nCandidate answer:\n${pair.answer}` },
        ],
      });
      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error(`Empty AI response for question ${pair.questionId}`);
      return enforceFeedbackQuality(normalizeQuestionFeedback(JSON.parse(raw), pair), pair, language);
    }));

    const questionFeedback = evaluations.map((evaluation) => evaluation.feedback);
    const overallScore = average(questionFeedback.map((item) => item.score));
    const strengths = questionFeedback.map((item) => item.keyStrength).filter((value): value is string => Boolean(value)).slice(0, 5);
    const improvements = questionFeedback.map((item) => item.keyImprovement).filter((value): value is string => Boolean(value)).slice(0, 5);
    const missing = questionFeedback.map((item) => item.whatWasMissing).filter(Boolean).slice(0, 3);
    const summary = missing.length ? missing.join(" ") : (language === "fr" ? "Les réponses ont été évaluées question par question à partir des éléments effectivement démontrés." : "The answers were evaluated question by question from the evidence actually demonstrated.");
    const sampleRewrite = language === "fr"
      ? "Pour chaque réponse: contexte bref → action personnelle → preuve ou résultat vérifiable → lien avec la compétence demandée."
      : "For each answer: brief context → your action → verifiable evidence or outcome → connection to the competency being tested.";
    const focusEvaluation = isCoachingSession ? evaluations.find((evaluation) => evaluation.feedback.whatWasMissing) : undefined;
    const feedback: FeedbackResult = {
      overallScore,
      communication: average(evaluations.map((evaluation) => evaluation.communication)),
      relevance: average(evaluations.map((evaluation) => evaluation.relevance)),
      structure: average(evaluations.map((evaluation) => evaluation.structure)),
      confidence: average(evaluations.map((evaluation) => evaluation.confidence)),
      strengths,
      improvements,
      sampleRewrite,
      questionFeedback,
      summary,
      focusScore: isCoachingSession ? (focusEvaluation?.feedback.score ?? overallScore) : undefined,
      focusEvidence: isCoachingSession ? (focusEvaluation?.feedback.evidenceExtracted?.join(" ") || undefined) : undefined,
      focusNextStep: isCoachingSession ? (focusEvaluation?.feedback.actionableImprovement || undefined) : undefined,
    };
    return { feedback, usedFallback: false };
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
  let feedback: FeedbackResult; let usedFallback: boolean;
  try { ({ feedback, usedFallback } = await generateFeedback(session as SessionRecord, pairs)); }
  catch (error) { if (error instanceof Error && error.message === "FEEDBACK_GENERATION_FAILED") return NextResponse.json({ code: "FEEDBACK_GENERATION_FAILED", error: "We could not produce reliable interview feedback. Please retry." }, { status: 422 }); throw error; }
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