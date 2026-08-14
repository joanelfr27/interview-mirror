import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { SessionRecord } from "@/types";

type MessagePayload = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GeneratedQuestion = { question: string; category: string };

function fallbackQuestions(session: SessionRecord): GeneratedQuestion[] {
  const focus =
    session.cv_analysis?.suggestedFocusAreas?.[0] ?? "impact and leadership";
  return [
    {
      category: "behavioral",
      question:
        "Tell me about yourself and how your experience maps to this role.",
    },
    {
      category: "behavioral",
      question:
        "Describe a project where you delivered measurable impact. What was your role?",
    },
    {
      category: "situational",
      question:
        "Walk me through how you would prioritize competing stakeholder needs in the first 90 days.",
    },
    {
      category: "depth",
      question: `How have you developed strength in ${focus}? Share a concrete example.`,
    },
    {
      category: "motivation",
      question:
        "Why this role, and what evidence from your background supports that fit?",
    },
  ];
}

async function generateQuestions(
  session: SessionRecord
): Promise<GeneratedQuestion[]> {
  try {
    const openai = getOpenAI();
    const systemPrompt = `You are an expert interview coach for Interview Mirror.
Generate exactly 5 interview questions tailored to the CV, job description, and interview strategy.
Never invent employer names or credentials not present in the CV.
Use the strategy to prioritize questions that test strengths, probe gaps, and validate the candidate's positioning.
Return JSON: { "questions": [ { "question": string, "category": string } ] }
Categories: behavioral | situational | technical | depth | motivation`;

    const userPrompt = `Title: ${session.title}
CV:\n${session.cv_text.slice(0, 10000)}
JOB DESCRIPTION:\n${session.job_description.slice(0, 6000)}
ANALYSIS:\n${JSON.stringify(session.cv_analysis)}`;

    const messages: MessagePayload[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    if (session.interview_strategy) {
      messages.push({
        role: "assistant",
        content: `INTERVIEW STRATEGY:\n${JSON.stringify(session.interview_strategy)}`,
      });
      messages.push({
        role: "assistant",
        content: `Use this strategy to shape the questions. Focus on the candidate's positioning, the strengths to leverage, the gaps to probe, the stories to prepare, and the communication priorities. Make these questions reflect the strategy in a concrete and role-specific way.`,
      });
    }

    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.5,
      messages,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as { questions: GeneratedQuestion[] };
    if (!parsed.questions?.length) throw new Error("No questions");
    return parsed.questions.slice(0, 5);
  } catch {
    return fallbackQuestions(session);
  }
}

export async function GET(
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

  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const record = session as SessionRecord;

  let { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("session_id", id)
    .order("order_index", { ascending: true });

  if (!questions?.length) {
    if (!record.interview_strategy) {
      return NextResponse.json(
        {
          error:
            "Interview Strategy is required before generating questions. Please build your strategy first.",
        },
        { status: 400 }
      );
    }

    const generated = await generateQuestions(record);
    const rows = generated.map((q, i) => ({
      session_id: id,
      question: q.question,
      category: q.category,
      order_index: i,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("questions")
      .insert(rows)
      .select("*")
      .order("order_index", { ascending: true });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    questions = inserted;

    await supabase
      .from("sessions")
      .update({ status: "in_progress" })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  const { data: answers } = await supabase
    .from("answers")
    .select("*")
    .eq("session_id", id);

  return NextResponse.json({
    session: record,
    questions,
    answers: answers ?? [],
  });
}
