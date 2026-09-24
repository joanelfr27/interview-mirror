export const SCREENSHOT_LIMITS = { maxImageBytes: 12_000_000 } as const;

export type ScreenshotMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ScreenshotSource = {
  sourceType: "screenshot";
  mimeType: ScreenshotMimeType;
  sourceName?: string;
  byteLength: number;
  contentHash: string;
};

function hasImageSignature(bytes: Uint8Array, mimeType: ScreenshotMimeType): boolean {
  if (mimeType === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }

  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }

  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

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
  if (!hasImageSignature(bytes, normalizedMimeType)) throw new Error("INVALID_IMAGE_SIGNATURE");
  return {
    sourceType: "screenshot",
    mimeType: normalizedMimeType,
    sourceName,
    byteLength: bytes.byteLength,
    contentHash: await hashBytes(bytes),
  };
}
