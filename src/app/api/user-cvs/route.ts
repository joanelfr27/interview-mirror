import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("user_cvs")
    .select("id, file_name, cv_text, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data && data.length > 0) {
    return NextResponse.json({ cvs: data });
  }

  // Preserve continuity for candidates whose CVs were historically stored on sessions
  // before the reusable user_cvs record was available. Do not fabricate storage_path data.
  const { data: historicalSessions, error: historicalError } = await supabase
    .from("sessions")
    .select("id, title, cv_text, created_at, updated_at")
    .eq("user_id", user.id)
    .not("cv_text", "is", null)
    .neq("cv_text", "")
    .order("updated_at", { ascending: false })
    .limit(10);

  if (historicalError) {
    return NextResponse.json({ error: historicalError.message }, { status: 500 });
  }

  const fallbackCvs = (historicalSessions ?? []).map((session) => ({
    id: `historical:${session.id}`,
    file_name: session.title || "Previous CV",
    cv_text: session.cv_text ?? "",
    created_at: session.created_at,
    updated_at: session.updated_at,
  }));

  return NextResponse.json({ cvs: fallbackCvs });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const cvText = String(body.cvText ?? "").trim();
  const fileName = String(body.fileName ?? "CV").trim() || "CV";

  if (!cvText) {
    return NextResponse.json({ error: "CV text is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_cvs")
    .insert({
      user_id: user.id,
      file_name: fileName,
      cv_text: cvText,
    })
    .select("id, file_name, cv_text, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to save CV" },
      { status: 500 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
