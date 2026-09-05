import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { FeedbackResult, SessionRecord } from "@/types";

function fallbackFeedback(
  pairs: { question: string; answer: string }[]
): FeedbackResult {
  const evidenceHint = new RegExp(
    "\\b(result|improved|led|managed|increased|reduced|delivered|launched|implemented|designed|owned|success|metric|percentage|customers|impact|outcome)\\b",
    "i"
  );

  const questionFeedback = pairs.map((p) => {
    const answer = p.answer.trim();
    const hasEvidence = evidenceHint.test(answer);
    const baseScore = answer.length > 140 ? 64 : answer.length > 80 ? 58 : 50;
    const score = Math.min(88, baseScore + (hasEvidence ? 10 : 0));

    return {
      question: p.question,
      score,
      comment: hasEvidence
        ? "The answer includes concrete detail, but would be stronger by tightening the structure and making the role relevance explicit."
        : "The response needs more specific examples and outcome-focused evidence tied directly to the question.",
      keyStrength: hasEvidence
        ? "Includes concrete detail or result-oriented language."
        : "Attempts a direct response to the question.",
      keyImprovement: hasEvidence
        ? "Clarify how the experience aligns with the role and improve answer flow."
        : "Add a specific result, action, and clear connection to the job."
      ,
      suggestedRewrite: answer.length < 120
        ? "Start with your role and outcome, then describe what you did and the impact in a concise sequence."
        : "Keep the example focused: state the context, your action, and the measurable result more clearly.",
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
      "+ show reference to concrete experience when available.",
    ],
    improvements: [
      "Make the connection to the target role more explicit in each example.",
      "Use clear action-outcome language and avoid vague phrasing.",
      "Organize answers around the question asked with a concise opening statement.",
    ],
    sampleRewrite:
      "In my previous role, I led [team or initiative] to solve [challenge]. I did this by [action], which produced [outcome]. This experience maps to the role because [relevant connection].",
    questionFeedback,
    summary:
      "Good practice session. Focus next on stronger role alignment, evidence-based detail, and a clearer answer structure that directly answers each question.",
  };
}

async function generateFeedback(
  session: SessionRecord,
  pairs: { question: string; answer: string }[]
): Promise<FeedbackResult> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You are Interview Mirror's coaching engine. Use only evidence from the provided CV, job description, and candidate answers. Never invent credentials, employers, achievements, metrics, or experience.
Evaluate each answer using these principles:
1. QUESTION RESPONSIVENESS: Did the candidate answer the question asked?
2. RELEVANCE: Does the answer directly address the question and the job requirements?
3. EVIDENCE: Are there concrete examples, actions, outcomes, responsibilities, metrics, or specific experience? Distinguish specific evidence from generic claims.
4. STRUCTURE: Is the response organized logically? For behavioral questions, recognize STAR-style structure when appropriate without forcing it. Do not reward length by itself.
5. COMMUNICATION: Is the wording clear, concise, professional, and easy to follow?
6. ROLE ALIGNMENT: Does the answer demonstrate competencies relevant to the job description? Explain the connection to the job requirements when relevant.
7. CV CONSISTENCY: Is the answer consistent with the CV? If a claim cannot be verified from the CV, note that it should be substantiated rather than inventing or dismissing it.
8. COACHING VALUE: Provide actionable, specific advice rather than generic statements. Focus on the single most important improvement first.
When writing suggestedRewrite, use only information from the candidate's actual answer, CV, or job description. Never use placeholders such as [challenge], [action], [result], [team], or [metric]. Never invent facts, If important information is missing, explain what the candidate should add instead of inventing it.
Use a 0-100 scale consistently:
90-100 = exceptional
80-89 = strong with minor weaknesses
70-79 = solid but improvable
60-69 = mixed/average with important weaknesses
50-59 = weak
below 50 = poor or off-target
Do not inflate scores. Use the full scale and score based on the actual evidence in the answer.
For confidence, judge only wording, assertiveness, clarity, and avoidance of hedging. Do not infer actual vocal confidence. True vocal-confidence analysis should be added later when audio is implemented.

Return JSON with keys:
overallScore, communication, relevance, structure, confidence,
strengths, improvements, sampleRewrite,
questionFeedback: [{ question, score, comment, keyStrength?, keyImprovement?, suggestedRewrite? }],
summary.

For each question, ensure the response includes a clear strength, a concrete improvement, and a short suggested approach or rewrite when useful. Keep the sampleRewrite grounded in the candidate's actual experience and avoid inventing facts or new metrics.`,
        },
        {
          role: "user",
          content: `Role/session: ${session.title}
CV excerpt:\n${session.cv_text.slice(0, 6000)}
Job description:\n${session.job_description.slice(0, 4000)}
Q&A:\n${JSON.stringify(pairs)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    return JSON.parse(raw) as FeedbackResult;
  } catch {
    return fallbackFeedback(pairs);
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
    question: q.question as string,
    answer: (answerMap.get(q.id) as string) || "",
  }));
console.log("DEBUG pairs:", pairs);
  if (pairs.some((p) => !p.answer.trim())) {
    return NextResponse.json(
      { error: "Please answer all questions before requesting feedback" },
      { status: 400 }
    );
  }

  const feedback = await generateFeedback(session as SessionRecord, pairs);

  await supabase.from("feedback").delete().eq("session_id", id);

  const { error: insertError } = await supabase.from("feedback").insert({
    session_id: id,
    feedback,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
for (const improvementArea of feedback.improvements) {
  const { error: coachingError } = await supabase.rpc(
    "upsert_coaching_progress",
    {
      p_user_id: user.id,
      p_session_id: id,
      p_focus_area: improvementArea,
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
  await supabase
    .from("sessions")
    .update({ status: "completed" })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ feedback });
}
