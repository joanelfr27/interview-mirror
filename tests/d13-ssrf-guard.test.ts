import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicIngestionUrl } from "../src/lib/server-ingestion-url.ts";

test("server SSRF guard blocks loopback and IPv4-mapped IPv6 literals", async () => {
  await assert.rejects(() => assertPublicIngestionUrl(new URL("http://127.0.0.1/")), /BLOCKED_PRIVATE_URL/);
  await assert.rejects(() => assertPublicIngestionUrl(new URL("http://[::ffff:127.0.0.1]/")), /BLOCKED_PRIVATE_URL/);
  await assert.rejects(() => assertPublicIngestionUrl(new URL("http://[::1]/")), /BLOCKED_PRIVATE_URL/);
});

test("server SSRF guard blocks hostnames that resolve to loopback", async () => {
  await assert.rejects(() => assertPublicIngestionUrl(new URL("http://localhost/")), /BLOCKED_PRIVATE_URL/);
});

test("server SSRF guard permits a public IP literal", async () => {
  await assert.doesNotReject(() => assertPublicIngestionUrl(new URL("https://8.8.8.8/")));
});
