// Runtime validation only; no production writes.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { runD16ShadowRuntimeIntegration } from "@/lib/d16-shadow-runtime-integration";
import { CanonicalSupportJudgmentError } from "@/lib/canonical-support-judge";
import {
  diagnoseProfessionalMirrorConnections,
  diagnosticSignalOverlap,
} from "@/lib/professional-mirror";
import {
  buildD16DependencySnapshot,
  buildD16Strategy,
  validateD16Strategy,
  type D16Inputs,
} from "@/lib/d16-personalized-interview-strategy";
import type { RoleCapabilityModel } from "@/lib/role-capability-model";
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

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
function buildShadowRoleCapabilityModel(requirements: Array<{ id: string; normalized_requirement: string }>, roleTitle: string): RoleCapabilityModel {
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

const requestedSessionCount = Number.parseInt(process.env.D15_RUNTIME_SESSION_COUNT ?? "15", 10);
const statusFilter = process.env.D15_RUNTIME_STATUS_FILTER?.trim() || null;
if (!Number.isInteger(requestedSessionCount) || requestedSessionCount < 1) {
  throw new Error("D15_RUNTIME_SESSION_COUNT must be a positive integer.");
}

const chosen: SessionRow[] = [];
const seenCv = new Set<string>();
const seenJd = new Set<string>();

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
    const cvKey = fingerprint(row.cv_text);
    const jdKey = fingerprint(row.job_description);
    if (seenCv.has(cvKey) || seenJd.has(jdKey)) continue;
    seenCv.add(cvKey);
    seenJd.add(jdKey);
    chosen.push(row);
    if (chosen.length === requestedSessionCount) break;
  }

  if (data.length < 500) break;
}

if (chosen.length < requestedSessionCount) {
  throw new Error(`Expected at least ${requestedSessionCount} distinct CV/JD sessions after exhausting session history, found ${chosen.length}.`);
}


const report = {
  run: {
    mode: "D15_REAL_SESSION_SHADOW",
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
    cv_text: row.cv_text,
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
    jd_chars: row.job_description.length,
  };

  try {
    const result = await runD16ShadowRuntimeIntegration(session);
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
    if (!d16Validation.valid) {
      throw new Error("D16 strategy validation failed: " + d16Validation.errors.join(" | "));
    }
    const domains = result.ledger.evidence
      .map((atom) => atom.context.domain)
      .filter((value): value is string => Boolean(value?.trim()));

    report.sessions.push({
      ...base,
      outcome: "PASS",
      requirements: result.ledger.requirements.length,
      evidence_atoms: result.ledger.evidence.length,
      evidence_with_domain: domains.length,
      evidence_domain_rate: result.ledger.evidence.length
        ? Number((domains.length / result.ledger.evidence.length).toFixed(3))
        : 0,
      d15_threads: result.d15.threads.length,
      d15_statements: result.d15.statements.length,
      d15_connection_reasons: result.d15.threads.map((thread) => thread.connection_reason),
      d15_thread_evidence_counts: result.d15.threads.map((thread) => thread.evidence_ids.length),
      d15_maturity_counts: result.d15.statements.reduce<Record<string, number>>((acc, statement) => {
        acc[statement.maturity] = (acc[statement.maturity] ?? 0) + 1;
        return acc;
      }, {}),
      d16_version: d16.version,
      d16_d6_version: d16.d6_version,
      d16_role_capability_model_version: d16.role_capability_model_version,
      d16_tensions: d16.tensions.length,
      d16_actions: d16.actions.length,
      d16_tension_requirement_ids: d16.tensions.map((tension) => tension.requirement_id),
      d16_action_dispatchers: d16.actions.map((action) => action.dispatcher),
      d16_dependency_snapshot_matches_d15: d16.dependency_snapshot.d15_fingerprint === buildD16DependencySnapshot(d16Input).d15_fingerprint,
      diagnostics_count: result.diagnostics.length,
      d15_connection_diagnostics: diagnoseProfessionalMirrorConnections(result.ledger),
      ownership_diagnostic: result.ledger.evidence
        .filter((atom) => atom.subject.ownership === "UNKNOWN")
        .map((atom) => {
          const span = result.ledger.source_spans.find((candidate) => candidate.id === atom.source_span_id);
          const atomQuote = span?.text ?? "";
          const surroundingQuote = surroundingSourceQuote(row.cv_text, atomQuote);
          return {
            evidence_id: atom.id,
            raw_llm_ownership: result.extraction_diagnostics.raw_ownership_by_atom_id[atom.id] ?? "UNKNOWN",
            atom_source_quote: atomQuote,
            ownership_marker_in_atom_quote: ownershipMarkerInText(atomQuote),
            surrounding_cv_quote: surroundingQuote,
            ownership_marker_in_surrounding_cv_quote: ownershipMarkerInText(surroundingQuote),
            normalized_action: atom.action.normalized_action,
            object: atom.action.object,
            assertion_type: atom.assertion.type,
            ownership_bucket: ownershipBucket(atomQuote, surroundingQuote),
          };
        }),
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
      wow: {
        thread_count: result.d15.threads.length,
        non_fact_statement_count: result.d15.statements.filter((statement) => statement.kind !== "FACT").length,
        sustained_strength_count: result.d15.statements.filter((statement) => statement.maturity === "SUSTAINED_STRENGTH").length,
        thread_depths: result.d15.threads.map((thread) => new Set(thread.evidence_ids.map((id) => result.ledger.evidence.find((atom) => atom.id === id)?.source_span_id).filter((id): id is string => Boolean(id))).size),
        contextual_delta_tension_count: d16.tensions.filter((tension) => Object.values(tension.contextual_delta).some(Boolean)).length,
        d16_action_count: d16.actions.length,
        d16_actions_with_truth_boundaries: d16.actions.filter((action) => action.truthfulness_boundary.permitted_claims.length > 0 || action.truthfulness_boundary.prohibited_claims.length > 0).length,
        d16_actions_with_evidence_when_available: d16.actions.filter((action) => action.evidence_reference_mode === "NO_CANDIDATE_EVIDENCE" || action.evidence_ids.length > 0).length,
        cv_source_languages: [...new Set(result.ledger.source_spans.filter((span) => span.document_id.startsWith("CV-")).map((span) => span.language))],
        jd_source_languages: [...new Set(result.ledger.source_spans.filter((span) => span.document_id.startsWith("JD-")).map((span) => span.language))],
      },
    });
  } catch (caught) {
    report.sessions.push({
      ...base,
      outcome: "FAIL",
      error: caught instanceof Error ? caught.message : String(caught),
      ...(caught instanceof CanonicalSupportJudgmentError
        ? { support_judge_diagnostic: caught.diagnostic }
        : {}),
    });
  }
}

const failures = report.sessions.filter((item) => item.outcome === "FAIL");
console.log(JSON.stringify(report, null, 2));

const passedSessions = report.sessions.filter((item) => item.outcome === "PASS") as Array<Record<string, unknown>>;
const wow = passedSessions.map((item) => item.wow as Record<string, unknown>).filter(Boolean);
const countAtLeast = (key: string, minimum: number) =>
  wow.filter((item) => Number(item[key] ?? 0) >= minimum).length;

const wowGate = {
  all_sessions_pass: failures.length === 0 && passedSessions.length === chosen.length,
  sessions_with_two_or_more_threads: countAtLeast("thread_count", 2),
  sessions_with_non_fact_story: countAtLeast("non_fact_statement_count", 1),
  sessions_with_contextual_delta: countAtLeast("contextual_delta_tension_count", 1),
  sessions_with_d16_action: countAtLeast("d16_action_count", 1),
  truth_boundary_coverage_100_percent: wow.every((item) => Number(item.d16_action_count ?? 0) === Number(item.d16_actions_with_truth_boundaries ?? 0)),
  evidence_linkage_when_available_100_percent: wow.every((item) => Number(item.d16_action_count ?? 0) === Number(item.d16_actions_with_evidence_when_available ?? 0)),
};

(report as typeof report & { wow_kpis?: unknown }).wow_kpis = {
  target_sessions: requestedSessionCount,
  thresholds: {
    all_sessions_pass: requestedSessionCount,
    sessions_with_two_or_more_threads: Math.max(1, Math.ceil(requestedSessionCount * 0.8)),
    sessions_with_non_fact_story: Math.max(1, Math.ceil(requestedSessionCount * 0.8)),
    sessions_with_contextual_delta: Math.max(1, Math.ceil(requestedSessionCount * 0.8)),
    sessions_with_d16_action: Math.max(1, Math.ceil(requestedSessionCount * 0.8)),
    truth_boundary_coverage_100_percent: true,
    evidence_linkage_when_available_100_percent: true,
  },
  observed: {
    passed_sessions: passedSessions.length,
    ...wowGate,
  },
  pass: wowGate.all_sessions_pass &&
    wowGate.sessions_with_two_or_more_threads >= Math.max(1, Math.ceil(requestedSessionCount * 0.8)) &&
    wowGate.sessions_with_non_fact_story >= Math.max(1, Math.ceil(requestedSessionCount * 0.8)) &&
    wowGate.sessions_with_contextual_delta >= Math.max(1, Math.ceil(requestedSessionCount * 0.8)) &&
    wowGate.sessions_with_d16_action >= Math.max(1, Math.ceil(requestedSessionCount * 0.8)) &&
    wowGate.truth_boundary_coverage_100_percent &&
    wowGate.evidence_linkage_when_available_100_percent,
};

await writeFile(
  "d15-real-session-shadow-report.json",
  JSON.stringify(report, null, 2),
  "utf8",
);

if (failures.length || !(report as typeof report & { wow_kpis: { pass: boolean } }).wow_kpis.pass) process.exitCode = 1;
