import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
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
