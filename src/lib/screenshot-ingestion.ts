export const SCREENSHOT_LIMITS = { maxImageBytes: 12_000_000 } as const;

export type ScreenshotMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ScreenshotSource = {
  sourceType: "screenshot";
  mimeType: ScreenshotMimeType;
  sourceName?: string;
  byteLength: number;
  contentHash: string;
};

export function normalizeScreenshotMimeType(value: string): ScreenshotMimeType {
  const normalized = value.trim().toLowerCase().split(";")[0];
  if (normalized === "image/png" || normalized === "image/jpeg" || normalized === "image/webp") {
    return normalized;
  }
  throw new Error("UNSUPPORTED_IMAGE_TYPE");
}

async function hashBytes(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return `sha256:${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function buildScreenshotSource(
  bytes: Uint8Array,
  mimeType: string,
  sourceName?: string,
): Promise<ScreenshotSource> {
  const normalizedMimeType = normalizeScreenshotMimeType(mimeType);
  if (!bytes.byteLength) throw new Error("EMPTY_IMAGE");
  if (bytes.byteLength > SCREENSHOT_LIMITS.maxImageBytes) throw new Error("IMAGE_TOO_LARGE");
  return {
    sourceType: "screenshot",
    mimeType: normalizedMimeType,
    sourceName,
    byteLength: bytes.byteLength,
    contentHash: await hashBytes(bytes),
  };
}
