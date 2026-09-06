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

  return NextResponse.json({ cvs: data ?? [] });
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
