import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  compareIndependentLabels,
  createSha256Manifest,
  loadQualificationFixture,
  qualificationCasesFromFixture,
  validateCorpus,
  verifySha256Manifest,
  writeAgreementOutputs,
  type CorpusCase,
  type IndependentLabel,
} from "../scripts/evaluation-infrastructure.ts";

function validCorpus(): CorpusCase[] {
  const labels: Array<[0 | 1, 0 | 1]> = [[0, 0], [0, 1], [1, 0], [1, 1]];
  return labels.map(([gold_G, gold_S], index) => ({
    case_id: `test-${index}`,
    exact_cited_atoms: [`opaque-${index}`],
    headline: `Fixture ${index}`,
    language: index % 2 === 0 ? "en" : "fr",
    pair_id: index < 2 ? "pair-a" : null,
    gold_G,
    gold_S,
    labeler_id: "labeler-test",
  }));
}

test("corpus validator accepts required bilingual coverage, four cells, and a complete pair", () => {
  assert.deepEqual(validateCorpus(validCorpus()), []);
});

test("corpus validator reports a missing G×S cell", () => {
  const corpus = validCorpus().filter((row) => !(row.gold_G === 1 && row.gold_S === 1));
  assert.ok(validateCorpus(corpus).some((error) => error.includes("missing G×S cell (1,1)")));
});

test("corpus validator rejects an incomplete EN/FR pair and invalid or duplicate IDs", () => {
  const corpus = validCorpus();
  corpus[1] = { ...corpus[1], language: "en", pair_id: "pair-a" };
  corpus[2] = { ...corpus[2], case_id: corpus[0].case_id, gold_G: 2 as 0 | 1 };
  const errors = validateCorpus(corpus);
  assert.ok(errors.some((error) => error.includes("exactly one EN case and one FR case")));
  assert.ok(errors.some((error) => error.includes("is not unique")));
  assert.ok(errors.some((error) => error.includes("gold_G must be 0 or 1")));
});

test("qualification loader rejects diagnostic-only fixtures and paths", async () => {
  const diagnosticFixture = { fixture_type: "diagnostic-only", cases: validCorpus() };
  assert.throws(() => qualificationCasesFromFixture(diagnosticFixture), /rejects fixtures/);

  const directory = await mkdtemp(join(tmpdir(), "evaluation-fixture-"));
  try {
    const diagnosticDirectory = join(directory, "diagnostic-only");
    const path = join(diagnosticDirectory, "fixture.json");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(diagnosticDirectory));
    await writeFile(path, JSON.stringify({ fixture_type: "qualification", cases: validCorpus() }));
    await assert.rejects(() => loadQualificationFixture(path), /diagnostic-only fixture paths/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("SHA-256 manifest verifies identical bytes and rejects a byte mismatch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sha-fixture-"));
  const path = join(directory, "input.bin");
  try {
    await writeFile(path, Buffer.from([0, 1, 2, 255]));
    const manifest = await createSha256Manifest(path);
    assert.equal(manifest.sha256.length, 64);
    assert.equal(await verifySha256Manifest(path, manifest), true);
    await writeFile(path, Buffer.from([0, 1, 2, 254]));
    assert.equal(await verifySha256Manifest(path, manifest), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("agreement separates disagreements into diagnostic output and excludes them from qualification", async () => {
  const left: IndependentLabel[] = [
    { case_id: "b", gold_G: 1, gold_S: 0 },
    { case_id: "a", gold_G: 0, gold_S: 0 },
  ];
  const right: IndependentLabel[] = [
    { case_id: "a", gold_G: 0, gold_S: 0 },
    { case_id: "b", gold_G: 0, gold_S: 0 },
  ];
  const result = compareIndependentLabels(left, right);
  assert.deepEqual(result.qualification.map(({ case_id }) => case_id), ["a"]);
  assert.deepEqual(result.diagnostic.map(({ case_id }) => case_id), ["b"]);
  assert.equal(result.agreement.G.raw_agreement, 0.5);
  assert.equal(result.agreement.G.cohen_kappa, 0);
  assert.equal(result.agreement.S.raw_agreement, 1);
  assert.equal(result.agreement.S.cohen_kappa, 1);

  const directory = await mkdtemp(join(tmpdir(), "agreement-output-"));
  try {
    await writeAgreementOutputs(directory, result);
    assert.deepEqual(JSON.parse(await readFile(join(directory, "diagnostic.json"), "utf8")), result.diagnostic);
    assert.deepEqual(JSON.parse(await readFile(join(directory, "qualification.json"), "utf8")), result.qualification);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
