// Runtime validation only; no production writes.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { AI_MODEL } from "@/lib/openai";
import { runD15BSemanticThreadEngine } from "@/lib/d15-semantic-thread-engine";
import { classifyCandidateElicitation } from "@/lib/candidate-elicitation";
import { runD16ShadowRuntimeIntegration } from "@/lib/d16-shadow-runtime-integration";
import {
  buildD16DependencySnapshot,
  buildD16Strategy,
  validateD16Strategy,
  type D16Inputs,
} from "@/lib/d16-personalized-interview-strategy";
import type { RoleCapabilityModel } from "@/lib/role-capability-model";
import type { CandidateElicitation, EvidenceLedger, UnresolvedItem } from "@/lib/canonical-evidence-model";
import { CanonicalShadowExtractionEarlyReturnError } from "@/lib/canonical-shadow-pipeline";
import { CanonicalSupportJudgmentError } from "@/lib/canonical-support-judge";
import { verifyRuntimeCommit } from "@/lib/runtime-provenance";
import { diagnosticSignalOverlap } from "@/lib/professional-mirror";
import { evaluateContextGold, parseContextGold, parseContextGoldPolicy } from "@/lib/context-gold-evaluator";
import type { SessionRecord } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !process.env.OPENAI_API_KEY) {
  throw new Error("Required runtime validation secrets are not configured.");
}

type SessionRow = {
  id: string;
  user_id: string;
  title: string;
  cv_text: string;
  job_description: string;
  cv_analysis: SessionRecord["cv_analysis"];
  interview_strategy: SessionRecord["interview_strategy"];
  preparation_language: SessionRecord["preparation_language"];
  preparation_purpose: SessionRecord["preparation_purpose"];
  interview_date: string | null;
  coaching_focus: string | null;
  job_description_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const contextGold = parseContextGold(process.env.E1_CONTEXT_GOLD_JSON);
const contextPolicy = parseContextGoldPolicy(process.env.E1_CONTEXT_POLICY_JSON);
if (contextGold && !contextPolicy) throw new Error("Configured context gold requires the frozen context policy.");
if (contextPolicy && contextGold && contextGold.some(item => item.session_fingerprint !== contextPolicy.session_fingerprint)) throw new Error("Context gold session fingerprint does not match frozen context policy.");

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function ownershipMarkerInText(text: string): boolean {
  return /\b(?:i|i['’]m|i['’]ve|me|my|mine|je|j['’]ai|moi|mon|ma|mes|we|our|team|teams|nous|notre|nos|équipe|équipes|shared|co-owned|partagé|partagée|partagés|partagées|supervised|under supervision|sous supervision|supervisé|supervisée|report(?:ed)? to|rattaché|rattachée)\b/i.test(text);
}

function surroundingSourceQuote(document: string, quote: string): string {
  const index = document.indexOf(quote);
  if (index < 0) return "";
  const lineStart = document.lastIndexOf("\n", index) + 1;
  const lineEndIndex = document.indexOf("\n", index + quote.length);
  const lineEnd = lineEndIndex >= 0 ? lineEndIndex : document.length;
  return document.slice(lineStart, lineEnd).trim();
}


function ownershipBucket(atomQuote: string, surroundingQuote: string): "A" | "B" | "C" | "D" {
  const markerInAtom = ownershipMarkerInText(atomQuote);
  const markerInSurrounding = ownershipMarkerInText(surroundingQuote);
  if (!markerInAtom) return markerInSurrounding ? "B" : "C";
  const competingRelationship = /\b(?:led by|managed by|under (?:the )?supervision(?: of)?|report(?:ed|s)? to|rattach[ée]?e?\s+à|sous supervision|dirig[ée]?e?\s+par|équipe dirig[ée]?e?\s+par|team led by)\b/i;
  return competingRelationship.test(atomQuote) ? "D" : "A";
}

type SignalMatrixRow = {
  population: number;
  populated: number;
  population_rate: number;
  distinct_values: number;
  eligible_pairs: number;
  shared_value_pairs: number;
  shared_value_pair_rate: number;
};

function normalizeSignalValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean).sort().join("|");
  return String(value ?? "").trim().toLowerCase();
}

function signalMatrix(
  atoms: Array<import("@/lib/canonical-evidence-model").AtomicEvidence>,
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
  pairMatches: (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => boolean,
): SignalMatrixRow {
  const values = atoms.map(getValue).map(normalizeSignalValue);
  const populatedValues = values.filter(Boolean);
  let eligiblePairs = 0;
  let sharedValuePairs = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (!values[i]) continue;
    for (let j = i + 1; j < values.length; j += 1) {
      if (!values[j]) continue;
      eligiblePairs += 1;
      if (pairMatches(atoms[i], atoms[j])) sharedValuePairs += 1;
    }
  }
  return {
    population: atoms.length,
    populated: populatedValues.length,
    population_rate: atoms.length ? Number((populatedValues.length / atoms.length).toFixed(3)) : 0,
    distinct_values: new Set(populatedValues).size,
    eligible_pairs: eligiblePairs,
    shared_value_pairs: sharedValuePairs,
    shared_value_pair_rate: eligiblePairs ? Number((sharedValuePairs / eligiblePairs).toFixed(3)) : 0,
  };
}

function textSignalPair(
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
) {
  return (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    if (typeof leftValue !== "string" || typeof rightValue !== "string") return false;
    if (!leftValue.trim() || !rightValue.trim()) return false;
    return diagnosticSignalOverlap(leftValue, rightValue);
  };
}

function arraySignalPair(
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
) {
  return (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => {
    const leftValues = getValue(left);
    const rightValues = getValue(right);
    if (!Array.isArray(leftValues) || !Array.isArray(rightValues)) return false;
    return leftValues.some((x) =>
      typeof x === "string" && x.trim() &&
      rightValues.some((y) =>
        typeof y === "string" && y.trim() && diagnosticSignalOverlap(x, y),
      ),
    );
  };
}

function exactSignalPair(
  getValue: (atom: import("@/lib/canonical-evidence-model").AtomicEvidence) => unknown,
) {
  return (
    left: import("@/lib/canonical-evidence-model").AtomicEvidence,
    right: import("@/lib/canonical-evidence-model").AtomicEvidence,
  ) => {
    const leftValue = normalizeSignalValue(getValue(left));
    const rightValue = normalizeSignalValue(getValue(right));
    return Boolean(leftValue && rightValue && leftValue === rightValue);
  };
}

function buildSignalPopulationMatrix(atoms: Array<import("@/lib/canonical-evidence-model").AtomicEvidence>) {
  return {
    ownership: signalMatrix(atoms, (atom) => atom.subject.ownership === "UNKNOWN" ? "" : atom.subject.ownership, exactSignalPair((atom) => atom.subject.ownership === "UNKNOWN" ? "" : atom.subject.ownership)),
    outcome: signalMatrix(atoms, (atom) => atom.outcome, textSignalPair((atom) => atom.outcome)),
    scope: signalMatrix(atoms, (atom) => atom.scale.scope, textSignalPair((atom) => atom.scale.scope)),
    quantity: signalMatrix(atoms, (atom) => atom.scale.quantity, exactSignalPair((atom) => atom.scale.quantity)),
    team_size: signalMatrix(atoms, (atom) => atom.scale.team_size, exactSignalPair((atom) => atom.scale.team_size)),
    temporal: signalMatrix(atoms, (atom) => [atom.time.start, atom.time.end, atom.time.recency], exactSignalPair((atom) => [atom.time.start, atom.time.end, atom.time.recency])),
    domain: signalMatrix(atoms, (atom) => atom.context.domain, textSignalPair((atom) => atom.context.domain)),
    action: signalMatrix(atoms, (atom) => atom.action.normalized_action === "UNKNOWN" ? "" : atom.action.normalized_action, textSignalPair((atom) => atom.action.normalized_action === "UNKNOWN" ? "" : atom.action.normalized_action)),
    object: signalMatrix(atoms, (atom) => atom.action.object === "UNKNOWN" ? "" : atom.action.object, (left, right) =>
      left.action.object !== "UNKNOWN" && right.action.object !== "UNKNOWN" &&
      diagnosticSignalOverlap(left.action.object, right.action.object)),
    tools_or_systems: signalMatrix(atoms, (atom) => atom.context.tools_or_systems, arraySignalPair((atom) => atom.context.tools_or_systems)),
    standards: signalMatrix(atoms, (atom) => atom.context.standards, arraySignalPair((atom) => atom.context.standards)),
  };
}

function buildOwnershipStratification(
  diagnostics: Array<{ assertion_type: string; ownership_bucket: "A" | "B" | "C" | "D" }>,
) {
  const byAssertionType: Record<string, { A: number; B: number; C: number; D: number; total: number }> = {};
  for (const item of diagnostics) {
    const row = byAssertionType[item.assertion_type] ?? { A: 0, B: 0, C: 0, D: 0, total: 0 };
    row[item.ownership_bucket] += 1;
    row.total += 1;
    byAssertionType[item.assertion_type] = row;
  }
  const totals = { A: 0, B: 0, C: 0, D: 0, total: diagnostics.length };
  for (const row of Object.values(byAssertionType)) {
    totals.A += row.A; totals.B += row.B; totals.C += row.C; totals.D += row.D;
  }
  return {
    by_assertion_type: byAssertionType,
    totals,
    thresholds: {
      bucket_a_trigger: { minimum_cases: 3, minimum_rate: 0.2 },
      bucket_b_trigger: { minimum_cases: 5, minimum_rate: 0.2 },
    },
  };
}

function redactProtectedCvInput(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[REDACTED_PHONE]")
    .replace(/(Member\s+No\s*:\s*)\d+/gi, "$1[REDACTED_MEMBER_NUMBER]");
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}



const EDF_DECISIVE_FINGERPRINT = "8a05fcb6dbe3";

async function loadSealedAnswers(): Promise<string[]> {
  const seal = await readFile("validation/edf-d16-candidate-answer-seal-2026-10-03.md", "utf8");
  const section = seal.split("## Candidate answers — verbatim")[1]?.split("## Frozen owner decisions")[0] ?? "";
  const matches = [...section.matchAll(/(?:^|\n)([1-5])-\s*([\s\S]*?)(?=\n[1-5]-|$)/g)];
  const answers = matches.map((match) => match[2].trim());
  if (answers.length !== 5 || answers.some((answer) => !answer)) {
    throw new Error("SEALED_ANSWER_PARSE_FAILURE");
  }
  return answers;
}

function buildShadowRoleCapabilityModel(
  requirements: Array<{ id: string; normalized_requirement: string }>,
  roleTitle: string,
): RoleCapabilityModel {
  return {
    version: "rcm-v1",
    model_id: "d16-shadow-runtime",
    role_family: "shadow-runtime",
    role_title: roleTitle || "Runtime Shadow Role",
    requirements: requirements.map((requirement, index) => ({
      capability_id: "D16-SHADOW-CAP-" + String(index + 1),
      normalized_requirement: requirement.normalized_requirement,
      baseline_criticality: index === 0 ? "CRITICAL" : index === 1 ? "IMPORTANT" : "SUPPORTING",
      source: { source_type: "ADMIN_CURATED", source_id: "d16-shadow-runtime", source_version: "1" },
      canonical_requirement_id: requirement.id,
    })),
  };
}

function requirementText(ledger: EvidenceLedger, item: UnresolvedItem): string {
  const requirement = ledger.requirements.find((candidate) => candidate.id === item.requirement_id);
  return [
    requirement?.normalized_requirement ?? "",
    ...(requirement?.facets ?? []).map((facet) => facet.requirement),
  ].join(" ").toLowerCase();
}

function selectUnresolved(ledger: EvidenceLedger, label: string, patterns: readonly RegExp[]): UnresolvedItem {
  const candidates = ledger.unresolved_items
    .map((item) => ({ item, text: requirementText(ledger, item) }))
    .filter(({ text }) => patterns.some((pattern) => pattern.test(text)));
  if (!candidates.length) throw new Error("SEALED_MAPPING_MISS:" + label);
  candidates.sort((a, b) => {
    const aScore = patterns.reduce((score, pattern) => score + Number(pattern.test(a.text)), 0);
    const bScore = patterns.reduce((score, pattern) => score + Number(pattern.test(b.text)), 0);
    return bScore - aScore || a.item.requirement_id.localeCompare(b.item.requirement_id);
  });
  return candidates[0].item;
}

async function applySealedEdfAnswers(
  ledger: EvidenceLedger,
  session: SessionRecord,
): Promise<{ ledger: EvidenceLedger; diagnostics: string[]; mappings: Array<Record<string, string>>; answers: string[] }> {
  if (fingerprint(session.id) !== EDF_DECISIVE_FINGERPRINT) return { ledger, diagnostics: [], mappings: [], answers: [] };
  const answers = await loadSealedAnswers();
  const selectors = [
    { answerIndex: 0, label: "MITSUBISHI_OWNERSHIP", patterns: [/asset management|financement de projet|project finance|private equity|m&a|invest/i] },
    { answerIndex: 1, label: "GOVERNANCE_INTERNAL_CONTROL", patterns: [/gouvernance|governance|contrainte.*groupe|group.*constraint|holding|administration/i] },
    { answerIndex: 2, label: "INVESTOR_FUNDER_RELATIONS", patterns: [/investor|investisseur|funder|fundraising|levée|actionnaire|shareholder|relations? investisseurs?/i] },
    { answerIndex: 3, label: "VALUATION_BOUNDARY", patterns: [/asset management|financement de projet|project finance|private equity|m&a|invest/i] },
  ] as const;

  let next = ledger;
  const diagnostics: string[] = [];
  const mappings: Array<Record<string, string>> = [];
  for (const selector of selectors) {
    const item = selectUnresolved(next, selector.label, selector.patterns);
    const elicitation: CandidateElicitation = {
      id: "SEALED-EDF-" + String(selector.answerIndex + 1),
      unresolved_item_id: item.id,
      question: selector.label === "VALUATION_BOUNDARY"
        ? "Have you personally performed the following professional activities: valuation, financial modelling, due diligence, deal analysis, investment appraisal, IRR/NPV analysis, or transaction execution?"
        : "Builder-written sealed probe; question selection evaluated separately.",
    };
    const classified = await classifyCandidateElicitation(session, next, elicitation, answers[selector.answerIndex]);
    next = classified.ledger;
    diagnostics.push(...classified.diagnostics);
    mappings.push({
      answer: String(selector.answerIndex + 1),
      label: selector.label,
      unresolved_item_id: item.id,
      requirement_id: item.requirement_id,
      elicitation_id: elicitation.id,
    });
  }
  return { ledger: next, diagnostics, mappings, answers };
}

const requestedSessionCount = Number.parseInt(process.env.D15_RUNTIME_SESSION_COUNT ?? "15", 10);
const statusFilter = process.env.D15_RUNTIME_STATUS_FILTER?.trim() || null;
const sessionFingerprintFilter = new Set(
  (process.env.D15_RUNTIME_SESSION_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const runnerArgs = process.argv.slice(2);
const cvJdOnlyMode = runnerArgs.includes("--cv-jd-only-no-answers");
if (runnerArgs.some((arg) => arg !== "--cv-jd-only-no-answers")) {
  throw new Error("Unsupported runtime runner argument.");
}
const sealedStrategyMode = sessionFingerprintFilter.has(EDF_DECISIVE_FINGERPRINT);
if (!Number.isInteger(requestedSessionCount) || requestedSessionCount < 1) {
  throw new Error("D15_RUNTIME_SESSION_COUNT must be a positive integer.");
}
if (sessionFingerprintFilter.size > 0 && sessionFingerprintFilter.size !== requestedSessionCount) {
  throw new Error("D15_RUNTIME_SESSION_FINGERPRINTS count must match D15_RUNTIME_SESSION_COUNT.");
}
if (
  cvJdOnlyMode &&
  (requestedSessionCount !== 1 ||
    sessionFingerprintFilter.size !== 1 ||
    !sessionFingerprintFilter.has(EDF_DECISIVE_FINGERPRINT))
) {
  throw new Error("CV+JD-only experiment requires exactly the frozen EDF session.");
}

const chosen: SessionRow[] = [];
const seenCv = new Set<string>();
for (let offset = 0; chosen.length < requestedSessionCount; offset += 500) {
  let sessionQuery = supabase
    .from("sessions")
    .select("id,user_id,title,cv_text,job_description,cv_analysis,interview_strategy,preparation_language,preparation_purpose,interview_date,coaching_focus,job_description_url,status,created_at,updated_at")
    .not("cv_text", "is", null)
    .not("job_description", "is", null);

  if (statusFilter) sessionQuery = sessionQuery.eq("status", statusFilter);

  const { data, error } = await sessionQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + 499);

  if (error) throw new Error("Supabase session query failed: " + error.message);
  if (!data?.length) break;

  for (const row of data as SessionRow[]) {
    if (!row.cv_text?.trim() || !row.job_description?.trim()) continue;
    const sessionKey = fingerprint(row.id);
    if (sessionFingerprintFilter.size > 0 && !sessionFingerprintFilter.has(sessionKey)) continue;
    const cvKey = fingerprint(row.cv_text);
    if (seenCv.has(cvKey)) continue;
    seenCv.add(cvKey);
    chosen.push(row);
    if (chosen.length === requestedSessionCount) break;
  }

  if (data.length < 500) break;
}

if (chosen.length < requestedSessionCount) {
  throw new Error(`Expected at least ${requestedSessionCount} distinct CV sessions after exhausting session history, found ${chosen.length}.`);
}


async function sourceDigest(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

const checkedOutRuntimeSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const runtimeCommit = verifyRuntimeCommit(checkedOutRuntimeSha, process.env.E1_TRUSTED_RUNTIME_SHA);

const runtimeProvenance = {
  commit: runtimeCommit,
  workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
  model: AI_MODEL,
  source_sha256: {
    extractor: await sourceDigest("src/lib/canonical-shadow-extractor.ts"),
    support_judge: await sourceDigest("src/lib/canonical-support-judge.ts"),
    d15_semantic_engine: await sourceDigest("src/lib/d15-semantic-thread-engine.ts"),
    d16_strategy: await sourceDigest("src/lib/d16-personalized-interview-strategy.ts"),
  },
};

const report = {
  run: {
    mode: cvJdOnlyMode ? "CV_JD_ONLY_D16_EXPERIMENT" : "D15_REAL_SESSION_SHADOW",
    ...(cvJdOnlyMode
      ? {
          experiment_label: "CV + JD only, no candidate answers, product code bfd3f3042fa8ba79a2a96c90c9e222d2d00cfd7c",
          candidate_answers_consumed: 0,
        }
      : {}),
    provenance: runtimeProvenance,
    writes_performed: false,
    sessions_requested: chosen.length,
    requested_session_count: requestedSessionCount,
    d15_d16_connected_flow: true,
    d16_strategy_validation: "REQUIRED",
    distinct_cv_count: new Set(chosen.map((row) => fingerprint(row.cv_text))).size,
    distinct_jd_count: new Set(chosen.map((row) => fingerprint(row.job_description))).size,
    selected_session_fingerprints: chosen.map((row) => ({
      session: fingerprint(row.id),
      cv: fingerprint(row.cv_text),
      jd: fingerprint(row.job_description),
    })),
  },
  sessions: [] as Array<Record<string, unknown>>,
};

for (const row of chosen) {
  const session: SessionRecord = {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    cv_text: redactProtectedCvInput(row.cv_text),
    job_description: row.job_description,
    cv_analysis: row.cv_analysis,
    interview_strategy: row.interview_strategy,
    preparation_language: row.preparation_language,
    preparation_purpose: row.preparation_purpose,
    interview_date: row.interview_date,
    coaching_focus: row.coaching_focus,
    job_description_url: row.job_description_url,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const base = {
    session: fingerprint(row.id),
    cv: fingerprint(row.cv_text),
    jd: fingerprint(row.job_description),
    cv_chars: row.cv_text.length,
    protected_cv_input_redacted: true,
    jd_chars: row.job_description.length,
  };

  try {
    let sealedMappings: Array<Record<string, string>> = [];
    let sealedAnswers: string[] = [];
    let preservedUnresolvedItemIds: string[] = [];
    let candidateAnswersConsumed = 0;
    const result = await runD16ShadowRuntimeIntegration(session, async (ledger, runtimeSession) => {
      if (cvJdOnlyMode) {
        preservedUnresolvedItemIds = ledger.unresolved_items.map((item) => item.id);
        if (
          !ledger.candidate_elicitations.length ||
          ledger.candidate_elicitations.some((elicitation) =>
            elicitation.answer !== undefined || elicitation.classification !== undefined ||
            !ledger.unresolved_items.some((item) => item.id === elicitation.unresolved_item_id)
          )
        ) {
          throw new Error("CV_JD_ONLY_UNANSWERED_ELICITATION_GUARD_FAILED");
        }
        return { ledger, diagnostics: ["CV+JD-only experiment: candidate answer step skipped."] };
      }
      const applied = await applySealedEdfAnswers(ledger, runtimeSession);
      sealedMappings = applied.mappings;
      sealedAnswers = applied.answers;
      candidateAnswersConsumed = applied.mappings.length;
      return { ledger: applied.ledger, diagnostics: applied.diagnostics };
    });

    const elicitedEvidenceCount = result.ledger.evidence.filter(
      (atom) => atom.provenance.source_type === "CANDIDATE_ELICITED",
    ).length;
    if (
      cvJdOnlyMode &&
      (candidateAnswersConsumed !== 0 ||
        elicitedEvidenceCount !== 0 ||
        preservedUnresolvedItemIds.length === 0 ||
        preservedUnresolvedItemIds.some((id) =>
          !result.ledger.unresolved_items.some((item) => item.id === id)
        ))
    ) {
      throw new Error("CV_JD_ONLY_ZERO_ANSWER_OR_UNRESOLVED_PRESERVATION_GUARD_FAILED");
    }

    const canonicalRequirements = result.ledger.requirements.map((requirement) => ({
      id: requirement.id,
      normalized_requirement: requirement.normalized_requirement,
    }));
    const roleCapabilityModel = buildShadowRoleCapabilityModel(canonicalRequirements, row.title);
    const d16InputBase: Omit<D16Inputs, "dependency_snapshot"> = {
      mirror: result.d15,
      bridge: result.d6,
      role_capability_model: roleCapabilityModel,
      ledger: result.ledger,
      canonical_requirements: canonicalRequirements,
      jd_present: Boolean(row.job_description.trim()),
      jd_fingerprint: "sha256:" + createHash("sha256").update(row.job_description, "utf8").digest("hex"),
    };
    const d16Input: D16Inputs = {
      ...d16InputBase,
      dependency_snapshot: buildD16DependencySnapshot(d16InputBase),
    };
    const d16 = buildD16Strategy(d16Input);
    const d16Validation = validateD16Strategy(d16, d16Input);
    if (!d16Validation.valid) throw new Error("D16 strategy validation failed: " + d16Validation.errors.join(" | "));

    const d15Semantic = await runD15BSemanticThreadEngine(result.ledger);
    report.sessions.push({
      ...base,
      outcome: "PASS",
      protocol_stage: "D16_STRATEGY_COMPLETE",
      d16_executed: true,
      requirements: result.ledger.requirements.length,
      evidence_atoms: result.ledger.evidence.length,
      elicited_evidence_atoms: elicitedEvidenceCount,
      ...(cvJdOnlyMode
        ? {
            candidate_answers_consumed: candidateAnswersConsumed,
            unresolved_items_preserved: preservedUnresolvedItemIds.length,
          }
        : {}),
      sealed_answer_mappings: sealedMappings,
      sealed_answer_5: {
        treatment: "ASSESSMENT_CONTEXT_ONLY_NOT_CONSUMED_BY_CURRENT_D16_SCHEMA",
        text: sealedAnswers[4] ?? null,
      },
      support_judgments: result.ledger.support_judgments,
      analogical_transfer_count: result.ledger.support_judgments.filter((item) => item.status === "ANALOGICAL_TRANSFER").length,
      d15_semantic: d15Semantic,
      d16_strategy: d16,
      completeness: result.completeness,
      context_gold_evaluation: contextGold
        ? evaluateContextGold(
            contextGold.filter((item) => item.session_fingerprint === fingerprint(row.id)),
            result.ledger.evidence.filter((atom) => atom.provenance.source_type !== "CANDIDATE_ELICITED").map((atom) => {
              const span = result.ledger.source_spans.find((candidate) => candidate.id === atom.source_span_id);
              return { source_quote: span?.text ?? "", start_offset: span?.start_offset, end_offset: span?.end_offset, domain: atom.context.domain, scope: atom.scale.scope };
            }),
            row.cv_text,
            contextPolicy,
          )
        : { status: "NOT_CONFIGURED", minimum_recall: 0.8 },
      diagnostics_count: result.diagnostics.length,
    });
  } catch (caught) {
    report.sessions.push({
      ...base,
      outcome: "FAIL",
      error: caught instanceof Error ? caught.message : String(caught),
      ...(caught instanceof CanonicalSupportJudgmentError
        ? { support_judge_diagnostic: caught.diagnostic }
        : {}),
      ...(caught instanceof CanonicalShadowExtractionEarlyReturnError
        ? {
            extraction_diagnostics: caught.extraction,
            e1_atom_rejection: rejectionRate(caught.extraction),
            extraction_early_return_reasons: caught.reasons,
          }
        : {}),
    });
  }
}

function rejectionRate(diagnostics: { candidate_atom_count: number; rejected_atoms: ReadonlyArray<string> }) {
  const attempted = diagnostics.candidate_atom_count + diagnostics.rejected_atoms.length;
  return {
    attempted_atom_count: attempted,
    accepted_atom_count: diagnostics.candidate_atom_count,
    rejected_atom_count: diagnostics.rejected_atoms.length,
    rejected_atom_rate: attempted ? Number((diagnostics.rejected_atoms.length / attempted).toFixed(3)) : 0,
  };
}

const failures = report.sessions.filter((item) => item.outcome === "FAIL");
const awaiting = report.sessions.filter((item) => item.outcome === "AWAITING_CANDIDATE_ANSWERS");
const incomplete = report.sessions.filter((item) => (item.completeness as { status?: string } | undefined)?.status === "INCOMPLETE");
const configuredGoldSessions = new Set(contextGold?.map((item) => item.session_fingerprint) ?? []);
const missingGoldSessions = contextGold ? chosen.filter((row) => !configuredGoldSessions.has(fingerprint(row.id))) : [];
const contextGoldFailures = report.sessions.filter((item) => {
  const evaluation = item.context_gold_evaluation as { pass?: boolean; status?: string } | undefined;
  return !evaluation || evaluation.status === "NOT_CONFIGURED" || evaluation.pass !== true;
});
if (cvJdOnlyMode) {
  const candidateAnswersConsumed = report.sessions.reduce(
    (total, item) => total + Number(item.candidate_answers_consumed ?? 0),
    0,
  );
  const elicitedEvidenceAtoms = report.sessions.reduce(
    (total, item) => total + Number(item.elicited_evidence_atoms ?? 0),
    0,
  );
  (report as typeof report & { experiment_gate?: unknown }).experiment_gate = {
    expected_sessions: chosen.length,
    d16_completed: report.sessions.filter((item) => item.d16_executed === true).length,
    candidate_answers_consumed: candidateAnswersConsumed,
    elicited_evidence_atoms: elicitedEvidenceAtoms,
    extraction_incompleteness_labeled: incomplete.length,
    pass: failures.length === 0 &&
      report.sessions.every((item) => item.d16_executed === true) &&
      candidateAnswersConsumed === 0 &&
      elicitedEvidenceAtoms === 0,
  };
} else if (sealedStrategyMode) {
  (report as typeof report & { strategy_gate?: unknown }).strategy_gate = {
    expected_sessions: chosen.length,
    d16_completed: report.sessions.filter((item) => item.d16_executed === true).length,
    extraction_incompleteness_labeled: incomplete.length,
    context_gold_measurement_not_used_as_blocker: true,
    pass: failures.length === 0 && report.sessions.every((item) => item.d16_executed === true),
  };
} else {
  (report as typeof report & { question_gate?: unknown }).question_gate = {
    expected_sessions: chosen.length,
    awaiting_candidate_answers: awaiting.length,
    incomplete_extractions: incomplete.length,
    context_gold_failures: contextGoldFailures.length,
    missing_context_gold_sessions: missingGoldSessions.map((row) => fingerprint(row.id)),
    pass: failures.length === 0 && awaiting.length === chosen.length && incomplete.length === 0 && contextGoldFailures.length === 0 && missingGoldSessions.length === 0,
  };
}

console.log(JSON.stringify(report, null, 2));
await writeFile("d15-real-session-shadow-report.json", JSON.stringify(report, null, 2), "utf8");

if (cvJdOnlyMode) {
  const experimentGate = (report as typeof report & { experiment_gate?: { pass?: boolean } }).experiment_gate;
  if (experimentGate?.pass !== true) process.exitCode = 1;
} else if (sealedStrategyMode) {
  if (failures.length || report.sessions.some((item) => item.d16_executed !== true)) process.exitCode = 1;
} else if (failures.length || awaiting.length !== chosen.length || incomplete.length || contextGoldFailures.length || missingGoldSessions.length) {
  process.exitCode = 1;
}
