// Runtime validation only; no production writes.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { AI_MODEL } from "@/lib/openai";
import { runD15BSemanticThreadEngine } from "@/lib/d15-semantic-thread-engine";
import { runCanonicalShadowPipeline } from "@/lib/canonical-shadow-pipeline";
import { classifyCandidateElicitation } from "@/lib/candidate-elicitation";
import { buildCanonicalReasoningProjection } from "@/lib/canonical-reasoning-adapter";
import { buildFitGapProjection } from "@/lib/fit-gap-reasoning";
import { buildCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";
import { buildFitGapConsumerProjection } from "@/lib/fit-gap-consumer";
import { buildDemonstrationObjectiveConsumerProjection } from "@/lib/demonstration-objective-consumer";
import { buildCanonicalStrategyBridgeProjection } from "@/lib/canonical-strategy-bridge";
import { buildProfessionalMirror } from "@/lib/professional-mirror";
import {
  buildD16DependencySnapshot,
  buildD16Strategy,
  validateD16Strategy,
  type D16Inputs,
} from "@/lib/d16-personalized-interview-strategy";
import type { RoleCapabilityModel } from "@/lib/role-capability-model";
import type { CandidateElicitation, EvidenceLedger } from "@/lib/canonical-evidence-model";
import { CanonicalShadowExtractionEarlyReturnError } from "@/lib/canonical-shadow-pipeline";
import { CanonicalSupportJudgmentError } from "@/lib/canonical-support-judge";
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



type SealedAnswer = { id: number; target: "experience" | "governance" | "investor" | "interview_context"; answer: string };

function buildShadowRoleCapabilityModel(requirements: Array<{ id: string; normalized_requirement: string }>, roleTitle: string): RoleCapabilityModel {
  return {
    version: "rcm-v1",
    model_id: "d16-sealed-runtime",
    role_family: "shadow-runtime",
    role_title: roleTitle || "Runtime Shadow Role",
    requirements: requirements.map((requirement, index) => ({
      capability_id: "D16-SEALED-CAP-" + String(index + 1),
      normalized_requirement: requirement.normalized_requirement,
      baseline_criticality: index === 0 ? "CRITICAL" : index === 1 ? "IMPORTANT" : "SUPPORTING",
      source: { source_type: "ADMIN_CURATED", source_id: "d16-sealed-runtime", source_version: "1" },
      canonical_requirement_id: requirement.id,
    })),
  };
}

function targetScore(requirement: EvidenceLedger["requirements"][number], target: SealedAnswer["target"]): number {
  const text = JSON.stringify(requirement).toLowerCase();
  const patterns: Record<Exclude<SealedAnswer["target"], "interview_context">, RegExp[]> = {
    experience: [/asset management/i, /financement de projet/i, /project finance/i, /private equity/i, /m&a/i, /7 à 10/i, /7 to 10/i],
    governance: [/gouvernance/i, /governance/i, /contraintes groupe/i, /group constraint/i, /holding/i, /contrôle interne/i, /internal control/i],
    investor: [/investisseur/i, /investor/i, /fundraising/i, /levée de fonds/i, /actionnaire/i, /shareholder/i],
  };
  if (target === "interview_context") return 0;
  return patterns[target].reduce((score, pattern) => score + Number(pattern.test(text)), 0);
}

function mappedElicitation(ledger: EvidenceLedger, target: Exclude<SealedAnswer["target"], "interview_context">, answerId: number): { elicitation: CandidateElicitation; requirement_id: string } {
  const ranked = ledger.requirements
    .map((requirement) => ({ requirement, score: targetScore(requirement, target) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.requirement.id.localeCompare(b.requirement.id));
  if (!ranked.length) throw new Error("No canonical requirement matched sealed answer target: " + target);
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) {
    throw new Error("Ambiguous canonical requirement mapping for sealed answer target: " + target);
  }
  const requirementId = ranked[0].requirement.id;
  const unresolved = ledger.unresolved_items.find((item) => item.requirement_id === requirementId);
  if (!unresolved) throw new Error("Mapped requirement has no canonical unresolved item for sealed answer target: " + target);
  const base = ledger.candidate_elicitations.find((item) => item.unresolved_item_id === unresolved.id);
  if (!base) throw new Error("Mapped unresolved item has no canonical elicitation: " + unresolved.id);
  return {
    requirement_id: requirementId,
    elicitation: { ...base, id: base.id + "-SEALED-" + String(answerId) },
  };
}

function rebuildD16InputsFromLedger(ledger: EvidenceLedger, roleTitle: string, jobDescription: string) {
  const d2 = buildCanonicalReasoningProjection(ledger);
  const fitGap = buildFitGapProjection(d2);
  const d3 = buildCanonicalEvidenceRoute(ledger);
  const d4 = buildFitGapConsumerProjection(fitGap, d3, ledger);
  const d5 = buildDemonstrationObjectiveConsumerProjection(d4, fitGap, d3, ledger);
  const d6 = buildCanonicalStrategyBridgeProjection(d4, fitGap, d3, d5, ledger);
  const mirror = buildProfessionalMirror(ledger);
  const canonicalRequirements = ledger.requirements.map((requirement) => ({
    id: requirement.id,
    normalized_requirement: requirement.normalized_requirement,
  }));
  const roleCapabilityModel = buildShadowRoleCapabilityModel(canonicalRequirements, roleTitle);
  const base: Omit<D16Inputs, "dependency_snapshot"> = {
    mirror,
    bridge: d6,
    role_capability_model: roleCapabilityModel,
    ledger,
    canonical_requirements: canonicalRequirements,
    jd_present: Boolean(jobDescription.trim()),
    jd_fingerprint: "sha256:" + createHash("sha256").update(jobDescription, "utf8").digest("hex"),
  };
  const input: D16Inputs = { ...base, dependency_snapshot: buildD16DependencySnapshot(base) };
  const strategy = buildD16Strategy(input);
  const validation = validateD16Strategy(strategy, input);
  if (!validation.valid) throw new Error("D16 strategy validation failed: " + validation.errors.join(" | "));
  return { input, strategy, mirror, d6 };
}

const sealedAnswerPath = process.env.D16_SEALED_ANSWERS_PATH?.trim() || null;
const sealedAnswers: SealedAnswer[] | null = sealedAnswerPath
  ? JSON.parse(await readFile(sealedAnswerPath, "utf8")) as SealedAnswer[]
  : null;

const requestedSessionCount = Number.parseInt(process.env.D15_RUNTIME_SESSION_COUNT ?? "15", 10);
const statusFilter = process.env.D15_RUNTIME_STATUS_FILTER?.trim() || null;
const sessionFingerprintFilter = new Set(
  (process.env.D15_RUNTIME_SESSION_FINGERPRINTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
if (!Number.isInteger(requestedSessionCount) || requestedSessionCount < 1) {
  throw new Error("D15_RUNTIME_SESSION_COUNT must be a positive integer.");
}
if (sessionFingerprintFilter.size > 0 && sessionFingerprintFilter.size !== requestedSessionCount) {
  throw new Error("D15_RUNTIME_SESSION_FINGERPRINTS count must match D15_RUNTIME_SESSION_COUNT.");
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

const runtimeProvenance = {
  commit: process.env.GITHUB_SHA ?? null,
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
    mode: "D15_REAL_SESSION_SHADOW",
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
    // Stage 1 of the decisive EDF protocol: canonical E1/support judgment ->
    // semantic D15-B Mirror -> candidate questions. D16 must not run until the
    // candidate answers these questions and the answers become canonical evidence.
    const result = await runCanonicalShadowPipeline(session);
    const d15Semantic = await runD15BSemanticThreadEngine(result.ledger);
    const questions = [
      ...d15Semantic.accepted
        .map((thread) => thread.question_back)
        .filter((question): question is string => Boolean(question?.trim())),
      ...(d15Semantic.cv_question_back?.trim() ? [d15Semantic.cv_question_back] : []),
      ...result.ledger.candidate_elicitations.map((item) => item.question).filter(Boolean),
    ].filter((question, index, all) => all.indexOf(question) === index);

    const evidenceText = result.ledger.evidence.map((atom) => {
      const span = result.ledger.source_spans.find((candidate) => candidate.id === atom.source_span_id);
      return span?.text ?? "";
    });
    const transferProbePresence = {
      investment_decision: evidenceText.some((text) => /investment|investissement/i.test(text) && /decision|décision/i.test(text)),
      restricted_funds_reporting: evidenceText.some((text) => /restricted|restreint/i.test(text) && /fund|fonds/i.test(text)),
      multi_country_finance: evidenceText.some((text) => /(?:14\s+African\s+countries|countries|pays)/i.test(text)),
    };

    if (sealedAnswers) {
      let answeredLedger = result.ledger;
      const answerMappings: Array<Record<string, unknown>> = [];
      const interviewContext = sealedAnswers.find((item) => item.target === "interview_context")?.answer ?? null;
      for (const sealed of sealedAnswers.filter((item) => item.target !== "interview_context")) {
        const target = sealed.target as Exclude<SealedAnswer["target"], "interview_context">;
        const mapping = mappedElicitation(answeredLedger, target, sealed.id);
        const classified = await classifyCandidateElicitation(session, answeredLedger, mapping.elicitation, sealed.answer);
        answeredLedger = classified.ledger;
        answerMappings.push({
          answer_id: sealed.id,
          target,
          requirement_id: mapping.requirement_id,
          elicitation_id: mapping.elicitation.id,
          classification: classified.elicitation.classification,
          answer_preserved_verbatim: classified.elicitation.answer === sealed.answer,
        });
      }
      const rebuilt = rebuildD16InputsFromLedger(answeredLedger, row.title, row.job_description);
      report.sessions.push({
        ...base,
        outcome: "PASS_WITH_KNOWN_MEASUREMENT_LIMITATIONS",
        protocol_stage: "D16_STRATEGY_AFTER_SEALED_ANSWERS",
        d16_executed: true,
        requirements: answeredLedger.requirements.length,
        evidence_atoms: answeredLedger.evidence.length,
        completeness: result.completeness,
        answer_mappings: answerMappings,
        interview_context: {
          candidate_answer_verbatim: interviewContext,
          fed_to_candidate_evidence: false,
          fed_to_d16_assessment_context: false,
          limitation: "D16 AssessmentContext v1 has no interview-format narrative field; preserved in runtime report only.",
        },
        support_judgments: answeredLedger.support_judgments,
        elicited_evidence: answeredLedger.evidence.filter((item) => item.provenance.source_type === "CANDIDATE_ELICITED"),
        d15_after_answers: rebuilt.mirror,
        d16_strategy: rebuilt.strategy,
        known_nonblocking_findings: [
          "D15 semantic-engine wiring/codebook issue from run #67 remains under separate investigation.",
          "Builder question-selection probes from run #67 failed the frozen acceptance probes and are tested separately.",
          "Context-gold matching/coverage measurement from run #67 is not used as a blocker for this strategy-quality run.",
          "Support judge model remains frozen; missing transfer classifications are attributed to the judge layer for this experiment.",
        ],
      });
      continue;
    }

    report.sessions.push({
      ...base,
      outcome: "AWAITING_CANDIDATE_ANSWERS",
      protocol_stage: "D15_QUESTION_GATE",
      d16_executed: false,
      d16_block_reason: "Candidate answers must become canonical evidence before D16 strategy generation.",
      requirements: result.ledger.requirements.length,
      evidence_atoms: result.ledger.evidence.length,
      e1_atom_rejection: rejectionRate(result.extraction),
      support_judgments: result.ledger.support_judgments,
      candidate_elicitations: result.ledger.candidate_elicitations,
      transfer_probe_presence: transferProbePresence,
      analogical_transfer_count: result.ledger.support_judgments.filter((item) => item.status === "ANALOGICAL_TRANSFER").length,
      d15_semantic: d15Semantic,
      candidate_questions: questions,
      completeness: result.completeness,
      context_gold_evaluation: contextGold
        ? evaluateContextGold(
            contextGold.filter((item) => item.session_fingerprint === fingerprint(row.id)),
            result.ledger.evidence.map((atom) => {
              const span = result.ledger.source_spans.find((candidate) => candidate.id === atom.source_span_id);
              return {
                source_quote: span?.text ?? "",
                start_offset: span?.start_offset,
                end_offset: span?.end_offset,
                domain: atom.context.domain,
                scope: atom.scale.scope,
              };
            }),
            row.cv_text,
            contextPolicy,
          )
        : { status: "NOT_CONFIGURED", minimum_recall: 0.8 },
      context_population_diagnostic: {
        by_atom: result.extraction.context_population_by_atom_id,
        summary: result.ledger.evidence.reduce(
          (summary, atom) => {
            const item = result.extraction.context_population_by_atom_id[atom.id];
            if (!item) return summary;
            summary.domain.raw_populated += Number(item.raw_domain_populated);
            summary.domain.canonical_populated += Number(item.canonical_domain_populated);
            summary.domain.raw_present_but_canonical_missing += Number(item.raw_domain_populated && !item.canonical_domain_populated);
            summary.scope.raw_populated += Number(item.raw_scope_populated);
            summary.scope.canonical_populated += Number(item.canonical_scope_populated);
            summary.scope.raw_present_but_canonical_missing += Number(item.raw_scope_populated && !item.canonical_scope_populated);
            summary.tools_or_systems.raw_populated += Number(item.raw_tools_populated);
            summary.tools_or_systems.canonical_populated += Number(item.canonical_tools_populated);
            summary.tools_or_systems.raw_present_but_canonical_missing += Number(item.raw_tools_populated && !item.canonical_tools_populated);
            summary.standards.raw_populated += Number(item.raw_standards_populated);
            summary.standards.canonical_populated += Number(item.canonical_standards_populated);
            summary.standards.raw_present_but_canonical_missing += Number(item.raw_standards_populated && !item.canonical_standards_populated);
            return summary;
          },
          {
            domain: { raw_populated: 0, canonical_populated: 0, raw_present_but_canonical_missing: 0 },
            scope: { raw_populated: 0, canonical_populated: 0, raw_present_but_canonical_missing: 0 },
            tools_or_systems: { raw_populated: 0, canonical_populated: 0, raw_present_but_canonical_missing: 0 },
            standards: { raw_populated: 0, canonical_populated: 0, raw_present_but_canonical_missing: 0 },
          },
        ),
      },
      diagnostics_count: result.diagnostics.length,
      signal_population_matrix: buildSignalPopulationMatrix(result.ledger.evidence),
      ownership_stratification: buildOwnershipStratification(
        result.ledger.evidence
          .filter((atom) => atom.subject.ownership === "UNKNOWN")
          .map((atom) => {
            const span = result.ledger.source_spans.find((candidate) => candidate.id === atom.source_span_id);
            const atomQuote = span?.text ?? "";
            const surroundingQuote = surroundingSourceQuote(row.cv_text, atomQuote);
            return {
              assertion_type: atom.assertion.type,
              ownership_bucket: ownershipBucket(atomQuote, surroundingQuote),
            };
          }),
      ),
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
(report as typeof report & { question_gate?: unknown }).question_gate = {
  expected_sessions: chosen.length,
  awaiting_candidate_answers: awaiting.length,
  incomplete_extractions: incomplete.length,
  context_gold_failures: contextGoldFailures.length,
  missing_context_gold_sessions: missingGoldSessions.map((row) => fingerprint(row.id)),
  pass: failures.length === 0 && awaiting.length === chosen.length && incomplete.length === 0 && contextGoldFailures.length === 0 && missingGoldSessions.length === 0,
};

console.log(JSON.stringify(report, null, 2));
await writeFile("d15-real-session-shadow-report.json", JSON.stringify(report, null, 2), "utf8");

if (failures.length || awaiting.length !== chosen.length || incomplete.length || contextGoldFailures.length || missingGoldSessions.length) process.exitCode = 1;
