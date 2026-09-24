import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

test("D14 removes the obsolete PDF extraction endpoint", () => {
  assert.equal(fs.existsSync(path.join(root, "src/app/api/extract-pdf/route.ts")), false);
});

test("D14 removes the obsolete pdf-parse dependency", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(pkg.dependencies?.["pdf-parse"], undefined);
  assert.equal(pkg.devDependencies?.["@types/pdf-parse"], undefined);
  const obsoleteLockEntries = Object.keys(lock.packages ?? {}).filter((key) => key === "node_modules/pdf-parse" || key.startsWith("node_modules/pdf-parse/") || key === "node_modules/@types/pdf-parse");
  assert.deepEqual(obsoleteLockEntries, []);
});

test("D14 analysis route has no legacy direct job-description scraper", () => {
  const source = fs.readFileSync(path.join(root, "src/app/api/analyze/route.ts"), "utf8");
  assert.match(source, /universal-ingestion/);
  assert.match(source, /assertPublicIngestionUrl/);
  assert.doesNotMatch(source, /tryFetchJobDescription/);
  assert.doesNotMatch(source, /extractSubstantiveJdText/);
  assert.doesNotMatch(source, /extractStructuredJobPosting/);
  assert.doesNotMatch(source, /const BOILERPLATE/);
});

test("D14 analysis route retains canonical input gates", () => {
  const source = fs.readFileSync(path.join(root, "src/app/api/analyze/route.ts"), "utf8");
  assert.match(source, /CANONICAL_CV_REQUIRED/);
  assert.match(source, /CANONICAL_JD_REQUIRED/);
  assert.match(source, /canonicalDocumentFromBody/);
});
