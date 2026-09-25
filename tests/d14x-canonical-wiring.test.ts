import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildIngestedDocument } from "../src/lib/universal-ingestion.ts";

const root = path.resolve(process.cwd());

test("screenshot text converges on the existing D13 canonical document contract", async () => {
  const document = await buildIngestedDocument("John Doe\nFinance Manager", "screenshot", "cv-screen.png");
  assert.equal(document.sourceType, "screenshot");
  assert.equal(document.sourceName, "cv-screen.png");
  assert.equal(document.text, "John Doe\nFinance Manager");
  assert.match(document.contentHash, /^[a-f0-9]{64}$/);
});

test("CV and JD screenshot UI both use the canonical screenshot source path", () => {
  const form = fs.readFileSync(path.join(root, "src/app/(app)/prepare/prepare-form.tsx"), "utf8");
  const ingest = fs.readFileSync(path.join(root, "src/app/api/ingest/route.ts"), "utf8");
  const analyze = fs.readFileSync(path.join(root, "src/app/api/analyze/route.ts"), "utf8");
  assert.match(form, /cvSourceMode === "screenshot"/);
  assert.match(form, /jobDescriptionMode === "screenshot"/);
  assert.match(form, /form\.set\("source", "screenshot"\)/);
  assert.match(form, /fetch\("\/api\/ingest", \{ method: "POST", body: form \}\)/);
  assert.match(ingest, /buildIngestedDocument\(text, "screenshot", screenshot\.sourceName\)/);
  assert.match(ingest, /sourceContentHash: screenshot\.contentHash/);
  assert.match(analyze, /value === "screenshot"/);
  assert.match(analyze, /cv_source_content_hash/);
  assert.match(analyze, /jd_source_content_hash/);
  assert.match(analyze, /sourceHashes\?\.cv/);
  assert.match(analyze, /sourceHashes\?\.jd/);
});

test("bare job-description URLs are recognized without a label", () => {
  const analyze = fs.readFileSync(path.join(root, "src/app/api/analyze/route.ts"), "utf8");
  assert.match(analyze, /if \(!remainder\) return true;/);
});

test("D14x does not introduce a screenshot-specific downstream evidence architecture", () => {
  for (const relative of ["src/lib/screenshot-ingestion.ts","src/lib/screenshot-vision.ts","src/app/api/ingest/route.ts"]) {
    const content = fs.readFileSync(path.join(root, relative), "utf8");
    assert.doesNotMatch(content, /EvidenceLedger|AtomicEvidence|canonical-evidence-model|professional-mirror|strategy-engine/i);
  }
});
