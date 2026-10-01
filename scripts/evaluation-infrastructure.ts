import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";

export type GoldLabel = 0 | 1;
export type CorpusLanguage = "en" | "fr";

export interface BlindLabelerCase {
  case_id: string;
  exact_cited_atoms: string[];
  headline: string;
  language: CorpusLanguage;
}

export interface GoldCase {
  case_id: string;
  exact_cited_atoms: string[];
  headline: string;
  language: CorpusLanguage;
  gold_G: GoldLabel;
  gold_S: GoldLabel;
  labeler_id: string;
}

export type CorpusCase = GoldCase;

export interface BlindPilotAdministrationEntry {
  case_id: string;
  round: 1 | 2;
  pair_id: string;
  pair_type: "translation" | "segmentation";
  test_dimension: string;
}

export interface BlindPilotRoundPack {
  round: 1 | 2;
  cases: BlindLabelerCase[];
}

export interface CorpusFixture {
  fixture_type: "qualification" | "diagnostic-only";
  cases: GoldCase[];
}

export interface BlindLabelerFixture {
  fixture_type: "unlabelled-blind-labeler";
  cases: BlindLabelerCase[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validLabel = (value: unknown): value is GoldLabel => value === 0 || value === 1;

export function validateCorpus(input: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(input)) return ["Corpus must be an array."];

  const seenIds = new Set<string>();
  const languages = new Set<string>();
  const cells = new Set<string>();
  const allowedFields = new Set(["case_id", "exact_cited_atoms", "headline", "language", "gold_G", "gold_S", "labeler_id"]);

  input.forEach((item, index) => {
    const prefix = `cases[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    const unexpectedFields = Object.keys(item).filter((field) => !allowedFields.has(field));
    if (unexpectedFields.length) errors.push(`${prefix} contains unsupported field(s): ${unexpectedFields.join(", ")}.`);

    if (!nonEmptyString(item.case_id)) errors.push(`${prefix}.case_id must be a non-empty string.`);
    else if (seenIds.has(item.case_id)) errors.push(`${prefix}.case_id "${item.case_id}" is not unique.`);
    else seenIds.add(item.case_id);

    if (!Array.isArray(item.exact_cited_atoms) ||
        item.exact_cited_atoms.length === 0 ||
        item.exact_cited_atoms.some((atom) => !nonEmptyString(atom))) {
      errors.push(`${prefix}.exact_cited_atoms must be a non-empty array of non-empty strings.`);
    }
    if (!nonEmptyString(item.headline)) errors.push(`${prefix}.headline must be a non-empty string.`);

    if (item.language !== "en" && item.language !== "fr") {
      errors.push(`${prefix}.language must be "en" or "fr".`);
    } else {
      languages.add(item.language);
    }

    if (!validLabel(item.gold_G)) errors.push(`${prefix}.gold_G must be 0 or 1.`);
    if (!validLabel(item.gold_S)) errors.push(`${prefix}.gold_S must be 0 or 1.`);
    if (!nonEmptyString(item.labeler_id)) errors.push(`${prefix}.labeler_id must be a non-empty string.`);
    if (validLabel(item.gold_G) && validLabel(item.gold_S)) cells.add(`${item.gold_G},${item.gold_S}`);
  });

  if (!languages.has("en")) errors.push('Corpus must include language "en".');
  if (!languages.has("fr")) errors.push('Corpus must include language "fr".');
  for (const [g, s] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    if (!cells.has(`${g},${s}`)) errors.push(`Corpus is missing G×S cell (${g},${s}).`);
  }
  return errors;
}

export function validateBlindLabelerCases(input: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(input)) return ["Blind-labeler cases must be an array."];
  if (input.length === 0) return ["Blind-labeler cases must not be empty."];
  const ids = new Set<string>();
  const allowedFields = new Set(["case_id", "exact_cited_atoms", "headline", "language"]);

  input.forEach((item, index) => {
    const prefix = `cases[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    const unexpectedFields = Object.keys(item).filter((field) => !allowedFields.has(field));
    if (unexpectedFields.length) errors.push(`${prefix} contains forbidden field(s): ${unexpectedFields.join(", ")}.`);
    if (!nonEmptyString(item.case_id)) errors.push(`${prefix}.case_id must be a non-empty string.`);
    else if (ids.has(item.case_id)) errors.push(`${prefix}.case_id "${item.case_id}" is not unique.`);
    else ids.add(item.case_id);
    if (!Array.isArray(item.exact_cited_atoms) ||
        item.exact_cited_atoms.length === 0 ||
        item.exact_cited_atoms.some((atom) => !nonEmptyString(atom))) {
      errors.push(`${prefix}.exact_cited_atoms must be a non-empty array of non-empty strings.`);
    }
    if (!nonEmptyString(item.headline)) errors.push(`${prefix}.headline must be a non-empty string.`);
    if (item.language !== "en" && item.language !== "fr") {
      errors.push(`${prefix}.language must be "en" or "fr".`);
    }
  });

  return errors;
}

const ADMINISTRATION_KEY_FIELDS = new Set(["case_id", "round", "pair_id", "pair_type", "test_dimension"]);

export function validateBlindPilotAdministrationKey(
  input: unknown,
  caseLanguages?: ReadonlyMap<string, CorpusLanguage>,
): string[] {
  const errors: string[] = [];
  if (!Array.isArray(input)) return ["Administration key must be an array."];
  if (input.length === 0) return ["Administration key must not be empty."];
  const caseIds = new Set<string>();
  const pairs = new Map<string, BlindPilotAdministrationEntry[]>();

  input.forEach((item, index) => {
    const prefix = `administration_key[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    const unexpectedFields = Object.keys(item).filter((field) => !ADMINISTRATION_KEY_FIELDS.has(field));
    if (unexpectedFields.length) errors.push(`${prefix} contains unsupported field(s): ${unexpectedFields.join(", ")}.`);
    if (!nonEmptyString(item.case_id)) errors.push(`${prefix}.case_id must be a non-empty string.`);
    else if (caseIds.has(item.case_id)) errors.push(`${prefix}.case_id "${item.case_id}" must occur exactly once.`);
    else caseIds.add(item.case_id);
    if (item.round !== 1 && item.round !== 2) errors.push(`${prefix}.round must be 1 or 2.`);
    if (!nonEmptyString(item.pair_id)) errors.push(`${prefix}.pair_id must be a non-empty string.`);
    if (item.pair_type !== "translation" && item.pair_type !== "segmentation") {
      errors.push(`${prefix}.pair_type must be "translation" or "segmentation".`);
    }
    if (!nonEmptyString(item.test_dimension)) errors.push(`${prefix}.test_dimension must be a non-empty string.`);

    if (nonEmptyString(item.case_id) && (item.round === 1 || item.round === 2) &&
        nonEmptyString(item.pair_id) &&
        (item.pair_type === "translation" || item.pair_type === "segmentation") &&
        nonEmptyString(item.test_dimension)) {
      const entry = item as unknown as BlindPilotAdministrationEntry;
      pairs.set(entry.pair_id, [...(pairs.get(entry.pair_id) ?? []), entry]);
    }
  });

  for (const [pairId, members] of pairs) {
    if (members.length !== 2) {
      errors.push(`Pair "${pairId}" must have exactly two administration-key members.`);
      continue;
    }
    const [first, second] = members as [BlindPilotAdministrationEntry, BlindPilotAdministrationEntry];
    if (first.pair_type !== second.pair_type || first.test_dimension !== second.test_dimension) {
      errors.push(`Pair "${pairId}" members must share pair_type and test_dimension.`);
    }
    if (first.round === second.round) errors.push(`Pair "${pairId}" members must be in different rounds.`);
    if (caseLanguages) {
      const firstLanguage = caseLanguages.get(first.case_id);
      const secondLanguage = caseLanguages.get(second.case_id);
      if (first.pair_type === "translation" &&
          !(firstLanguage === "en" && secondLanguage === "fr" || firstLanguage === "fr" && secondLanguage === "en")) {
        errors.push(`Translation pair "${pairId}" must contain exactly one EN case and one FR case.`);
      }
      if (first.pair_type === "segmentation" && firstLanguage !== secondLanguage) {
        errors.push(`Segmentation pair "${pairId}" members must have the same language.`);
      }
    }
  }
  return errors;
}

export function validateBlindPilotRoundPack(input: unknown): string[] {
  if (!isRecord(input) || (input.round !== 1 && input.round !== 2)) {
    return ["Round pack must have round 1 or 2."];
  }
  return validateBlindLabelerCases(input.cases).map((error) => `round${input.round}: ${error}`);
}

export function validateBlindPilotCrossRecords(
  roundPacks: { round1: unknown; round2: unknown },
  administrationKey: unknown,
): string[] {
  const errors = [
    ...validateBlindPilotRoundPack({ round: 1, cases: roundPacks.round1 }),
    ...validateBlindPilotRoundPack({ round: 2, cases: roundPacks.round2 }),
    ...validateBlindPilotAdministrationKey(administrationKey),
  ];
  if (errors.length) return errors;

  const caseLanguages = new Map<string, CorpusLanguage>();
  const packRounds = new Map<string, 1 | 2>();
  for (const [round, pack] of [[1, roundPacks.round1], [2, roundPacks.round2]] as const) {
    for (const item of pack as BlindLabelerCase[]) {
      caseLanguages.set(item.case_id, item.language);
      packRounds.set(item.case_id, round);
    }
  }
  errors.push(...validateBlindPilotAdministrationKey(administrationKey, caseLanguages));

  const packOccurrences = new Map<string, number>();
  for (const pack of [roundPacks.round1, roundPacks.round2] as unknown[][]) {
    for (const item of pack as BlindLabelerCase[]) {
      packOccurrences.set(item.case_id, (packOccurrences.get(item.case_id) ?? 0) + 1);
    }
  }
  const keyIds = new Set((administrationKey as BlindPilotAdministrationEntry[]).map((entry) => entry.case_id));
  for (const [caseId, count] of packOccurrences) {
    if (count !== 1) errors.push(`Round-pack case_id "${caseId}" must appear exactly once across both rounds.`);
    if (!keyIds.has(caseId)) errors.push(`Round-pack case_id "${caseId}" is missing from the administration key.`);
  }
  for (const caseId of keyIds) {
    if (!packOccurrences.has(caseId)) errors.push(`Administration-key case_id "${caseId}" is missing from round packs.`);
  }
  for (const entry of administrationKey as BlindPilotAdministrationEntry[]) {
    if (packRounds.has(entry.case_id) && packRounds.get(entry.case_id) !== entry.round) {
      errors.push(`Administration-key case_id "${entry.case_id}" is in the wrong round pack.`);
    }
  }
  return errors;
}

export function assertValidCorpus(input: unknown): asserts input is CorpusCase[] {
  const errors = validateCorpus(input);
  if (errors.length) throw new Error(errors.join("\n"));
}

function assertQualificationFixture(fixture: unknown): asserts fixture is CorpusFixture {
  if (!isRecord(fixture) || fixture.fixture_type !== "qualification") {
    throw new Error("Qualification loader rejects fixtures not explicitly marked qualification.");
  }
  assertValidCorpus(fixture.cases);
}

export function qualificationCasesFromFixture(fixture: unknown): CorpusCase[] {
  assertQualificationFixture(fixture);
  return fixture.cases;
}

export async function loadQualificationFixture(fixturePath: string): Promise<CorpusCase[]> {
  const pathParts = fixturePath.split(/[\\/]+/);
  if (pathParts.includes("diagnostic-only")) {
    throw new Error("Qualification loader rejects diagnostic-only fixture paths.");
  }
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
  return qualificationCasesFromFixture(fixture);
}

export interface Sha256Manifest {
  algorithm: "SHA-256";
  sha256: string;
  byte_length: number;
}

export async function createSha256Manifest(
  inputPath: string,
  manifestPath = fixtureManifestPath(inputPath),
): Promise<Sha256Manifest> {
  if (!isAbsolute(inputPath)) throw new Error("Input fixture path must be absolute.");
  const bytes = await readFile(inputPath);
  const manifest: Sha256Manifest = {
    algorithm: "SHA-256",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byte_length: bytes.byteLength,
  };
  if (!isAbsolute(manifestPath)) throw new Error("Manifest path must be absolute.");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function verifySha256Manifest(
  inputPath: string,
  manifestOrPath: Sha256Manifest | string,
): Promise<boolean> {
  if (!isAbsolute(inputPath)) throw new Error("Input fixture path must be absolute.");
  const manifest = typeof manifestOrPath === "string"
    ? JSON.parse(await readFile(manifestOrPath, "utf8")) as Sha256Manifest
    : manifestOrPath;
  if (manifest.algorithm !== "SHA-256" || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !Number.isSafeInteger(manifest.byte_length) || manifest.byte_length < 0) {
    throw new Error("Invalid SHA-256 manifest.");
  }
  const bytes = await readFile(inputPath);
  return bytes.byteLength === manifest.byte_length &&
    createHash("sha256").update(bytes).digest("hex") === manifest.sha256;
}

export interface IndependentLabel {
  case_id: string;
  gold_G: GoldLabel;
  gold_S: GoldLabel;
}

export interface AgreementDimension {
  count: number;
  raw_agreement: number;
  cohen_kappa: number | null;
}

export interface AgreementResult {
  agreement: { G: AgreementDimension; S: AgreementDimension };
  qualification: IndependentLabel[];
  qualification_gate: {
    passed: boolean;
    disagreement_rate: number;
    maximum_disagreement_rate: number;
    reason: string | null;
  };
  diagnostic: Array<{
    case_id: string;
    G: { left: GoldLabel; right: GoldLabel } | null;
    S: { left: GoldLabel; right: GoldLabel } | null;
  }>;
}

function validateLabelFile(rows: unknown, name: string): asserts rows is IndependentLabel[] {
  if (!Array.isArray(rows)) throw new Error(`${name} label file must be an array.`);
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (!isRecord(row) || !nonEmptyString(row.case_id) ||
        !validLabel(row.gold_G) || !validLabel(row.gold_S)) {
      throw new Error(`${name}[${index}] must contain a case_id and binary gold_G/gold_S labels.`);
    }
    if (ids.has(row.case_id)) throw new Error(`${name} contains duplicate case_id "${row.case_id}".`);
    ids.add(row.case_id);
  }
}

function dimensionAgreement(left: GoldLabel[], right: GoldLabel[]): AgreementDimension {
  const count = left.length;
  const matches = left.reduce<number>((total, value, index) => total + Number(value === right[index]), 0);
  const rawAgreement = matches / count;
  const leftZero = left.filter((value) => value === 0).length / count;
  const rightZero = right.filter((value) => value === 0).length / count;
  const expected = leftZero * rightZero + (1 - leftZero) * (1 - rightZero);
  const kappa = expected === 1 ? (rawAgreement === 1 ? 1 : null) : (rawAgreement - expected) / (1 - expected);
  return { count, raw_agreement: rawAgreement, cohen_kappa: kappa };
}

export function compareIndependentLabels(left: unknown, right: unknown): AgreementResult {
  validateLabelFile(left, "left");
  validateLabelFile(right, "right");
  const leftById = new Map(left.map((row) => [row.case_id, row]));
  const rightById = new Map(right.map((row) => [row.case_id, row]));
  const ids = [...leftById.keys()].sort();
  if (ids.length !== rightById.size || ids.some((id) => !rightById.has(id))) {
    throw new Error("Independent label files must contain the same case IDs.");
  }

  const qualification: IndependentLabel[] = [];
  const diagnostic: AgreementResult["diagnostic"] = [];
  const leftG: GoldLabel[] = [];
  const rightG: GoldLabel[] = [];
  const leftS: GoldLabel[] = [];
  const rightS: GoldLabel[] = [];

  for (const caseId of ids) {
    const first = leftById.get(caseId)!;
    const second = rightById.get(caseId)!;
    leftG.push(first.gold_G);
    rightG.push(second.gold_G);
    leftS.push(first.gold_S);
    rightS.push(second.gold_S);
    const gAgrees = first.gold_G === second.gold_G;
    const sAgrees = first.gold_S === second.gold_S;
    if (gAgrees && sAgrees) {
      qualification.push({ case_id: caseId, gold_G: first.gold_G, gold_S: first.gold_S });
    } else {
      diagnostic.push({
        case_id: caseId,
        G: gAgrees ? null : { left: first.gold_G, right: second.gold_G },
        S: sAgrees ? null : { left: first.gold_S, right: second.gold_S },
      });
    }
  }

  if (!ids.length) throw new Error("Independent label files must not be empty.");
  const disagreementRate = diagnostic.length / ids.length;
  const gatePassed = disagreementRate <= 0.2;
  return {
    agreement: { G: dimensionAgreement(leftG, rightG), S: dimensionAgreement(leftS, rightS) },
    qualification: gatePassed ? qualification : [],
    qualification_gate: {
      passed: gatePassed,
      disagreement_rate: disagreementRate,
      maximum_disagreement_rate: 0.2,
      reason: gatePassed ? null : "Disagreement rate exceeds 20%; qualification is blocked.",
    },
    diagnostic,
  };
}

export async function writeAgreementOutputs(outputDirectory: string, result: AgreementResult): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const outputs: Array<[string, unknown]> = [
    ["agreement.json", result.agreement],
    ["qualification.json", result.qualification],
    ["qualification-gate.json", result.qualification_gate],
    ["diagnostic.json", result.diagnostic],
  ];
  await Promise.all(outputs.map(([file, value]) =>
    writeFile(join(outputDirectory, file), `${JSON.stringify(value, null, 2)}\n`, "utf8")));
}

export async function compareLabelFiles(
  leftPath: string,
  rightPath: string,
  outputDirectory: string,
): Promise<AgreementResult> {
  const [left, right] = await Promise.all([
    readFile(leftPath, "utf8").then((contents) => JSON.parse(contents) as unknown),
    readFile(rightPath, "utf8").then((contents) => JSON.parse(contents) as unknown),
  ]);
  const result = compareIndependentLabels(left, right);
  await writeAgreementOutputs(outputDirectory, result);
  return result;
}

export function fixtureManifestPath(inputPath: string): string {
  return join(dirname(inputPath), `${basename(inputPath)}.sha256.json`);
}
