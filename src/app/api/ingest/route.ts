import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { createClient } from "@/lib/supabase/server";
import { buildIngestedDocument, fetchLinkedDocument } from "@/lib/universal-ingestion";
import { assertPublicIngestionUrl } from "@/lib/server-ingestion-url";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return NextResponse.json({ code: "URL_REQUIRED", error: "A document link is required" }, { status: 400 });
    const text = await fetchLinkedDocument(url, assertPublicIngestionUrl);
    const document = await buildIngestedDocument(text, "link", undefined, url);
    return NextResponse.json(document);
  } catch (error) {
    const code = error instanceof Error ? error.message : "LINK_FETCH_FAILED";
    const status = code === "INVALID_URL" || code === "INVALID_URL_SCHEME" ? 400 : 422;
    return NextResponse.json({ code, error: "We could not reliably read this link. Please paste the text or upload the document instead." }, { status });
  }
}
