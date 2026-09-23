export type IngestionSourceType = "pdf" | "word" | "link" | "paste" | "text";

export type IngestedDocument = {
  text: string;
  sourceType: IngestionSourceType;
  sourceName?: string;
  sourceUrl?: string;
  contentHash: string;
};

export const INGESTION_LIMITS = { maxDocumentChars: 100_000, maxDocumentBytes: 12_000_000, maxDocxXmlBytes: 2_000_000, linkTimeoutMs: 12_000, maxRedirects: 3 };

export function normalizeDocumentText(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) throw new Error("NO_READABLE_TEXT");
  if (normalized.length > INGESTION_LIMITS.maxDocumentChars) throw new Error("DOCUMENT_TOO_LARGE");
  return normalized;
}

async function contentHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildIngestedDocument(text: string, sourceType: IngestionSourceType, sourceName?: string, sourceUrl?: string): Promise<IngestedDocument> {
  const normalized = normalizeDocumentText(text);
  return { text: normalized, sourceType, sourceName, sourceUrl, contentHash: await contentHash(normalized) };
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "localhost.localdomain" || host === "0.0.0.0" || host === "::1") return true;
  const ipv4 = host.split(".");
  if (ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = ipv4.map(Number);
    if (a === 127 || a === 10 || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)) return true;
  }
  if (/^(fc|fd)[0-9a-f]{2}:/i.test(host) || /^fe80:/i.test(host)) return true;
  if (/^::ffff:(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[0-1])\.)/i.test(host)) return true;
  if (/(?:^|\.)(?:nip\.io|xip\.io|sslip\.io|localtest\.me)$/i.test(host)) return true;
  return false;
}

export function validateIngestionUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("INVALID_URL"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("INVALID_URL_SCHEME");
  if (isBlockedHost(url.hostname)) throw new Error("BLOCKED_PRIVATE_URL");
  return url.toString();
}


export async function extractPdfText(file: File): Promise<string> {
  if (file.size > INGESTION_LIMITS.maxDocumentBytes) throw new Error("DOCUMENT_TOO_LARGE");
  const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (new TextDecoder().decode(header) !== "%PDF-") throw new Error("INVALID_PDF");
  let pdfjslib: any = null;
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf");
    pdfjslib = mod?.default ?? mod;
  } catch {
    const mod = await import("pdfjs-dist/build/pdf.mjs");
    pdfjslib = mod?.default ?? mod;
  }
  const loadingTask = pdfjslib.getDocument({ data: await file.arrayBuffer(), disableWorker: true });
  const pdf = await loadingTask.promise;
  const content: string[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    content.push(textContent.items.map((item: any) => item.str || "").join(" ").trim());
  }
  return normalizeDocumentText(content.filter(Boolean).join("\n\n"));
}

function u16(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("DOCX_DECOMPRESSION_UNAVAILABLE");
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > INGESTION_LIMITS.maxDocxXmlBytes) {
      await reader.cancel();
      throw new Error("DOCX_DOCUMENT_TOO_LARGE");
    }
    chunks.push(result.value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

async function unzipEntry(buffer: ArrayBuffer, wanted: string): Promise<Uint8Array> {
  const b = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("INVALID_DOCX");
  const count = u16(b, eocd + 10); let cursor = u32(b, eocd + 16); const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (u32(b, cursor) !== 0x02014b50) throw new Error("INVALID_DOCX");
    const method = u16(b, cursor + 10), size = u32(b, cursor + 20);
    const nameLen = u16(b, cursor + 28), extraLen = u16(b, cursor + 30), commentLen = u16(b, cursor + 32);
    const local = u32(b, cursor + 42), name = decoder.decode(b.slice(cursor + 46, cursor + 46 + nameLen));
    if (name === wanted) {
      if (u32(b, local) !== 0x04034b50) throw new Error("INVALID_DOCX");
      const ln = u16(b, local + 26), le = u16(b, local + 28), start = local + 30 + ln + le, compressed = b.slice(start, start + size);
      if (method === 0) return compressed;
      if (method === 8) return inflateRaw(compressed);
      throw new Error("UNSUPPORTED_DOCX_COMPRESSION");
    }
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("DOCX_DOCUMENT_XML_MISSING");
}

function xmlToText(xml: string): string {
  return xml.replace(/<w:tab\s*\/?>/gi, "\t").replace(/<w:br\s*\/?>/gi, "\n").replace(/<w:p[^>]*>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export async function extractWordText(file: File): Promise<string> {
  if (file.size > INGESTION_LIMITS.maxDocumentBytes) throw new Error("DOCUMENT_TOO_LARGE");
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4b || signature[2] !== 0x03 || signature[3] !== 0x04) throw new Error("INVALID_DOCX");
  const xml = new TextDecoder().decode(await unzipEntry(await file.arrayBuffer(), "word/document.xml"));
  return normalizeDocumentText(xmlToText(xml));
}

async function readResponseBytes(response: Response, maxBytes: number): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > maxBytes) throw new Error("DOCUMENT_TOO_LARGE");
  if (!response.body) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > maxBytes) throw new Error("DOCUMENT_TOO_LARGE");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    total += result.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("DOCUMENT_TOO_LARGE");
    }
    chunks.push(result.value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output.buffer;
}

export type IngestionUrlGuard = (url: URL) => Promise<void>;

export async function fetchLinkedDocument(rawUrl: string, guard?: IngestionUrlGuard): Promise<string> {
  let current = new URL(validateIngestionUrl(rawUrl));
  if (guard) await guard(current);
  for (let redirects = 0; redirects <= INGESTION_LIMITS.maxRedirects; redirects++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), INGESTION_LIMITS.linkTimeoutMs);
    let response: Response;
    try {
      response = await fetch(current, { signal: controller.signal, redirect: "manual", headers: { Accept: "text/html,text/plain" } });
    } catch { throw new Error("LINK_FETCH_FAILED"); } finally { clearTimeout(timer); }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location"); if (!location || redirects === INGESTION_LIMITS.maxRedirects) throw new Error("LINK_REDIRECT_LIMIT");
      current = new URL(location, current); validateIngestionUrl(current.toString()); if (guard) await guard(current); continue;
    }
    if (!response.ok) throw new Error("LINK_FETCH_FAILED");
    const type = (response.headers.get("content-type") || "").toLowerCase();
    const bytes = await readResponseBytes(response, INGESTION_LIMITS.maxDocumentBytes);
    if (type.includes("application/pdf") || /\\.pdf(?:$|[?#])/i.test(current.pathname)) {
      return extractPdfText(new File([bytes], "linked.pdf", { type: "application/pdf" }));
    }
    if (type.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document") || /\\.docx(?:$|[?#])/i.test(current.pathname)) {
      return extractWordText(new File([bytes], "linked.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    }
    const raw = new TextDecoder().decode(bytes);
    if (type.includes("html")) return normalizeDocumentText(raw.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
    if (type && !type.startsWith("text/") && type !== "application/json" && type !== "application/xml") throw new Error("UNSUPPORTED_LINK_CONTENT");
    return normalizeDocumentText(raw);
  }
  throw new Error("LINK_FETCH_FAILED");
}
