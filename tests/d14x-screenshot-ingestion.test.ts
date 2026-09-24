import test from "node:test";
import assert from "node:assert/strict";

import { buildScreenshotSource, normalizeScreenshotMimeType } from "../src/lib/screenshot-ingestion.ts";

test("accepts supported screenshot image types", () => {
  assert.equal(normalizeScreenshotMimeType("image/png"), "image/png");
  assert.equal(normalizeScreenshotMimeType("image/jpeg"), "image/jpeg");
  assert.equal(normalizeScreenshotMimeType("image/webp"), "image/webp");
});

test("rejects unsupported or missing image types", () => {
  assert.throws(() => normalizeScreenshotMimeType("application/pdf"), /UNSUPPORTED_IMAGE_TYPE/);
  assert.throws(() => normalizeScreenshotMimeType(""), /UNSUPPORTED_IMAGE_TYPE/);
});

test("rejects oversized screenshot payloads before processing", async () => {
  const bytes = new Uint8Array(12_000_001);
  await assert.rejects(
    () => buildScreenshotSource(bytes, "image/png", "screen.png"),
    /IMAGE_TOO_LARGE/,
  );
});

test("rejects a declared image type with an invalid signature", async () => {
  await assert.rejects(
    () => buildScreenshotSource(new Uint8Array([1, 2, 3]), "image/png", "screen.png"),
    /INVALID_IMAGE_SIGNATURE/,
  );
});

test("creates a traceable canonical screenshot source", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const source = await buildScreenshotSource(png, "image/png", "screen.png");
  assert.equal(source.sourceType, "screenshot");
  assert.equal(source.sourceName, "screen.png");
  assert.equal(source.mimeType, "image/png");
  assert.match(source.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(source.byteLength, 8);
});

test("same bytes produce the same content hash", async () => {
  const a = await buildScreenshotSource(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png");
  const b = await buildScreenshotSource(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png");
  assert.equal(a.contentHash, b.contentHash);
});
