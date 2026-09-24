import { getOpenAI } from "@/lib/openai";
import { normalizeDocumentText } from "@/lib/universal-ingestion";
import type { SessionLanguage } from "@/types";

const MAX_MODEL_INPUT_BYTES = 12_000_000;

export async function extractScreenshotText(
  bytes: Uint8Array,
  mimeType: "image/png" | "image/jpeg" | "image/webp",
  language: SessionLanguage = "en",
): Promise<string> {
  if (!bytes.byteLength || bytes.byteLength > MAX_MODEL_INPUT_BYTES) {
    throw new Error("INVALID_SCREENSHOT_PAYLOAD");
  }

  const base64 = Buffer.from(bytes).toString("base64");
  const languageHint = language === "fr"
    ? "The source may contain French, English, or both. Preserve the source language exactly."
    : "The source may contain English, French, or both. Preserve the source language exactly.";

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You are a strict document transcription engine.",
          "Transcribe only readable text that is visibly present in the supplied image.",
          "Do not summarize, interpret, infer, complete, translate, rewrite, or correct the text.",
          "Preserve wording, numbers, dates, names, headings, bullets, and meaningful line order as faithfully as possible.",
          "Ignore decorative elements, logos, icons, and purely visual elements unless they contain readable text.",
          "If text is unreadable, do not invent it.",
          languageHint,
        ].join(" "),
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe the readable document text only." },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("NO_READABLE_TEXT");
  return normalizeDocumentText(text);
}
