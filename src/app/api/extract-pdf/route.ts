import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { NextResponse } from "next/server";
export const runtime = "nodejs"
 export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "No valid file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    

    const parser = new PDFParse({ data:buffer , CanvasFactory });
    const result = await parser.getText();
    await parser.destroy();

    const text = result.text?.trim() ?? "";

    if (text.length < 40) {
      return NextResponse.json(
        {
          error:
            "Insufficient extractable text. This PDF may be scanned/image-only.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      text,
      pages: result.total,
    });
  } catch (err: any) {
    console.error("Server PDF extraction error:", err);

    const message = err?.message ?? String(err);

    return NextResponse.json(
      { error: `Corrupted or unsupported PDF: ${message}` },
      { status: 400 }
    );
  }
}