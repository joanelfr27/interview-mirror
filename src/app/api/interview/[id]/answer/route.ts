import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await request.json();
  const questionId = String(body.questionId ?? "");
  const answerText = String(body.answerText ?? "").trim();

  if (!questionId || !answerText) {
    return NextResponse.json(
      { error: "questionId and answerText are required" },
      { status: 400 }
    );
  }

  const { data: existing } = await supabase
    .from("answers")
    .select("id")
    .eq("question_id", questionId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("answers")
      .update({ answer_text: answerText })
      .eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase.from("answers").insert({
      question_id: questionId,
      session_id: sessionId,
      answer_text: answerText,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  await supabase
    .from("sessions")
    .update({ status: "in_progress" })
    .eq("id", sessionId);

  return NextResponse.json({ ok: true });
}
