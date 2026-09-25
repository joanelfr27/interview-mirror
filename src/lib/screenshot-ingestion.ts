export const SCREENSHOT_LIMITS = { maxImageBytes: 12_000_000 } as const;

export type ScreenshotMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ScreenshotSource = {
  sourceType: "screenshot";
  mimeType: ScreenshotMimeType;
  sourceName?: string;
  byteLength: number;
  contentHash: string;
};

function hasCompletePng(bytes: Uint8Array): boolean {
  if (bytes.length < 33) return false;
  let offset = 8;
  let sawIhdr = false;
  let sawIdat = false;

  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === "IHDR") {
      if (sawIhdr || length !== 13 || offset !== 8) return false;
      sawIhdr = true;
    } else if (type === "IDAT") {
      sawIdat = true;
    } else if (type === "IEND") {
      return sawIhdr && sawIdat && length === 0 && chunkEnd === bytes.length;
    }
    offset = chunkEnd;
  }
  return false;
}

function hasCompleteJpeg(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  let sawFrame = false;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false;
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return false;
    const marker = bytes[offset++];
    if (marker === 0xd9) return sawFrame && offset === bytes.length;
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) return false;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return false;
      offset += length;
      const eoi = bytes.length >= 2 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
      return sawFrame && eoi;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return false;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      sawFrame = true;
    }
    offset += length;
  }
  return false;
}

function hasCompleteWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 20
    || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46
    || bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return false;
  const riffSize = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true);
  if (riffSize !== bytes.length - 8) return false;
  let offset = 12;
  let sawImageChunk = false;
  while (offset + 8 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
    const chunkEnd = offset + 8 + length + (length % 2);
    if (chunkEnd > bytes.length) return false;
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (type === "VP8 " || type === "VP8L" || type === "VP8X") sawImageChunk = true;
    offset = chunkEnd;
  }
  return sawImageChunk && offset === bytes.length;
}

function hasImageSignature(bytes: Uint8Array, mimeType: ScreenshotMimeType): boolean {
  if (mimeType === "image/png") {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
      && hasCompletePng(bytes);
  }
  if (mimeType === "image/jpeg") {
    return hasCompleteJpeg(bytes);
  }
  return hasCompleteWebp(bytes);
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
