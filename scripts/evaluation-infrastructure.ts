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
  pair_id: string | null;
}

export interface GoldCase extends BlindLabelerCase {
  gold_G: GoldLabel;
  gold_S: GoldLabel;
  labeler_id: string;
}

export type CorpusCase = GoldCase;

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
  const pairs = new Map<string, CorpusLanguage[]>();

  input.forEach((item, index) => {
    const prefix = `cases[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }

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

    if (item.pair_id !== null && !nonEmptyString(item.pair_id)) {
      errors.push(`${prefix}.pair_id must be null or a non-empty string.`);
    } else if (typeof item.pair_id === "string" && (item.language === "en" || item.language === "fr")) {
      pairs.set(item.pair_id, [...(pairs.get(item.pair_id) ?? []), item.language]);
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
  for (const [pairId, pairLanguages] of pairs) {
    if (pairLanguages.length !== 2 || pairLanguages.filter((language) => language === "en").length !== 1 ||
        pairLanguages.filter((language) => language === "fr").length !== 1) {
      errors.push(`Translation pair "${pairId}" must contain exactly one EN case and one FR case.`);
    }
  }
  return errors;
}

export function validateBlindLabelerCases(input: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(input)) return ["Blind-labeler cases must be an array."];
  const ids = new Set<string>();
  const languages = new Set<string>();
  const pairs = new Map<string, CorpusLanguage[]>();

  input.forEach((item, index) => {
    const prefix = `cases[${index}]`;
    if (!isRecord(item)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    if ("gold_G" in item || "gold_S" in item || "labeler_id" in item) {
      errors.push(`${prefix} must not contain gold labels or labeler identity.`);
    }
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
    } else {
      languages.add(item.language);
    }
    if (item.pair_id !== null && !nonEmptyString(item.pair_id)) {
      errors.push(`${prefix}.pair_id must be null or a non-empty string.`);
    } else if (typeof item.pair_id === "string" && (item.language === "en" || item.language === "fr")) {
      pairs.set(item.pair_id, [...(pairs.get(item.pair_id) ?? []), item.language]);
    }
  });

  if (!languages.has("en")) errors.push('Blind-labeler cases must include language "en".');
  if (!languages.has("fr")) errors.push('Blind-labeler cases must include language "fr".');
  for (const [pairId, pairLanguages] of pairs) {
    if (pairLanguages.length !== 2 || pairLanguages.filter((language) => language === "en").length !== 1 ||
        pairLanguages.filter((language) => language === "fr").length !== 1) {
      errors.push(`Translation pair "${pairId}" must contain exactly one EN case and one FR case.`);
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
