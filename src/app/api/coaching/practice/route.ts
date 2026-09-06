import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const sourceSessionId = String(body.sourceSessionId ?? "").trim();
    const focusArea = String(body.focusArea ?? "").trim();

    if (!sourceSessionId || !focusArea) {
      return NextResponse.json(
        { error: "sourceSessionId and focusArea are required" },
        { status: 400 }
      );
    }

    const { data: sourceSession, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sourceSessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !sourceSession) {
      return NextResponse.json({ error: "Source session not found" }, { status: 404 });
    }

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are Interview Mirror's coaching practice generator. Create exactly 2 NEW interview questions that specifically test the candidate's ability to improve the stated coaching focus. Do not repeat questions from the source interview. Questions must be realistic, concise, and answerable from the candidate's genuine experience. Return JSON with a questions key containing exactly 2 strings.",
        },
        {
          role: "user",
          content: `COACHING FOCUS:\n${focusArea}\n\nCANDIDATE CV:\n${String(sourceSession.cv_text ?? "").slice(0, 12000)}\n\nJOB DESCRIPTION:\n${String(sourceSession.job_description ?? "").slice(0, 8000)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");

    const parsed = JSON.parse(raw) as { questions?: unknown };
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.filter((question): question is string => typeof question === "string" && question.trim().length > 0).slice(0, 2)
      : [];

    if (questions.length !== 2) {
      return NextResponse.json(
        { error: "Could not generate two targeted practice questions" },
        { status: 500 }
      );
    }

    const { data: practiceSession, error: practiceError } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        title: `Practice: ${focusArea}`,
        cv_text: sourceSession.cv_text,
        job_description: sourceSession.job_description,
        cv_analysis: sourceSession.cv_analysis,
        interview_strategy: sourceSession.interview_strategy,
        coaching_focus: focusArea,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (practiceError || !practiceSession) {
      return NextResponse.json(
        { error: practiceError?.message || "Failed to create practice session" },
        { status: 500 }
      );
    }

    const { error: questionsError } = await supabase.from("questions").insert(
      questions.map((question, index) => ({
        session_id: practiceSession.id,
        question_text: question,
        category: "coaching",
        order_index: index + 1,
      }))
    );

    if (questionsError) {
      await supabase.from("sessions").delete().eq("id", practiceSession.id).eq("user_id", user.id);
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId: practiceSession.id, coachingFocus: focusArea });
  } catch (error) {
    console.error("Error creating coaching practice session:", error);
    return NextResponse.json(
      { error: "Failed to create coaching practice session" },
      { status: 500 }
    );
  }
}
