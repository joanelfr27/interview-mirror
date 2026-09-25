import type { EvidenceLedger } from "@/lib/canonical-evidence-model";
import type { CanonicalStrategyBridgeProjection, CanonicalStrategyBridgeRequirement } from "@/lib/canonical-strategy-bridge";
import { validateCanonicalStrategyBridgeProjection } from "@/lib/canonical-strategy-bridge";
import {
  roleCapabilityCriticalityOrder,
  validateRoleCapabilityModelAgainstCanonicalRequirements,
  type RoleCapabilityCriticality,
  type RoleCapabilityModel,
} from "@/lib/role-capability-model";
import type { ProfessionalMirror } from "@/lib/professional-mirror";

export const D16_VERSION = "d16-v1" as const;

export type D16EvidenceReferenceMode =
  | "SUPPORTED_EVIDENCE"
  | "NO_CANDIDATE_EVIDENCE"
  | "MIXED_EVIDENCE";

export type AssessmentContext = {
  version: "assessment-context-v1";
  context_id: string;
  requirement_relevance: Record<string, "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN">;
};

export type D16Inputs = {
  mirror: ProfessionalMirror;
  bridge: CanonicalStrategyBridgeProjection;
  role_capability_model: RoleCapabilityModel;
  ledger: EvidenceLedger;
  assessment_context?: AssessmentContext;
  canonical_requirements: Array<{ id: string; normalized_requirement: string }>;
  jd_present: boolean;
};

export type ContextualDelta = {
  scope: boolean;
  ownership: boolean;
  complexity: boolean;
  seniority: boolean;
  scale: boolean;
  domain: boolean;
};

export type StrategicTension = {
  id: string;
  requirement_id: string;
  requirement: string;
  mode: "DIRECT" | "TRANSFERABLE" | "VERIFY_GAP";
  canonical_status: "SUPPORTED" | "PARTIAL" | "UNRESOLVED" | "CONTRADICTED";
  role_criticality: RoleCapabilityCriticality;
  assessment_relevance: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  preparation_priority: number;
  interview_vulnerability: string;
  strategic_significance: string;
  evidence_reference_mode: D16EvidenceReferenceMode;
  evidence_ids: string[];
  evidence_provenance_ids: string[];
  strategic_objective: string;
  prep_objective: string;
  practice_target: string;
  truthfulness_boundary: {
    permitted_claims: string[];
    prohibited_claims: string[];
  };
  contextual_delta: ContextualDelta;
  contradiction_present: boolean;
};

export type D16Action = {
  id: string;
  dispatcher: "PREP" | "PRACTICE" | "EVALUATION";
  requirement_id: string;
  evidence_reference_mode: D16EvidenceReferenceMode;
  evidence_ids: string[];
  evidence_provenance_ids: string[];
  canonical_status: StrategicTension["canonical_status"];
  role_criticality: RoleCapabilityCriticality;
  assessment_relevance: StrategicTension["assessment_relevance"];
  strategic_significance: string;
  prep_objective: string;
  practice_target: string;
  truthfulness_boundary: StrategicTension["truthfulness_boundary"];
};

export type D16Strategy = {
  version: typeof D16_VERSION;
  d6_version: "d6-v1";
  role_capability_model_version: "rcm-v1";
  jd_present: boolean;
  tensions: StrategicTension[];
  actions: D16Action[];
};

const STATUS_PRIORITY: Record<StrategicTension["canonical_status"], number> = {
  CONTRADICTED: 4,
  UNRESOLVED: 3,
  PARTIAL: 2,
  SUPPORTED: 1,
};

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function canonicalRequirementIds(items: Array<{ id: string }>): string[] {
  return [...new Set(items.map((item) => item.id))].sort();
}

function evidenceMode(item: CanonicalStrategyBridgeRequirement, mirror: ProfessionalMirror): D16EvidenceReferenceMode {
  const mirrorIds = new Set(mirror.evidence.map((e) => e.evidence_id));
  const valid = item.evidence.filter((e) => mirrorIds.has(e.evidence_id));
  if (!valid.length) return "NO_CANDIDATE_EVIDENCE";
  const positive = valid.some((e) => e.support_status === "DIRECT" || e.support_status === "PARTIAL" || e.support_status === "ANALOGICAL_TRANSFER");
  const contradictory = valid.some((e) => e.support_status === "CONTRADICTORY");
  if (positive && contradictory) return "MIXED_EVIDENCE";
  return positive ? "SUPPORTED_EVIDENCE" : "NO_CANDIDATE_EVIDENCE";
}

function evidenceIds(item: CanonicalStrategyBridgeRequirement, mirror: ProfessionalMirror): string[] {
  const mirrorIds = new Set(mirror.evidence.map((e) => e.evidence_id));
  return item.evidence.filter((e) => mirrorIds.has(e.evidence_id)).map((e) => e.evidence_id).sort();
}

function provenanceIds(item: CanonicalStrategyBridgeRequirement, ledger: EvidenceLedger): string[] {
  const evidenceById = new Map(ledger.evidence.map((e) => [e.id, e]));
  return item.evidence
    .map((e) => evidenceById.get(e.evidence_id)?.source_span_id)
    .filter((id): id is string => Boolean(id))
    .sort();
}

function contextualDelta(requirement: string, item: CanonicalStrategyBridgeRequirement, rcm: RoleCapabilityModel, mirror: ProfessionalMirror): ContextualDelta {
  const capability = rcm.requirements.find((r) => r.canonical_requirement_id === item.requirement_id);
  const roleText = capability?.normalized_requirement ?? requirement;
  const evidenceText = mirror.evidence
    .filter((e) => item.evidence.some((candidate) => candidate.evidence_id === e.evidence_id))
    .map((e) => e.source_quote)
    .join(" ")
    .toLowerCase();
  const right = roleText.toLowerCase();
  const delta = (terms: string[]) => terms.some((term) => right.includes(term) && !evidenceText.includes(term));
  return {
    scope: delta(["scope", "regional", "global", "multi-country", "multiple"]),
    ownership: delta(["ownership", "own", "lead", "accountable"]),
    complexity: delta(["complex", "transformation", "integration", "advanced"]),
    seniority: delta(["senior", "director", "head", "manager"]),
    scale: delta(["large", "million", "multi-site", "enterprise"]),
    domain: delta(["industry", "sector", "domain", "regulated"]),
  };
}

function deltaCount(delta: ContextualDelta): number {
  return Object.values(delta).filter(Boolean).length;
}

function relevant(
  item: CanonicalStrategyBridgeRequirement,
  assessment?: AssessmentContext,
): AssessmentContext["requirement_relevance"][string] {
  return assessment?.requirement_relevance[item.requirement_id] ?? "UNKNOWN";
}

function isEligible(item: CanonicalStrategyBridgeRequirement, delta: ContextualDelta): boolean {
  if (item.status === "CONTRADICTED" || item.status === "UNRESOLVED" || item.status === "PARTIAL") return true;
  return item.route_mode === "TRANSFERABLE" || deltaCount(delta) > 0;
}

function modeFor(item: CanonicalStrategyBridgeRequirement): StrategicTension["mode"] {
  return item.route_mode;
}

function vulnerabilityFor(
  item: CanonicalStrategyBridgeRequirement,
  mode: StrategicTension["mode"],
  evidence: D16EvidenceReferenceMode,
): string {
  if (item.status === "CONTRADICTED") return "The documented record contains conflicting evidence for this requirement; the interview may probe the discrepancy.";
  if (item.status === "UNRESOLVED" || evidence === "NO_CANDIDATE_EVIDENCE") return "The current evidence does not establish this requirement; the interviewer may ask for a concrete example.";
  if (item.status === "PARTIAL" || mode === "TRANSFERABLE") return "The documented experience is relevant but does not establish every dimension of the target requirement; follow-up may test the transfer.";
  return "The requirement is supported, but follow-up may test scope, ownership, or context.";
}

function significance(
  item: CanonicalStrategyBridgeRequirement,
  criticality: RoleCapabilityCriticality,
  relevanceValue: AssessmentContext["requirement_relevance"][string],
  delta: ContextualDelta,
): string {
  const parts = [
    `${criticality.toLowerCase()} role requirement`,
    item.status.toLowerCase() + " canonical status",
    relevanceValue === "UNKNOWN" ? null : relevanceValue.toLowerCase() + " assessment relevance",
    deltaCount(delta) ? `${deltaCount(delta)} contextual delta(s)` : null,
  ].filter(Boolean);
  return parts.join("; ");
}

function objectiveFor(item: CanonicalStrategyBridgeRequirement, evidence: D16EvidenceReferenceMode): string {
  if (item.status === "CONTRADICTED") return "Reconcile the documented conflict without overstating either side.";
  if (item.status === "UNRESOLVED" || evidence === "NO_CANDIDATE_EVIDENCE") return "Prepare a precise answer that distinguishes what is documented from what is not established.";
  if (item.status === "PARTIAL" || item.route_mode === "TRANSFERABLE") return "Show the closest documented evidence, then explicitly explain the transferable and unproven dimensions.";
  return "Demonstrate the documented requirement with the strongest traceable evidence.";
}

function boundariesFor(item: CanonicalStrategyBridgeRequirement) {
  const permitted = [...new Set(item.boundaries.flatMap((b) => b.permitted_claims))].sort();
  const prohibited = [...new Set(item.boundaries.flatMap((b) => b.prohibited_claims))].sort();
  return { permitted_claims: permitted, prohibited_claims: prohibited };
}

function compareTensions(a: StrategicTension, b: StrategicTension): number {
  return (
    STATUS_PRIORITY[b.canonical_status] - STATUS_PRIORITY[a.canonical_status] ||
    roleCapabilityCriticalityOrder(b.role_criticality) * -1 + roleCapabilityCriticalityOrder(a.role_criticality) ||
    ({ HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[b.assessment_relevance] - { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[a.assessment_relevance]) ||
    deltaCount(b.contextual_delta) - deltaCount(a.contextual_delta) ||
    Number(b.contradiction_present) - Number(a.contradiction_present) ||
    a.requirement_id.localeCompare(b.requirement_id)
  );
}

export function validateD16Inputs(input: D16Inputs): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (input.bridge.version !== "d6-v1") errors.push("D16 requires D6 version d6-v1.");
  if (input.mirror.version !== "d15-v1") errors.push("D16 requires D15 version d15-v1.");
  if (input.role_capability_model.version !== "rcm-v1") errors.push("D16 requires RCM version rcm-v1.");
  if (!Array.isArray(input.canonical_requirements)) errors.push("D16 canonical requirements must be an array.");

  const rcmErrors = validateRoleCapabilityModelAgainstCanonicalRequirements(input.role_capability_model, input.canonical_requirements);
  errors.push(...rcmErrors.map((e) => "RCM: " + e));

  const canonicalIds = canonicalRequirementIds(input.canonical_requirements);
  const bridgeIds = canonicalRequirementIds(input.bridge.requirements.map((r) => ({ id: r.requirement_id })));
  if (JSON.stringify(canonicalIds) !== JSON.stringify(bridgeIds)) errors.push("D16 canonical requirement set diverges from D6.");

  const bridgeSeen = new Set<string>();
  for (const item of input.bridge.requirements) {
    if (bridgeSeen.has(item.requirement_id)) errors.push("D16 duplicate D6 requirement: " + item.requirement_id);
    bridgeSeen.add(item.requirement_id);
    if (!nonBlank(item.requirement_id) || !nonBlank(item.normalized_requirement)) errors.push("D16 D6 requirement identity/text is blank.");
    const canonical = input.canonical_requirements.find((r) => r.id === item.requirement_id);
    if (!canonical) errors.push("D16 D6 requirement is not canonical: " + item.requirement_id);
    else if (canonical.normalized_requirement !== item.normalized_requirement) errors.push("D16 D6 requirement text diverges: " + item.requirement_id);
    if (!["SUPPORTED", "PARTIAL", "UNRESOLVED", "CONTRADICTED", "UNJUDGED"].includes(item.status)) errors.push("D16 unsupported canonical status: " + item.requirement_id);
    if (item.status === "UNJUDGED") errors.push("D16 refuses UNJUDGED requirements: " + item.requirement_id);
  }

  const mirrorEvidence = new Map(input.mirror.evidence.map((e) => [e.evidence_id, e]));
  const ledgerEvidence = new Map(input.ledger.evidence.map((e) => [e.id, e]));
  const spans = new Map(input.ledger.source_spans.map((s) => [s.id, s]));
  for (const item of input.bridge.requirements) {
    for (const evidence of item.evidence) {
      const mirrorRef = mirrorEvidence.get(evidence.evidence_id);
      const atom = ledgerEvidence.get(evidence.evidence_id);
      const span = spans.get(evidence.source_span_id);
      if (!mirrorRef || !atom || !span) errors.push("D16 forged or missing evidence reference: " + evidence.evidence_id);
      if (mirrorRef && (mirrorRef.source_span_id !== evidence.source_span_id || mirrorRef.source_quote !== evidence.source_quote)) errors.push("D16 evidence provenance mismatch: " + evidence.evidence_id);
      if (atom && atom.source_span_id !== evidence.source_span_id) errors.push("D16 evidence atom/source-span mismatch: " + evidence.evidence_id);
      if (span && span.text !== evidence.source_quote) errors.push("D16 evidence quote mismatch: " + evidence.evidence_id);
    }
  }

  if (input.assessment_context) {
    if (input.assessment_context.version !== "assessment-context-v1" || !nonBlank(input.assessment_context.context_id)) errors.push("D16 Assessment Context is malformed.");
    for (const [id, value] of Object.entries(input.assessment_context.requirement_relevance)) {
      if (!bridgeSeen.has(id)) errors.push("D16 Assessment Context references unknown requirement: " + id);
      if (!["HIGH", "MEDIUM", "LOW", "UNKNOWN"].includes(value)) errors.push("D16 Assessment Context relevance is invalid: " + id);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function buildD16Strategy(input: D16Inputs): D16Strategy {
  const validation = validateD16Inputs(input);
  if (!validation.valid) throw new Error("D16 inputs are invalid: " + validation.errors.join(" | "));

  const tensions = input.bridge.requirements
    .map((item) => {
      const rcm = input.role_capability_model.requirements.find((r) => r.canonical_requirement_id === item.requirement_id)!;
      const delta = contextualDelta(item.normalized_requirement, item, input.role_capability_model, input.mirror);
      const assessment = relevant(item, input.assessment_context);
      const mode = modeFor(item);
      const evidence_reference_mode = evidenceMode(item, input.mirror);
      if (!isEligible(item, delta)) return null;
      const objective = objectiveFor(item, evidence_reference_mode);
      return {
        id: `D16-TENSION-${item.requirement_id}`,
        requirement_id: item.requirement_id,
        requirement: item.normalized_requirement,
        mode,
        canonical_status: item.status as StrategicTension["canonical_status"],
        role_criticality: rcm.baseline_criticality,
        assessment_relevance: assessment,
        preparation_priority: 0,
        interview_vulnerability: vulnerabilityFor(item, mode, evidence_reference_mode),
        strategic_significance: significance(item, rcm.baseline_criticality, assessment, delta),
        evidence_reference_mode,
        evidence_ids: evidenceIds(item, input.mirror),
        evidence_provenance_ids: provenanceIds(item, input.ledger),
        strategic_objective: objective,
        prep_objective: objective,
        practice_target: mode === "DIRECT" ? "Demonstrate the requirement with traceable evidence." : mode === "TRANSFERABLE" ? "Practise explaining the transfer without claiming unproven experience." : "Practise a precise boundary statement and clarification response.",
        truthfulness_boundary: boundariesFor(item),
        contextual_delta: delta,
        contradiction_present: item.status === "CONTRADICTED" || item.evidence.some((e) => e.support_status === "CONTRADICTORY"),
      } satisfies StrategicTension;
    })
    .filter((x): x is StrategicTension => Boolean(x))
    .sort(compareTensions)
    .slice(0, 3)
    .map((tension, index) => ({ ...tension, preparation_priority: index + 1 }));

  const actions = dispatchD16Actions(tensions);
  return { version: D16_VERSION, d6_version: "d6-v1", role_capability_model_version: "rcm-v1", jd_present: input.jd_present, tensions, actions };
}

export function dispatchD16Actions(tensions: StrategicTension[]): D16Action[] {
  return tensions.flatMap((tension) => {
    const common = {
      requirement_id: tension.requirement_id,
      evidence_reference_mode: tension.evidence_reference_mode,
      evidence_ids: [...tension.evidence_ids],
      evidence_provenance_ids: [...tension.evidence_provenance_ids],
      canonical_status: tension.canonical_status,
      role_criticality: tension.role_criticality,
      assessment_relevance: tension.assessment_relevance,
      strategic_significance: tension.strategic_significance,
      prep_objective: tension.prep_objective,
      practice_target: tension.practice_target,
      truthfulness_boundary: tension.truthfulness_boundary,
    };
    return [
      { id: tension.id + "-PREP", dispatcher: "PREP" as const, ...common },
      { id: tension.id + "-PRACTICE", dispatcher: "PRACTICE" as const, ...common },
      { id: tension.id + "-EVALUATION", dispatcher: "EVALUATION" as const, ...common },
    ];
  });
}

export function validateD16Strategy(strategy: D16Strategy, input: D16Inputs): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (strategy.version !== D16_VERSION) errors.push("D16 strategy version is invalid.");
  if (strategy.d6_version !== "d6-v1") errors.push("D16 strategy must pin D6 d6-v1.");
  if (strategy.role_capability_model_version !== "rcm-v1") errors.push("D16 strategy must pin RCM rcm-v1.");
  if (strategy.tensions.length > 3) errors.push("D16 candidate-facing tension count exceeds 3.");
  const inputValidation = validateD16Inputs(input);
  errors.push(...inputValidation.errors);
  const canonical = new Set(input.bridge.requirements.map((r) => r.requirement_id));

  const seen = new Set<string>();
  for (const tension of strategy.tensions) {
    if (seen.has(tension.requirement_id)) errors.push("D16 duplicate tension requirement: " + tension.requirement_id);
    seen.add(tension.requirement_id);
    if (!canonical.has(tension.requirement_id)) errors.push("D16 tension references unknown requirement: " + tension.requirement_id);
    const source = input.bridge.requirements.find((r) => r.requirement_id === tension.requirement_id);
    if (!source) continue;
    const expectedMode = modeFor(source);
    if (tension.mode !== expectedMode) errors.push("D16 tension mode is not canonical: " + tension.requirement_id);
    if (tension.canonical_status !== source.status) errors.push("D16 tension status is not canonical: " + tension.requirement_id);
    const rcm = input.role_capability_model.requirements.find((r) => r.canonical_requirement_id === tension.requirement_id);
    if (!rcm || tension.role_criticality !== rcm.baseline_criticality) errors.push("D16 criticality is not canonical: " + tension.requirement_id);
    const expectedEvidence = evidenceMode(source, input.mirror);
    if (tension.evidence_reference_mode !== expectedEvidence) errors.push("D16 evidence mode is not deterministic: " + tension.requirement_id);
    const expectedIds = evidenceIds(source, input.mirror);
    if (JSON.stringify(tension.evidence_ids) !== JSON.stringify(expectedIds)) errors.push("D16 evidence IDs are not traceable: " + tension.requirement_id);
    if (tension.canonical_status === "SUPPORTED" && tension.preparation_priority < 1) errors.push("D16 unsupported preparation priority: " + tension.requirement_id);
    if (!nonBlank(tension.interview_vulnerability)) errors.push("D16 vulnerability is empty: " + tension.requirement_id);
    if (tension.interview_vulnerability.toLowerCase().includes("weakness") || tension.interview_vulnerability.toLowerCase().includes("incompet")) errors.push("D16 vulnerability uses diagnostic language: " + tension.requirement_id);
    if (tension.evidence_reference_mode === "MIXED_EVIDENCE" && !tension.contradiction_present) errors.push("D16 mixed evidence must retain contradiction state: " + tension.requirement_id);
    if (!tension.truthfulness_boundary.permitted_claims.length && !tension.truthfulness_boundary.prohibited_claims.length) errors.push("D16 truthfulness boundary is empty: " + tension.requirement_id);
  }

  const expectedOrder = [...strategy.tensions].sort(compareTensions).map((t) => t.requirement_id);
  if (JSON.stringify(expectedOrder) !== JSON.stringify(strategy.tensions.map((t) => t.requirement_id))) errors.push("D16 tension ordering is not deterministic.");

  for (const action of strategy.actions) {
    const tension = strategy.tensions.find((t) => t.requirement_id === action.requirement_id);
    if (!tension) errors.push("D16 action is untraceable: " + action.id);
    else {
      if (action.evidence_reference_mode !== tension.evidence_reference_mode) errors.push("D16 action evidence mode diverges: " + action.id);
      if (JSON.stringify(action.evidence_ids) !== JSON.stringify(tension.evidence_ids)) errors.push("D16 action evidence diverges: " + action.id);
      if (action.canonical_status !== tension.canonical_status) errors.push("D16 action status diverges: " + action.id);
      if (action.role_criticality !== tension.role_criticality) errors.push("D16 action criticality diverges: " + action.id);
    }
    if (!["PREP", "PRACTICE", "EVALUATION"].includes(action.dispatcher)) errors.push("D16 action dispatcher invalid: " + action.id);
  }

  return { valid: errors.length === 0, errors };
}
