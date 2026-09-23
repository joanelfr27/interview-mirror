import test from "node:test";
import assert from "node:assert/strict";
import { buildIngestedDocument, extractWordText, fetchLinkedDocument, normalizeDocumentText, validateIngestionUrl } from "../src/lib/universal-ingestion.ts";

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
  assert.throws(() => validateIngestionUrl("http://[::ffff:127.0.0.1]/"), /BLOCKED_PRIVATE_URL/);
  assert.throws(() => validateIngestionUrl("http://127.0.0.1.nip.io/"), /BLOCKED_PRIVATE_URL/);
});

test("rejects empty and oversized documents", () => {
  assert.throws(() => normalizeDocumentText("   "), /NO_READABLE_TEXT/);
  assert.throws(() => normalizeDocumentText("x".repeat(100_001)), /DOCUMENT_TOO_LARGE/);
});


test("rejects malformed Word documents instead of producing fabricated text", async () => {
  await assert.rejects(() => extractWordText(new File([new Uint8Array([1, 2, 3])], "broken.docx")), /INVALID_DOCX/);
});

test("revalidates redirect targets and blocks private destinations", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1:3000/internal" } });
  try { await assert.rejects(() => fetchLinkedDocument("https://example.com/job"), /BLOCKED_PRIVATE_URL/); } finally { globalThis.fetch = originalFetch; }
});

test("fails closed after the bounded redirect count", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(null, { status: 302, headers: { location: "https://example.com/redirect-" + calls } }); };
  try { await assert.rejects(() => fetchLinkedDocument("https://example.com/job"), /LINK_REDIRECT_LIMIT/); assert.equal(calls, 4); } finally { globalThis.fetch = originalFetch; }
});


test("fails closed on oversized DOCX XML expansion", async () => {
  const original = globalThis.DecompressionStream;
  class FakeStream {
    getReader() {
      let done = false;
      return {
        read: async () => {
          if (done) return { done: true, value: undefined };
          done = true;
          return { done: false, value: new Uint8Array(2_000_001) };
        },
        cancel: async () => {},
      };
    }
  }
  globalThis.DecompressionStream = class {
    constructor() {}
  } as unknown as typeof DecompressionStream;
  try {
    const document = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "large.docx");
    await assert.rejects(() => extractWordText(document), /INVALID_DOCX/);
  } finally {
    globalThis.DecompressionStream = original;
  }
});

test("routes linked PDF content through the PDF parser", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x00]), {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
  try {
    await assert.rejects(() => fetchLinkedDocument("https://example.com/cv.pdf"), /INVALID_PDF/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("routes linked DOCX content through the Word parser", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]), {
    status: 200,
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  });
  try {
    await assert.rejects(() => fetchLinkedDocument("https://example.com/cv.docx"), /INVALID_DOCX/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invokes the server URL guard for every redirect hop", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const guarded: string[] = [];
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(null, { status: 302, headers: { location: "https://example.com/next" } })
      : new Response("Candidate CV text", { status: 200, headers: { "content-type": "text/plain" } });
  };
  try {
    const text = await fetchLinkedDocument("https://example.com/start", async (url) => { guarded.push(url.hostname); });
    assert.equal(text, "Candidate CV text");
    assert.deepEqual(guarded, ["example.com", "example.com"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
