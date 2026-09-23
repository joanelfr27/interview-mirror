import test from "node:test";
import assert from "node:assert/strict";
import { buildIngestedDocument, normalizeDocumentText, validateIngestionUrl } from "../src/lib/universal-ingestion.ts";

test("normalizes whitespace and line endings", () => {
  assert.equal(normalizeDocumentText(" A\r\n B   C "), "A\n B C");
});

test("builds one canonical document contract regardless of source", async () => {
  const pdf = await buildIngestedDocument("Same text", "pdf", "cv.pdf");
  const word = await buildIngestedDocument("Same text", "word", "cv.docx");
  const paste = await buildIngestedDocument("Same text", "paste");
  assert.equal(pdf.text, word.text);
  assert.equal(word.contentHash, paste.contentHash);
  assert.equal(pdf.sourceType, "pdf");
  assert.equal(word.sourceType, "word");
});

test("accepts only http and https links", () => {
  assert.equal(validateIngestionUrl("https://example.com/jobs"), "https://example.com/jobs");
  assert.throws(() => validateIngestionUrl("file:///etc/passwd"), /INVALID_URL_SCHEME/);
  assert.throws(() => validateIngestionUrl("javascript:alert(1)"), /INVALID_URL_SCHEME/);
  assert.throws(() => validateIngestionUrl("not-a-url"), /INVALID_URL/);
  assert.throws(() => validateIngestionUrl("http://127.0.0.1:3000"), /BLOCKED_PRIVATE_URL/);
  assert.throws(() => validateIngestionUrl("http://192.168.1.10"), /BLOCKED_PRIVATE_URL/);
});

test("rejects empty and oversized documents", () => {
  assert.throws(() => normalizeDocumentText("   "), /NO_READABLE_TEXT/);
  assert.throws(() => normalizeDocumentText("x".repeat(100_001)), /DOCUMENT_TOO_LARGE/);
});
