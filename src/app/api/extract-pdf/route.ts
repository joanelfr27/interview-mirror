import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as any;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    // Debug log: indicate file received
    // eslint-disable-next-line no-console
    console.log('[extract-pdf] received file, bytes:', arrayBuffer.byteLength);
    const uint8 = new Uint8Array(arrayBuffer);

    // Use the legacy build which is compatible with Node.js
    const mod = await import("pdfjs-dist/legacy/build/pdf");
    const pdfjslib = (mod && (mod as any).default) ? (mod as any).default : mod;

    try {
      if (pdfjslib.GlobalWorkerOptions) {
        (pdfjslib as any).GlobalWorkerOptions.workerSrc = "";
      }
    } catch (_) {
      // ignore
    }

    if (!pdfjslib || typeof pdfjslib.getDocument !== "function") {
      return NextResponse.json({ error: "PDF library not available on server" }, { status: 500 });
    }

    const loadingTask = pdfjslib.getDocument({ data: uint8, disableWorker: true } as any);
    const pdf = await loadingTask.promise;

    const content: string[] = [];
    for (let pageIndex = 1; pageIndex <= (pdf.numPages || 0); pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str || "").join(" ");
      if (pageText && pageText.trim()) content.push(pageText.trim());
    }

    const text = content.join("\n\n").trim();

    // Debug log: pages and text length
    // eslint-disable-next-line no-console
    console.log('[extract-pdf] pages:', pdf.numPages, 'extractedTextLength:', text.length);

    if (!text || text.length < 40) {
      return NextResponse.json(
        { error: "Insufficient extractable text. This PDF may be scanned/image-only and requires OCR." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text, pages: pdf.numPages || 0 });
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error("Server PDF extraction error:", err);
    const message = err?.message ?? String(err);
    return NextResponse.json({ error: `Corrupted or unsupported PDF: ${message}` }, { status: 400 });
  }
}
