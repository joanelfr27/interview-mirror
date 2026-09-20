/**
 * Interview Mirror — Canonical Evidence Model (E1)
 *
 * Epistemic layer only. UI copy, fit scores, interviewer mind-reading and
 * generated strategy prose do not belong here.
 *
 * Canonical chain:
 * Document -> SourceSpan -> AtomicEvidence (L1)
 * Candidate: L1 -> CompetencyInstance (L2 view) -> CareerTheme (L3 view)
 * Role: SourceSpan -> Requirement -> Facet
 * Support: Atom(s) -> Facet -> RequirementStatus
 * Unresolved -> CandidateElicitation -> GapClassification -> DemonstrationObjective
 */

export type EvidenceSourceType =
  | "CV" | "LINKEDIN" | "APPLICATION" | "CANDIDATE_ELICITED"
  | "INTERVIEW_TRANSCRIPT" | "USER_EDITED";
export type EvidenceLanguage = "en" | "fr" | string;
export type EvidenceOwnership = "INDIVIDUAL" | "TEAM" | "SHARED" | "SUPERVISED" | "UNKNOWN";
export type AssertionType =
  | "STATED" | "QUANTIFIED" | "CREDENTIAL" | "EMPLOYMENT"
  | "RESPONSIBILITY" | "OUTCOME_CLAIM" | "ELICITED";
export type AssertionPolarity = "AFFIRMATIVE" | "NEGATED";

export type VerifiabilitySignals = {
  has_quantifiable_metric: boolean;
  has_third_party_entity: boolean;
  has_time_anchor: boolean;
};

export type SourceSpan = {
  id: string;
  document_id: string;
  text: string;
  start_offset: number;
  end_offset: number;
  language: EvidenceLanguage;
};

export type AtomicEvidence = {
  id: string;
  source_span_id: string;
  provenance: {
    source_type: EvidenceSourceType;
    language: EvidenceLanguage;
    extraction_method: "PARSER" | "LLM" | "USER";
  };
  subject: { actor: string; ownership: EvidenceOwnership };
  action: { normalized_action: string; object: string };
  context: {
    domain?: string;
    jurisdiction?: string;
    situation?: string;
    tools_or_systems?: string[];
    standards?: string[];
  };
  scale: { quantity?: string; currency?: string; team_size?: number; scope?: string };
  time: { start?: string; end?: string; recency?: string };
  outcome: string | null;
  assertion: { type: AssertionType; polarity: AssertionPolarity };
  verifiability: VerifiabilitySignals;
  extraction_confidence: number;
};

export type CompetencyInstance = {
  id: string;
  label: string;
  supporting_evidence_ids: string[];
};

export type CareerTheme = {
  id: string;
  label: string;
  supporting_evidence_ids: string[];
  supporting_competency_ids?: string[];
};

export type RequirementFacetType =
  | "FUNCTION" | "CONTEXT" | "SCOPE" | "SCALE" | "TOOL_METHOD"
  | "LEVEL" | "OWNERSHIP" | "STAKEHOLDER" | "GOVERNANCE" | "OUTCOME";
export type RequirementSalience = "CORE" | "IMPORTANT" | "SUPPORTING" | "CONTEXTUAL";

export type RequirementFacet = {
  id: string;
  type: RequirementFacetType;
  requirement: string;
  source_span_id: string;
};

export type Requirement = {
  id: string;
  source_span_id: string;
  normalized_requirement: string;
  category: string;
  salience: RequirementSalience;
  facets: RequirementFacet[];
  extraction_confidence: number;
};

export type SupportStatus =
  | "DIRECT" | "PARTIAL" | "ANALOGICAL_TRANSFER" | "CONTRADICTORY" | "NONE";

export type SupportJudgment = {
  id: string;
  requirement_id: string;
  facet_id: string;
  status: SupportStatus;
  supporting_evidence_ids: string[];
  rationale: string;
  confidence: number;
  abstained: boolean;
  support_basis: "DOCUMENTED" | "CANDIDATE_SELF_REPORTED";
  analogical_mapping?: { shared_dimensions: string[]; unshared_dimensions: string[] };
  abstention_reason?: string;
};

export type RequirementStatus = "SUPPORTED" | "PARTIAL" | "UNRESOLVED" | "CONTRADICTED";
export type UnresolvedInferenceType = "ABSENT" | "AMBIGUOUS" | "CONFLICTING";

export type UnresolvedItem = {
  id: string;
  requirement_id: string;
  facet_ids: string[];
  type: UnresolvedInferenceType;
  supporting_evidence_ids: string[];
  contradiction_evidence_ids: string[];
  absence_basis: "UNMENTIONED" | "EXPLICIT_CONTRADICTION" | "CONFLICTING_SOURCES";
  negation_evidence_ids: string[];
};

export type CandidateGapClassification = "EVIDENCE_GAP" | "TRANSFERABLE" | "EXPERIENCE_GAP";

export type CandidateElicitation = {
  id: string;
  unresolved_item_id: string;
  question: string;
  answer?: string;
  answer_source_span_id?: string;
  answer_assertion_type?: "ELICITED";
  classification?: CandidateGapClassification;
  classification_rationale?: string;
};

export type DemonstrationObjective = {
  id: string;
  target_unresolved_item_id: string;
  observable_cue: string;
  supporting_true_atom_ids: string[];
  truthfulness_boundary: {
    permitted_claims: string[];
    prohibited_claims: string[];
  };
  candidate_gap_classification?: CandidateGapClassification;
  probe_family?: string;
};

export type EvidenceLedger = {
  source_spans: SourceSpan[];
  evidence: AtomicEvidence[];
  requirements: Requirement[];
  support_judgments: SupportJudgment[];
  requirement_statuses: Array<{ requirement_id: string; status: RequirementStatus }>;
  unresolved_items: UnresolvedItem[];
  candidate_elicitations: CandidateElicitation[];
  demonstration_objectives: DemonstrationObjective[];
  // CompetencyInstance and CareerTheme remain virtual L2/L3 projections over L1.
  // They are intentionally not persisted in the reasoning ledger and never feed LLM support judgments.
};

export type PipelineContext = {
  source_language: EvidenceLanguage;
  product_language: "en" | "fr";
  interview_language: "en" | "fr";
};

const SUPPORT_STATUSES = new Set<SupportStatus>([
  "DIRECT","PARTIAL","ANALOGICAL_TRANSFER","CONTRADICTORY","NONE",
]);
const OWNERSHIPS = new Set<EvidenceOwnership>(["INDIVIDUAL","TEAM","SHARED","SUPERVISED","UNKNOWN"]);
const ASSERTIONS = new Set<AssertionType>([
  "STATED","QUANTIFIED","CREDENTIAL","EMPLOYMENT","RESPONSIBILITY","OUTCOME_CLAIM","ELICITED",
]);
const SOURCE_TYPES = new Set<EvidenceSourceType>([
  "CV","LINKEDIN","APPLICATION","CANDIDATE_ELICITED","INTERVIEW_TRANSCRIPT","USER_EDITED",
]);
const UNRESOLVED_TYPES = new Set<UnresolvedInferenceType>(["ABSENT","AMBIGUOUS","CONFLICTING"]);

function finite01(v: number): boolean { return Number.isFinite(v) && v >= 0 && v <= 1; }

export function validateSourceSpan(value: SourceSpan): string[] {
  const e: string[] = [];
  if (!value.id) e.push("SourceSpan.id is required.");
  if (!value.document_id) e.push("SourceSpan.document_id is required.");
  if (!value.text?.trim()) e.push("SourceSpan.text is required.");
  if (!Number.isInteger(value.start_offset) || value.start_offset < 0) e.push("SourceSpan.start_offset must be a non-negative integer.");
  if (!Number.isInteger(value.end_offset) || value.end_offset < value.start_offset) e.push("SourceSpan.end_offset must be >= start_offset.");
  return e;
}

export function validateAtomicEvidence(value: AtomicEvidence): string[] {
  const e: string[] = [];
  if (!value.id) e.push("AtomicEvidence.id is required.");
  if (!value.source_span_id) e.push("AtomicEvidence.source_span_id is required.");
  if (!SOURCE_TYPES.has(value.provenance?.source_type)) e.push("AtomicEvidence.provenance.source_type is invalid.");
  if (!value.provenance?.language) e.push("AtomicEvidence.provenance.language is required.");
  if (!["PARSER","LLM","USER"].includes(value.provenance?.extraction_method)) e.push("AtomicEvidence.provenance.extraction_method is invalid.");
  if (!value.subject?.actor) e.push("AtomicEvidence.subject.actor is required.");
  if (!OWNERSHIPS.has(value.subject?.ownership)) e.push("AtomicEvidence.subject.ownership is invalid.");
  if (!value.action?.normalized_action) e.push("AtomicEvidence.action.normalized_action is required.");
  if (!value.action?.object) e.push("AtomicEvidence.action.object is required.");
  if (!ASSERTIONS.has(value.assertion?.type)) e.push("AtomicEvidence.assertion.type is invalid.");
  if (!finite01(value.extraction_confidence)) e.push("AtomicEvidence.extraction_confidence must be between 0 and 1.");
  if (value.scale?.team_size !== undefined && (!Number.isInteger(value.scale.team_size) || value.scale.team_size < 0)) e.push("AtomicEvidence.scale.team_size must be a non-negative integer.");
  if (value.provenance?.source_type === "CANDIDATE_ELICITED" && value.assertion?.type !== "ELICITED") e.push("CANDIDATE_ELICITED evidence must have ELICITED assertion type.");
  if (!["AFFIRMATIVE","NEGATED"].includes(value.assertion?.polarity)) e.push("AtomicEvidence.assertion.polarity is invalid.");
  if (value.provenance?.source_type !== "CANDIDATE_ELICITED" && value.assertion?.type === "ELICITED") e.push("ELICITED assertion requires CANDIDATE_ELICITED provenance.");
  return e;
}

export function validateSupportJudgment(value: SupportJudgment): string[] {
  const e: string[] = [];
  if (!value.id) e.push("SupportJudgment.id is required.");
  if (!value.requirement_id) e.push("SupportJudgment.requirement_id is required.");
  if (!value.facet_id) e.push("SupportJudgment.facet_id is required.");
  if (!SUPPORT_STATUSES.has(value.status)) e.push("SupportJudgment.status is invalid.");
  if (!Array.isArray(value.supporting_evidence_ids)) e.push("SupportJudgment.supporting_evidence_ids must be an array.");
  if (!value.rationale?.trim()) e.push("SupportJudgment.rationale is required.");
  if (!finite01(value.confidence)) e.push("SupportJudgment.confidence must be between 0 and 1.");
  if (typeof value.abstained !== "boolean") e.push("SupportJudgment.abstained is required.");
  if (value.abstained && !value.abstention_reason?.trim()) e.push("Abstention requires an abstention_reason.");
  if (value.status === "NONE" && value.supporting_evidence_ids.length > 0) e.push("NONE cannot cite supporting evidence.");
  if (value.status === "CONTRADICTORY" && value.supporting_evidence_ids.length === 0) e.push("CONTRADICTORY must cite evidence.");
  if (value.abstained && value.status !== "NONE") e.push("Abstention may only produce NONE.");
  if (!value.abstained && value.status === "NONE" && value.confidence > 0.5) e.push("A non-abstained NONE judgment cannot carry high confidence.");
  return e;
}

export function validateRequirementGraph(ledger: EvidenceLedger): string[] {
  const errors: string[] = [];
  const evidenceIds = new Set(ledger.evidence.map(x => x.id));
  const requirementIds = new Set(ledger.requirements.map(x => x.id));
  const facetIds = new Set(ledger.requirements.flatMap(x => x.facets.map(f => f.id)));
  const spanIds = new Set(ledger.source_spans.map(x => x.id));

  for (const atom of ledger.evidence) if (!spanIds.has(atom.source_span_id)) errors.push(`Atom ${atom.id} references unknown source span.`);
  for (const req of ledger.requirements) {
    if (!spanIds.has(req.source_span_id)) errors.push(`Requirement ${req.id} references unknown source span.`);
    for (const facet of req.facets) if (!spanIds.has(facet.source_span_id)) errors.push(`Facet ${facet.id} references unknown source span.`);
  }
  for (const j of ledger.support_judgments) {
    if (!requirementIds.has(j.requirement_id)) errors.push(`Support judgment ${j.id} references unknown requirement.`);
    if (!facetIds.has(j.facet_id)) errors.push(`Support judgment ${j.id} references unknown facet.`);
    if (j.status === "NONE" && j.supporting_evidence_ids.length) errors.push(`Support judgment ${j.id}: NONE cannot cite evidence.`);
    if (!["DOCUMENTED","CANDIDATE_SELF_REPORTED"].includes(j.support_basis)) errors.push(`Support judgment ${j.id}: invalid support_basis.`);
    if (j.support_basis === "CANDIDATE_SELF_REPORTED" && j.status === "DIRECT") errors.push(`Support judgment ${j.id}: self-reported undocumented evidence cannot be DIRECT.`);
    if (j.status === "ANALOGICAL_TRANSFER" && (!j.analogical_mapping?.shared_dimensions?.length || !j.analogical_mapping?.unshared_dimensions?.length)) errors.push(`Support judgment ${j.id}: ANALOGICAL_TRANSFER requires shared and unshared dimensions.`);
    if (j.abstained && !j.abstention_reason?.trim()) errors.push(`Support judgment ${j.id}: abstention_reason is required.`);
    for (const id of j.supporting_evidence_ids) if (!evidenceIds.has(id)) errors.push(`Support judgment ${j.id} references unknown evidence ${id}.`);
    const parent = ledger.requirements.find(r => r.id === j.requirement_id);
    if (parent && !parent.facets.some(f => f.id === j.facet_id)) errors.push(`Support judgment ${j.id} facet does not belong to its requirement.`);
  }
  for (const u of ledger.unresolved_items) {
    if (!requirementIds.has(u.requirement_id)) errors.push(`Unresolved item ${u.id} references unknown requirement.`);
    const parent = ledger.requirements.find(r => r.id === u.requirement_id);
    for (const id of u.facet_ids) if (!parent?.facets.some(f => f.id === id)) errors.push(`Unresolved item ${u.id} references invalid facet.`);
    for (const id of [...u.supporting_evidence_ids, ...u.contradiction_evidence_ids]) if (!evidenceIds.has(id)) errors.push(`Unresolved item ${u.id} references unknown evidence.`);
    if (!UNRESOLVED_TYPES.has(u.type)) errors.push(`Unresolved item ${u.id} has invalid type.`);
  }
  for (const rs of ledger.requirement_statuses) {
    const req = ledger.requirements.find(r => r.id === rs.requirement_id);
    if (!req) errors.push(`Requirement status references unknown requirement ${rs.requirement_id}.`);
    else {
      const expected = aggregateRequirementStatus(req, ledger.support_judgments);
      if (expected !== rs.status) errors.push(`Requirement status for ${rs.requirement_id} is ${rs.status} but deterministic aggregation yields ${expected}.`);
    }
  }
  for (const d of ledger.demonstration_objectives) {
    if (!ledger.unresolved_items.some(u => u.id === d.target_unresolved_item_id)) errors.push(`Demonstration objective ${d.id} targets unknown unresolved item.`);
    for (const id of d.supporting_true_atom_ids) if (!evidenceIds.has(id)) errors.push(`Demonstration objective ${d.id} references unknown evidence ${id}.`);
    if (!d.truthfulness_boundary?.permitted_claims?.length && !d.truthfulness_boundary?.prohibited_claims?.length) errors.push(`Demonstration objective ${d.id} has no truthfulness boundary content.`);
  }
  return errors;
}

export function validateDemonstrationObjective(value: DemonstrationObjective): string[] {
  const e: string[] = [];
  if (!value.id) e.push("DemonstrationObjective.id is required.");
  if (!value.target_unresolved_item_id) e.push("DemonstrationObjective.target_unresolved_item_id is required.");
  if (!value.observable_cue?.trim()) e.push("DemonstrationObjective.observable_cue is required.");
  if (!Array.isArray(value.supporting_true_atom_ids)) e.push("supporting_true_atom_ids must be an array.");
  if (!value.truthfulness_boundary || !Array.isArray(value.truthfulness_boundary.permitted_claims) || !Array.isArray(value.truthfulness_boundary.prohibited_claims)) e.push("A truthfulness boundary is required.");
  return e;
}

export function validatePipelineContext(value: PipelineContext): string[] {
  const e: string[] = [];
  if (!value.source_language) e.push("PipelineContext.source_language is required.");
  if (!["en","fr"].includes(value.product_language)) e.push("PipelineContext.product_language must be en or fr.");
  if (!["en","fr"].includes(value.interview_language)) e.push("PipelineContext.interview_language must be en or fr.");
  return e;
}

export function aggregateRequirementStatus(requirement: Requirement, judgments: SupportJudgment[]): RequirementStatus {
  if (!requirement.facets.length) return "UNRESOLVED";
  const relevant = requirement.facets.map(f => judgments.find(j => j.requirement_id === requirement.id && j.facet_id === f.id));
  if (relevant.some(j => j?.status === "CONTRADICTORY")) return "CONTRADICTED";
  if (relevant.every(j => j?.status === "DIRECT")) return "SUPPORTED";
  if (relevant.some(j => j?.status === "DIRECT" || j?.status === "PARTIAL" || j?.status === "ANALOGICAL_TRANSFER")) return "PARTIAL";
  return "UNRESOLVED";
}

export function buildUnresolvedItems(ledger: EvidenceLedger): UnresolvedItem[] {
  const result: UnresolvedItem[] = [];
  for (const req of ledger.requirements) {
    const judgments = req.facets.map(f => ledger.support_judgments.find(j => j.requirement_id === req.id && j.facet_id === f.id));
    const unresolvedFacets = req.facets.filter((_, i) => {
      const j = judgments[i];
      return !j || j.abstained || j.status === "NONE" || j.status === "PARTIAL" || j.status === "ANALOGICAL_TRANSFER";
    });
    if (!unresolvedFacets.length) continue;
    const contradictions = judgments.flatMap(j => j?.status === "CONTRADICTORY" ? j.supporting_evidence_ids : []);
    const support = judgments.flatMap(j => j?.supporting_evidence_ids ?? []);
    const partial = judgments.some(j => j?.status === "PARTIAL" || j?.status === "ANALOGICAL_TRANSFER");
    result.push({
      id: `UNRESOLVED-${req.id}`,
      requirement_id: req.id,
      facet_ids: unresolvedFacets.map(f => f.id),
      type: contradictions.length ? "CONFLICTING" : partial ? "AMBIGUOUS" : "ABSENT",
      supporting_evidence_ids: [...new Set(support)],
      contradiction_evidence_ids: [...new Set(contradictions)],
      absence_basis: contradictions.length ? "EXPLICIT_CONTRADICTION" : "UNMENTIONED",
      negation_evidence_ids: [...new Set(contradictions.filter(id => ledger.evidence.find(e => e.id === id)?.assertion.polarity === "NEGATED"))],
    });
  }
  return result;
}

export function validateDemonstrationEvidenceBinding(objective: DemonstrationObjective, evidence: AtomicEvidence[]): string[] {
  const known = new Set(evidence.map(x => x.id));
  return objective.supporting_true_atom_ids.filter(id => !known.has(id)).map(id => `DemonstrationObjective ${objective.id} references unknown atomic evidence ${id}.`);
}

export function validateSpanBounds(sourceSpan: SourceSpan, documentText: string): string[] {
  if (sourceSpan.start_offset < 0 || sourceSpan.end_offset > documentText.length) return [`SourceSpan ${sourceSpan.id} is outside document bounds.`];
  return documentText.slice(sourceSpan.start_offset, sourceSpan.end_offset) === sourceSpan.text ? [] : [`SourceSpan ${sourceSpan.id} does not exactly match the source document.`];
}

export function forbiddenInferenceViolations(atom: AtomicEvidence): string[] {
  const violations: string[] = [];
  if (atom.provenance.source_type !== "CANDIDATE_ELICITED" && atom.assertion.type === "ELICITED") violations.push("ELICITED assertion type requires CANDIDATE_ELICITED provenance.");
  if (atom.subject.ownership === "UNKNOWN" && /\b(my|I|j'ai|je|mon|ma|mes)\b/i.test(atom.action.normalized_action)) violations.push("Ownership cannot be upgraded from UNKNOWN by wording alone.");
  return violations;
}

export { SUPPORT_STATUSES, UNRESOLVED_TYPES };
