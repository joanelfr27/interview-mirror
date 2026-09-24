import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const questionId = String(body.questionId ?? "").trim();
    const answerText = String(body.answerText ?? "").trim();

    if (!questionId || !answerText) {
      return NextResponse.json(
        { error: "questionId and answerText are required" },
        { status: 400 }
      );
    }

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("id")
      .eq("id", questionId)
      .eq("session_id", sessionId)
      .single();

    if (questionError || !question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    // Replace any previous answer for this question so revisiting a question
    // does not create duplicate answer records.
    const { error: deleteError } = await supabase
      .from("answers")
      .delete()
      .eq("session_id", sessionId)
      .eq("question_id", questionId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { data: answer, error: answerError } = await supabase
      .from("answers")
      .insert({
        session_id: sessionId,
        question_id: questionId,
        answer_text: answerText,
      })
      .select("*")
      .single();

    if (answerError || !answer) {
      return NextResponse.json(
        { error: answerError?.message || "Failed to save answer" },
        { status: 500 }
      );
    }

    return NextResponse.json({ answer }, { status: 201 });
  } catch (error) {
    console.error("Error saving interview answer:", error);
    return NextResponse.json(
      { error: "Failed to save interview answer" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const supabase = await createClient();

    // 1. Fetch Session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // 2. Fetch Questions linked to this session
    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (questionsError) {
      console.error("Questions fetch error:", questionsError);
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }

    // 3. Fetch Answers
    const { data: answers, error: answersError } = await supabase
      .from("answers")
      .select("*")
      .eq("session_id", sessionId);

    if (answersError) {
      console.error("Answers fetch error:", answersError);
      return NextResponse.json({ error: answersError.message }, { status: 500 });
    }

    return NextResponse.json({
      session,
      questions: questions ?? [],
      answers: answers ?? [],
    });
  } catch (error) {
    console.error("Error loading interview:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
