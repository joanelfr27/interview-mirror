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
  validateBlindPilotAdministrationKey,
  validateBlindPilotCrossRecords,
  validateBlindPilotRoundPack,
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
    gold_G,
    gold_S,
    labeler_id: "labeler-test",
  }));
}

test("corpus validator accepts required bilingual coverage and all four G×S cells", () => {
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

test("corpus validator rejects invalid labels, duplicate IDs, and pair metadata", () => {
  const corpus = validCorpus();
  corpus[2] = { ...corpus[2], case_id: corpus[0].case_id, gold_G: 2 as 0 | 1 };
  const errors = validateCorpus(corpus);
  assert.ok(errors.some((error) => error.includes("is not unique")));
  assert.ok(errors.some((error) => error.includes("gold_G must be 0 or 1")));
  const pairMetadataInGold = validCorpus().map((row, index) =>
    index === 0 ? { ...row, pair_id: "pair-metadata-not-gold" } : row,
  );
  assert.ok(validateCorpus(pairMetadataInGold).some((error) => error.includes("unsupported field(s): pair_id")));
});

function blindCase(case_id: string, language: "en" | "fr") {
  return { case_id, exact_cited_atoms: [`atom-${case_id}`], headline: `Headline ${case_id}`, language };
}

function adminEntry(
  case_id: string,
  round: 1 | 2,
  pair_id: string,
  pair_type: "translation" | "segmentation",
): { case_id: string; round: 1 | 2; pair_id: string; pair_type: "translation" | "segmentation"; test_dimension: string } {
  return { case_id, round, pair_id, pair_type, test_dimension: "dimension-a" };
}

test("a blind-labeler Round 1 pack validates independently with exactly four blind fields", () => {
  const pack = [blindCase("opaque-a", "en")];
  assert.deepEqual(Object.keys(pack[0]!).sort(), ["case_id", "exact_cited_atoms", "headline", "language"]);
  assert.deepEqual(validateBlindPilotRoundPack({ round: 1, cases: pack }), []);
  assert.deepEqual(validateBlindLabelerCases(pack), []);
});

test("blind pack rejects pairing metadata and hidden administration fields", () => {
  for (const extra of [
    { pair_id: "hidden" },
    { round: 1 },
    { pair_type: "translation" },
    { test_dimension: "dimension-a" },
    { labeler_id: "labeler-a" },
  ]) {
    assert.ok(
      validateBlindLabelerCases([{ ...blindCase("opaque-a", "en"), ...extra }]).length > 0,
      `must reject field ${Object.keys(extra)[0]}`,
    );
  }
});

test("administration key accepts EN/FR translation and same-language segmentation pairs", () => {
  const packs = {
    round1: [blindCase("opaque-en", "en"), blindCase("opaque-seg-1", "fr")],
    round2: [blindCase("opaque-fr", "fr"), blindCase("opaque-seg-2", "fr")],
  };
  const key = [
    adminEntry("opaque-en", 1, "pair-translation", "translation"),
    adminEntry("opaque-fr", 2, "pair-translation", "translation"),
    adminEntry("opaque-seg-1", 1, "pair-segmentation", "segmentation"),
    adminEntry("opaque-seg-2", 2, "pair-segmentation", "segmentation"),
  ];
  assert.deepEqual(validateBlindPilotAdministrationKey(key), []);
  assert.deepEqual(validateBlindPilotCrossRecords(packs, key), []);
});

test("administration-key pair validation rejects same-round and malformed pairs", () => {
  const sameRound = [
    adminEntry("opaque-en", 1, "pair-a", "translation"),
    adminEntry("opaque-fr", 1, "pair-a", "translation"),
  ];
  assert.ok(validateBlindPilotAdministrationKey(sameRound).some((error) => error.includes("different rounds")));

  const incomplete = [adminEntry("opaque-en", 1, "pair-a", "translation")];
  assert.ok(validateBlindPilotAdministrationKey(incomplete).some((error) => error.includes("exactly two")));

  const inconsistentDimension = [
    adminEntry("opaque-a", 1, "pair-a", "segmentation"),
    { ...adminEntry("opaque-b", 2, "pair-a", "segmentation"), test_dimension: "dimension-b" },
  ];
  assert.ok(validateBlindPilotAdministrationKey(inconsistentDimension).some((error) => error.includes("share pair_type and test_dimension")));
  assert.ok(validateBlindPilotAdministrationKey([
    { ...adminEntry("opaque-a", 1, "pair-a", "segmentation"), private_note: "not permitted" },
    adminEntry("opaque-b", 2, "pair-a", "segmentation"),
  ]).some((error) => error.includes("unsupported field")));
});

test("administration key rejects wrong translation and segmentation language pairings", () => {
  const wrongTranslation = {
    round1: [blindCase("opaque-en1", "en")],
    round2: [blindCase("opaque-en2", "en")],
  };
  const translationKey = [
    adminEntry("opaque-en1", 1, "pair-a", "translation"),
    adminEntry("opaque-en2", 2, "pair-a", "translation"),
  ];
  assert.ok(validateBlindPilotCrossRecords(wrongTranslation, translationKey).some((error) => error.includes("exactly one EN case and one FR case")));

  const wrongSegmentation = {
    round1: [blindCase("opaque-en", "en")],
    round2: [blindCase("opaque-fr", "fr")],
  };
  const segmentationKey = [
    adminEntry("opaque-en", 1, "pair-a", "segmentation"),
    adminEntry("opaque-fr", 2, "pair-a", "segmentation"),
  ];
  assert.ok(validateBlindPilotCrossRecords(wrongSegmentation, segmentationKey).some((error) => error.includes("same language")));
});

test("cross-record validation fails closed for missing, duplicated, and extra case IDs", () => {
  const round1 = [blindCase("opaque-a", "en")];
  const round2 = [blindCase("opaque-b", "fr")];
  const key = [
    adminEntry("opaque-a", 1, "pair-a", "translation"),
    adminEntry("opaque-b", 2, "pair-a", "translation"),
  ];

  assert.ok(validateBlindPilotCrossRecords(
    { round1, round2: [blindCase("opaque-unlisted", "fr")] },
    key,
  ).some((error) => error.includes("opaque-b") && error.includes("missing from round packs")));
  assert.ok(validateBlindPilotCrossRecords({ round1, round2: [round1[0]] }, key).some((error) => error.includes("must appear exactly once")));
  assert.ok(validateBlindPilotCrossRecords(
    { round1: [...round1, blindCase("opaque-extra", "en")], round2 },
    key,
  ).some((error) => error.includes("opaque-extra") && error.includes("missing from the administration key")));
  assert.ok(validateBlindPilotCrossRecords(
    { round1: round2, round2: round1 },
    key,
  ).some((error) => error.includes("wrong round pack")));
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
