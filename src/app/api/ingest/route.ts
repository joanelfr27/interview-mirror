import { NextResponse } from "next/server";

export const runtime = "nodejs";
import { createClient } from "@/lib/supabase/server";
import { buildIngestedDocument, fetchLinkedDocument } from "@/lib/universal-ingestion";
import { assertPublicIngestionUrl } from "@/lib/server-ingestion-url";
import { buildScreenshotSource } from "@/lib/screenshot-ingestion";
import { extractScreenshotText } from "@/lib/screenshot-vision";
import { normalizeLanguage } from "@/lib/openai";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const isScreenshotUpload = contentType.includes("multipart/form-data");

  try {
    if (isScreenshotUpload) {
      const form = await request.formData();
      const file = form.get("file");
      const source = form.get("source");
      if (!(file instanceof File)) return NextResponse.json({ code: "SCREENSHOT_REQUIRED", error: "A screenshot file is required" }, { status: 400 });
      if (source !== "screenshot") return NextResponse.json({ code: "INVALID_INGESTION_SOURCE", error: "Unsupported multipart ingestion source" }, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      const screenshot = await buildScreenshotSource(bytes, file.type, file.name);
      const language = normalizeLanguage(form.get("language"));
      const text = await extractScreenshotText(bytes, screenshot.mimeType, language);
      const document = await buildIngestedDocument(text, "screenshot", screenshot.sourceName);
      return NextResponse.json({ ...document, sourceContentHash: screenshot.contentHash });
    }

    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return NextResponse.json({ code: "URL_REQUIRED", error: "A document link is required" }, { status: 400 });
    const text = await fetchLinkedDocument(url, assertPublicIngestionUrl);
    const document = await buildIngestedDocument(text, "link", undefined, url);
    return NextResponse.json(document);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INGESTION_FAILED";
    const screenshotError = isScreenshotUpload || ["SCREENSHOT_REQUIRED","INVALID_INGESTION_SOURCE","UNSUPPORTED_IMAGE_TYPE","EMPTY_IMAGE","IMAGE_TOO_LARGE","INVALID_IMAGE_SIGNATURE","INVALID_SCREENSHOT_PAYLOAD","NO_READABLE_TEXT"].includes(code);
    const status = ["INVALID_URL","INVALID_URL_SCHEME","SCREENSHOT_REQUIRED","INVALID_INGESTION_SOURCE","UNSUPPORTED_IMAGE_TYPE","IMAGE_TOO_LARGE","INVALID_IMAGE_SIGNATURE"].includes(code) ? 400 : 422;
    return NextResponse.json({ code, error: screenshotError ? "We could not reliably read this screenshot. Please use a clear PNG, JPEG, or WebP image." : "We could not reliably read this link. Please paste the text or upload the document instead." }, { status });
  }
}
