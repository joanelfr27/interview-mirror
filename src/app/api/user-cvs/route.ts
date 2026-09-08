import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function storagePath(userId: string, cvText: string): string {
  const digest = createHash("sha256").update(cvText).digest("hex").slice(0, 32);
  return `${userId}/${digest}.txt`;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("user_cvs").select("id, file_name, cv_text, storage_path, created_at, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.length) return NextResponse.json({ cvs: data, historicalCvs: [] });
  const { data: historicalSessions, error: historicalError } = await supabase.from("sessions").select("id, title, cv_text, created_at, updated_at").eq("user_id", user.id).not("cv_text", "is", null).neq("cv_text", "").order("updated_at", { ascending: false }).limit(10);
  if (historicalError) return NextResponse.json({ error: historicalError.message }, { status: 500 });
  return NextResponse.json({ cvs: [], historicalCvs: (historicalSessions ?? []).map((session) => ({ id: `historical:${session.id}`, file_name: session.title || "Previous CV", cv_text: session.cv_text ?? "", storage_path: null, created_at: session.created_at, updated_at: session.updated_at, historical: true })) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json(); const cvText = String(body.cvText ?? "").trim(); const fileName = String(body.fileName ?? "CV").trim() || "CV";
  if (!cvText) return NextResponse.json({ error: "CV text is required" }, { status: 400 });
  const existingByText = await supabase.from("user_cvs").select("id, file_name, cv_text, storage_path, created_at, updated_at").eq("user_id", user.id).eq("cv_text", cvText).limit(1).maybeSingle();
  if (existingByText.error) return NextResponse.json({ error: existingByText.error.message }, { status: 500 });
  if (existingByText.data) return NextResponse.json(existingByText.data, { status: 200 });
  const path = storagePath(user.id, cvText);
  const upload = await supabase.storage.from("cvs").upload(path, new Blob([cvText], { type: "text/plain" }), { contentType: "text/plain", upsert: false });
  if (upload.error && !/already exists/i.test(upload.error.message)) return NextResponse.json({ error: upload.error.message }, { status: 500 });
  const { data, error } = await supabase.from("user_cvs").insert({ user_id: user.id, file_name: fileName, cv_text: cvText, storage_path: path }).select("id, file_name, cv_text, storage_path, created_at, updated_at").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to save CV" }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
