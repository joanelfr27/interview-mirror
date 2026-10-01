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
  validateBlindLabelerCases,
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

test("corpus validator requires both EN and FR coverage", () => {
  const corpus = validCorpus().map((row) => ({ ...row, language: "en" as const, pair_id: null }));
  assert.ok(validateCorpus(corpus).some((error) => error.includes('include language "fr"')));
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

test("blind-labeler cases contain no labels or labeler IDs and retain complete translation pairs", () => {
  const blindCases = validCorpus().slice(0, 2).map(({ case_id, exact_cited_atoms, headline, language, pair_id }) =>
    ({ case_id, exact_cited_atoms, headline, language, pair_id }));
  assert.deepEqual(validateBlindLabelerCases(blindCases), []);
  assert.ok(validateBlindLabelerCases(validCorpus()).some((error) => error.includes("must not contain gold labels")));
  assert.ok(validateBlindLabelerCases([blindCases[0]]).some((error) => error.includes("exactly one EN case and one FR case")));
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
    const manifestPath = join(directory, "input.bin.sha256.json");
    assert.deepEqual(JSON.parse(await readFile(manifestPath, "utf8")), manifest);
    assert.equal(manifest.sha256.length, 64);
    assert.equal(await verifySha256Manifest(path, manifest), true);
    assert.equal(await verifySha256Manifest(path, manifestPath), true);
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
  assert.deepEqual(result.qualification, []);
  assert.deepEqual(result.diagnostic.map(({ case_id }) => case_id), ["b"]);
  assert.equal(result.agreement.G.raw_agreement, 0.5);
  assert.equal(result.agreement.G.cohen_kappa, 0);
  assert.equal(result.agreement.S.raw_agreement, 1);
  assert.equal(result.agreement.S.cohen_kappa, 1);
  assert.equal(result.qualification_gate.passed, false);
  assert.deepEqual(result.qualification, []);

  const directory = await mkdtemp(join(tmpdir(), "agreement-output-"));
  try {
    await writeAgreementOutputs(directory, result);
    assert.deepEqual(JSON.parse(await readFile(join(directory, "diagnostic.json"), "utf8")), result.diagnostic);
    assert.deepEqual(JSON.parse(await readFile(join(directory, "qualification.json"), "utf8")), result.qualification);
    assert.deepEqual(JSON.parse(await readFile(join(directory, "qualification-gate.json"), "utf8")), result.qualification_gate);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function agreementInput(disagreementCount: number, count = 5): [IndependentLabel[], IndependentLabel[]] {
  const left = Array.from({ length: count }, (_, index) => ({
    case_id: `case-${index}`,
    gold_G: 0 as const,
    gold_S: 0 as const,
  }));
  const right = left.map((row, index) => ({
    ...row,
    gold_G: index < disagreementCount ? 1 as const : 0 as const,
  }));
  return [left, right];
}

test("exactly 20% disagreement passes the qualification gate at the boundary", () => {
  const [left, right] = agreementInput(1);
  const result = compareIndependentLabels(left, right);
  assert.equal(result.qualification_gate.disagreement_rate, 0.2);
  assert.equal(result.qualification_gate.passed, true);
  assert.equal(result.qualification.length, 4);
  assert.equal(result.diagnostic.length, 1);
});

test("more than 20% disagreement fails closed and empties qualification", () => {
  const [left, right] = agreementInput(2);
  const result = compareIndependentLabels(left, right);
  assert.equal(result.qualification_gate.disagreement_rate, 0.4);
  assert.equal(result.qualification_gate.passed, false);
  assert.match(result.qualification_gate.reason ?? "", /exceeds 20%/);
  assert.deepEqual(result.qualification, []);
  assert.equal(result.diagnostic.length, 2);
});
