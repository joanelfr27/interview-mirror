import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import type { FeedbackQuestion, FeedbackResult, SessionRecord } from "@/types";
import { createClient } from "@/lib/supabase/server";

function normalizeFocusKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fallbackFeedback(
  pairs: { questionId: string; question: string; answer: string }[]
): FeedbackResult {
  const evidenceHint = new RegExp(
    "\\b(result|improved|led|managed|increased|reduced|delivered|launched|implemented|designed|owned|success|metric|percentage|customers|impact|outcome)\\b",
    "i"
  );

  const questionFeedback: FeedbackQuestion[] = pairs.map((p) => {
    const answer = p.answer.trim();
    const hasEvidence = evidenceHint.test(answer);
    const baseScore = answer.length > 140 ? 64 : answer.length > 80 ? 58 : 50;
    const score = Math.min(88, baseScore + (hasEvidence ? 10 : 0));

    return {
      questionId: p.questionId,
      question: p.question,
      questionText: p.question,
      candidateAnswer: answer,
      score,
      scoreDeductions: hasEvidence
        ? ["The answer could make the result and role relevance more explicit."]
        : ["The answer does not provide enough concrete evidence or outcome detail."],
      evidenceExtracted: hasEvidence ? [answer] : [],
      comment: hasEvidence
        ? "The answer includes concrete detail, but would be stronger by tightening the structure and making the role relevance explicit."
        : "The response needs more specific examples and outcome-focused evidence tied directly to the question.",
      keyStrength: hasEvidence
        ? "Includes concrete detail or result-oriented language."
        : "Attempts a direct response to the question.",
      keyImprovement: hasEvidence
        ? "Clarify how the experience aligns with the role and improve answer flow."
        : "Add a specific result, action, and clear connection to the job.",
      whatWorked: hasEvidence
        ? "You included concrete detail or a result-oriented point."
        : "You made an attempt to answer the question directly.",
      whatWasMissing: hasEvidence
        ? "The answer needs a clearer result and connection to the role."
        : "A specific example, action, and outcome are missing.",
      actionableImprovement: hasEvidence
        ? "State the situation briefly, explain what you did, then finish with the result and why it matters for this role."
        : "Choose one real example and explain what you did and what changed because of your actions.",
      suggestedRewrite: answer.length < 120
        ? "Start with your role and outcome, then describe what you did and the impact in a concise sequence."
        : "Keep the example focused: state the context, your action, and the measurable result more clearly.",
      evidenceGroundedBetterAnswer: "Build the stronger answer only from facts you can substantiate from your answer and CV; do not add a new metric or achievement.",
    };
  });

  const overall = Math.min(85, Math.max(50, Math.round(
    questionFeedback.reduce((sum, q) => sum + q.score, 0) / questionFeedback.length
  )));

  return {
    overallScore: overall,
    communication: Math.min(90, overall + 2),
    relevance: Math.max(50, overall - 4),
    structure: Math.min(88, overall - 1),
    confidence: Math.min(90, overall + 1),
    strengths: [
      "Responses are complete and address the questions directly.",
      "Uses concrete experience or result-oriented detail when available.",
    ],
    improvements: [
      "Make the connection to the target role more explicit in each example.",
      "Use clear action-outcome language and avoid vague phrasing.",
      "Organize answers around the question asked with a concise opening statement.",
    ],
    sampleRewrite:
      "A stronger answer should state the context, your specific action, the outcome, and why the experience is relevant to the role. Add only details you can substantiate from your own experience.",
    questionFeedback,
    summary:
      "Good practice session. Focus next on stronger role alignment, evidence-based detail, and a clearer answer structure that directly answers each question.",
  };
}

function normalizeAiFeedback(
  value: unknown,
  pairs: { questionId: string; question: string; answer: string }[]
): FeedbackResult {
  if (!value || typeof value !== "object") throw new Error("Invalid AI feedback object");

  const raw = value as Partial<FeedbackResult> & { questionFeedback?: unknown };
  if (!Array.isArray(raw.questionFeedback) || raw.questionFeedback.length !== pairs.length) {
    throw new Error("AI feedback question count does not match the interview");
  }

  const rawItems = raw.questionFeedback as Record<string, unknown>[];
  const normalizedItems: FeedbackQuestion[] = pairs.map((pair, index) => {
    const rawItem = rawItems.find((item) => item?.questionId === pair.questionId)
      ?? rawItems.find((item) => item?.question === pair.question)
      ?? rawItems[index];

    return {
      questionId: pair.questionId,
      question: pair.question,
      questionText: pair.question,
      candidateAnswer: pair.answer,
      score: Number(rawItem?.score ?? 0),
      scoreDeductions: Array.isArray(rawItem?.scoreDeductions)
        ? rawItem.scoreDeductions.filter((v): v is string => typeof v === "string").slice(0, 3)
        : [],
      evidenceExtracted: Array.isArray(rawItem?.evidenceExtracted)
        ? rawItem.evidenceExtracted.filter((v): v is string => typeof v === "string").slice(0, 3)
        : [],
      comment: String(rawItem?.comment ?? ""),
      keyStrength: typeof rawItem?.keyStrength === "string" ? rawItem.keyStrength : undefined,
      keyImprovement: typeof rawItem?.keyImprovement === "string" ? rawItem.keyImprovement : undefined,
      whatWorked: typeof rawItem?.whatWorked === "string" ? rawItem.whatWorked : undefined,
      whatWasMissing: typeof rawItem?.whatWasMissing === "string" ? rawItem.whatWasMissing : undefined,
      actionableImprovement: typeof rawItem?.actionableImprovement === "string" ? rawItem.actionableImprovement : undefined,
      suggestedRewrite: typeof rawItem?.suggestedRewrite === "string" ? rawItem.suggestedRewrite : undefined,
      evidenceGroundedBetterAnswer: typeof rawItem?.evidenceGroundedBetterAnswer === "string" ? rawItem.evidenceGroundedBetterAnswer : undefined,
    };
  });

  const numeric = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
  };

  const overallScore = numeric(raw.overallScore, 0);
  if (!overallScore || !raw.summary || !Array.isArray(raw.strengths) || !Array.isArray(raw.improvements)) {
    throw new Error("AI feedback is missing required fields");
  }

  return {
    overallScore,
    communication: numeric(raw.communication, overallScore),
    relevance: numeric(raw.relevance, overallScore),
    structure: numeric(raw.structure, overallScore),
    confidence: numeric(raw.confidence, overallScore),
    strengths: raw.strengths.filter((v): v is string => typeof v === "string").slice(0, 5),
    improvements: raw.improvements.filter((v): v is string => typeof v === "string").slice(0, 5),
    sampleRewrite: String(raw.sampleRewrite ?? ""),
    questionFeedback: normalizedItems,
    summary: String(raw.summary),
    focusScore: raw.focusScore == null ? undefined : numeric(raw.focusScore, overallScore),
    focusEvidence: typeof raw.focusEvidence === "string" ? raw.focusEvidence : undefined,
    focusNextStep: typeof raw.focusNextStep === "string" ? raw.focusNextStep : undefined,
  };
}

async function generateFeedback(
  session: SessionRecord,
  pairs: { questionId: string; question: string; answer: string }[]
): Promise<{ feedback: FeedbackResult; usedFallback: boolean }> {
  try {
    const openai = getOpenAI();
    const isCoachingSession = Boolean(session.coaching_focus);
    const coachingFocus = session.coaching_focus;

    const coachingInstruction = isCoachingSession
      ? `
This is a TARGETED COACHING session.
The coaching focus is: "${coachingFocus}".
Evaluate the candidate primarily on demonstrated ability in THIS focus area. Do not let unrelated strengths inflate the focus assessment.
Return focusScore, focusEvidence, and focusNextStep. Focus evidence must come from the candidate's answer and/or CV; never invent it.`
      : "";

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are Interview Mirror's coaching engine. Your job is to help the candidate improve, not simply judge them.

EVIDENCE AND ANTI-FABRICATION RULES:
- Use only facts contained in the provided CV, job description, and candidate answers.
- Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, or outcomes.
- Cross-check every important candidate claim against the CV. If a claim is not confirmed by the CV, do not turn it into a fact; say that it should be substantiated by the candidate.
- evidenceExtracted must contain short exact quotes from the candidate's answer only. Do not paraphrase and do not invent quotes.
- A stronger answer may use a relevant fact from the CV even when the candidate omitted it, but only when the CV actually contains that fact.
- If neither the answer nor CV contains a needed detail, coach the candidate to add it rather than creating one.

SCORING:
Evaluate each answer on question responsiveness, relevance to the job, evidence, structure, communication, and role alignment.
90-100 exceptional; 80-89 strong; 70-79 solid but improvable; 60-69 mixed with important weaknesses; 50-59 weak; below 50 poor/off-target.
Do not inflate scores. Do not reward length by itself.
- Very short answers: identify the missing substance and score accordingly.
- Off-topic answers: penalize relevance clearly and explain what the question required.
- Rambling answers: penalize structure/communication and identify what to cut or prioritize.
- Empty answers should never be treated as good answers; normally they are rejected before this prompt is called.

COACHING LANGUAGE:
- Speak directly to the candidate using "you".
- Avoid HR/AI jargon.
- Prefer simple language such as "What worked", "What was missing", and "How to improve it".
- Do not assume the candidate knows STAR/CAR. When useful, say: "Problem → What you did → Result".
- State the interview impact/risk first, then the advice.
- Keep every per-question field concise so the response remains reliable for a full five-question interview.

QUESTION TRACEABILITY:
- Return exactly one questionFeedback item for each input Q&A pair, in the same order.
- Copy questionId, questionText, and candidateAnswer from the supplied pair.
- Provide evidenceExtracted (0-3 short exact quotes), scoreDeductions (0-3 concise reasons for deductions), whatWorked, whatWasMissing, actionableImprovement, and evidenceGroundedBetterAnswer.
- scoreDeductions must explain the most important reasons the score is not higher, not generic criticism.
- evidenceGroundedBetterAnswer must be a concise example/advice grounded only in the supplied answer/CV/JD. Never invent missing facts.
${coachingInstruction}

Return JSON with these keys:
overallScore, communication, relevance, structure, confidence,
strengths, improvements, sampleRewrite,
questionFeedback: [{ questionId, question, questionText, candidateAnswer, score, scoreDeductions, evidenceExtracted, comment, keyStrength, keyImprovement, whatWorked, whatWasMissing, actionableImprovement, suggestedRewrite, evidenceGroundedBetterAnswer }],
summary.
For a TARGETED COACHING session also return focusScore, focusEvidence, focusNextStep.`,
        },
        {
          role: "user",
          content: `Role/session: ${session.title}
Coaching focus: ${coachingFocus || "None — standard interview evaluation"}
CV excerpt:\n${session.cv_text.slice(0, 6000)}
Job description:\n${session.job_description.slice(0, 4000)}
Q&A:\n${JSON.stringify(pairs)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    return {
      feedback: normalizeAiFeedback(JSON.parse(raw), pairs),
      usedFallback: false,
    };
  } catch {
    return { feedback: fallbackFeedback(pairs), usedFallback: true };
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("session_id", id)
    .order("order_index", { ascending: true });

  const { data: answers } = await supabase
    .from("answers")
    .select("*")
    .eq("session_id", id);

  if (!questions?.length) {
    return NextResponse.json(
      { error: "No interview questions found" },
      { status: 400 }
    );
  }

  const answerMap = new Map(
    (answers ?? []).map((a) => [a.question_id, a.answer_text])
  );

  const pairs = questions.map((q) => ({
    questionId: q.id as string,
    question: q.question as string,
    answer: (answerMap.get(q.id) as string) || "",
  }));

  if (pairs.some((p) => !p.answer.trim())) {
    return NextResponse.json(
      { error: "Please answer all questions before requesting feedback" },
      { status: 400 }
    );
  }

  const { feedback, usedFallback } = await generateFeedback(session as SessionRecord, pairs);

  await supabase.from("feedback").delete().eq("session_id", id);

  const { error: insertError } = await supabase.from("feedback").insert({
    session_id: id,
    feedback,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  if (!usedFallback && session.coaching_focus) {
    const focusScore = feedback.focusScore ?? feedback.overallScore;
    const focusKey = normalizeFocusKey(session.coaching_focus);

    const { data: previousProgress, error: progressReadError } = await supabase
      .from("coaching_progress")
      .select("baseline_score, latest_score, status, evidence")
      .eq("user_id", user.id)
      .eq("focus_key", focusKey)
      .maybeSingle();

    if (progressReadError) {
      console.error("Failed to read coaching progress:", progressReadError);
      return NextResponse.json(
        { error: "Failed to read coaching progress" },
        { status: 500 }
      );
    }

    const baselineScore = previousProgress?.baseline_score ?? focusScore;
    const status = previousProgress
      ? focusScore > baselineScore
        ? "improved"
        : "in_progress"
      : "identified";

    const { error: coachingError } = await supabase.rpc(
      "upsert_coaching_progress",
      {
        p_user_id: user.id,
        p_session_id: id,
        p_focus_area: session.coaching_focus,
        p_focus_key: focusKey,
        p_status: status,
        p_score: focusScore,
        p_evidence: {
          coachingFocus: session.coaching_focus,
          focusScore,
          focusEvidence: feedback.focusEvidence ?? "",
          focusNextStep: feedback.focusNextStep ?? "",
          baselineScore,
          questionFeedback: feedback.questionFeedback,
        },
        p_coaching_action: feedback.focusNextStep ?? feedback.sampleRewrite,
      }
    );

    if (coachingError) {
      console.error("Failed to save coaching progress:", coachingError);
      return NextResponse.json(
        { error: "Failed to save coaching progress" },
        { status: 500 }
      );
    }
  } else if (!usedFallback) {
    for (const improvementArea of feedback.improvements) {
      const focusKey = normalizeFocusKey(improvementArea);
      const { error: coachingError } = await supabase.rpc(
        "upsert_coaching_progress",
        {
          p_user_id: user.id,
          p_session_id: id,
          p_focus_area: improvementArea,
          p_focus_key: focusKey,
          p_status: "identified",
          p_score: feedback.overallScore,
          p_evidence: {
            improvementArea,
            questionFeedback: feedback.questionFeedback,
            overallScore: feedback.overallScore,
          },
          p_coaching_action: feedback.sampleRewrite,
        }
      );

      if (coachingError) {
        console.error("Failed to save coaching progress:", coachingError);
        return NextResponse.json(
          { error: "Failed to save coaching progress" },
          { status: 500 }
        );
      }
    }
  }

  await supabase
    .from("sessions")
    .update({ status: "completed" })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ feedback });
}
