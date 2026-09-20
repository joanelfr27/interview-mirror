/**
 * Interview Mirror — Canonical Evidence Model (E1)
 *
 * This module is the canonical epistemic layer for candidate evidence and
 * role requirements. It deliberately contains no UI language, fit scores,
 * interviewer-state claims, or generated strategy prose.
 *
 * Core invariant:
 *   source span -> atomic evidence -> requirement facet -> support judgment
 *
 * Higher-level objects may reference lower-level IDs, but may never replace
 * them as the source of factual truth.
 */

export type EvidenceSourceType =
  | "CV"
  | "LINKEDIN"
  | "APPLICATION"
  | "CANDIDATE_ELICITED"
  | "INTERVIEW_TRANSCRIPT"
  | "USER_EDITED";

export type EvidenceLanguage = "en" | "fr" | string;

export type EvidenceOwnership =
  | "INDIVIDUAL"
  | "TEAM"
  | "SHARED"
  | "SUPERVISED"
  | "UNKNOWN";

export type AssertionType =
  | "STATED"
  | "QUANTIFIED"
  | "CREDENTIAL"
  | "EMPLOYMENT"
  | "RESPONSIBILITY"
  | "OUTCOME_CLAIM"
  | "ELICITED";

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

  subject: {
    actor: string;
    ownership: EvidenceOwnership;
  };

  action: {
    normalized_action: string;
    object: string;
  };

  context: {
    domain?: string;
    jurisdiction?: string;
    situation?: string;
    tools_or_systems?: string[];
    standards?: string[];
  };

  scale: {
    quantity?: string;
    currency?: string;
    team_size?: number;
    scope?: string;
  };

  time: {
    start?: string;
    end?: string;
    recency?: string;
  };

  outcome: string | null;

  assertion: {
    type: AssertionType;
  };

  verifiability: VerifiabilitySignals;

  /**
   * Confidence that the extractor correctly represented the source span.
   * This is NOT a measure of candidate fit or evidence strength.
   */
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
  | "FUNCTION"
  | "CONTEXT"
  | "SCOPE"
  | "SCALE"
  | "TOOL_METHOD"
  | "LEVEL"
  | "OWNERSHIP"
  | "STAKEHOLDER"
  | "GOVERNANCE"
  | "OUTCOME";

export type RequirementSalience =
  | "CORE"
  | "IMPORTANT"
  | "SUPPORTING"
  | "CONTEXTUAL";

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
  | "DIRECT"
  | "PARTIAL"
  | "ANALOGICAL_TRANSFER"
  | "CONTRADICTORY"
  | "NONE";

export type SupportJudgment = {
  id: string;
  requirement_id: string;
  facet_id: string;
  status: SupportStatus;
  supporting_evidence_ids: string[];
  rationale: string;
  /**
   * Confidence in the mapping judgment, not confidence that the candidate
   * actually possesses the capability.
   */
  confidence: number;
  abstained: boolean;
};

export type RequirementStatus =
  | "SUPPORTED"
  | "PARTIAL"
  | "UNRESOLVED"
  | "CONTRADICTED";

export type UnresolvedInferenceType =
  | "ABSENT"
  | "AMBIGUOUS"
  | "CONFLICTING";

export type UnresolvedItem = {
  id: string;
  requirement_id: string;
  facet_ids: string[];
  type: UnresolvedInferenceType;
  supporting_evidence_ids: string[];
  contradiction_evidence_ids: string[];
  /**
   * Optional negative/absence provenance. "UNMENTIONED" means the source
   * simply contains no explicit statement; it must not be treated as a
   * contradiction.
   */
  absence_basis: "UNMENTIONED" | "EXPLICIT_CONTRADICTION" | "CONFLICTING_SOURCES";
};

export type CandidateGapClassification =
  | "EVIDENCE_GAP"
  | "TRANSFERABLE"
  | "EXPERIENCE_GAP";

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
  evidence: AtomicEvidence[];
  requirements: Requirement[];
  support_judgments: SupportJudgment[];
  requirement_statuses: Array<{
    requirement_id: string;
    status: RequirementStatus;
  }>;
  unresolved_items: UnresolvedItem[];
  demonstration_objectives: DemonstrationObjective[];
};

export type PipelineContext = {
  source_language: EvidenceLanguage;
  product_language: "en" | "fr";
  interview_language: "en" | "fr";
};

const SUPPORT_STATUSES = new Set<SupportStatus>([
  "DIRECT",
  "PARTIAL",
  "ANALOGICAL_TRANSFER",
  "CONTRADICTORY",
  "NONE",
]);

const REQUIREMENT_STATUSES = new Set<RequirementStatus>([
  "SUPPORTED",
  "PARTIAL",
  "UNRESOLVED",
  "CONTRADICTED",
]);

const UNRESOLVED_TYPES = new Set<UnresolvedInferenceType>([
  "ABSENT",
  "AMBIGUOUS",
  "CONFLICTING",
]);

function isFiniteUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Runtime guard for canonical evidence. It intentionally checks structure,
 * provenance and bounds, but does not attempt to judge semantic truth.
 */
export function validateAtomicEvidence(value: AtomicEvidence): string[] {
  const errors: string[] = [];

  if (!value.id) errors.push("AtomicEvidence.id is required.");
  if (!value.source_span_id) errors.push("AtomicEvidence.source_span_id is required.");
  if (!value.provenance?.source_type) errors.push("AtomicEvidence.provenance.source_type is required.");
  if (!value.provenance?.language) errors.push("AtomicEvidence.provenance.language is required.");
  if (!value.subject?.actor) errors.push("AtomicEvidence.subject.actor is required.");
  if (!value.subject?.ownership) errors.push("AtomicEvidence.subject.ownership is required.");
  if (!value.action?.normalized_action) errors.push("AtomicEvidence.action.normalized_action is required.");
  if (!value.action?.object) errors.push("AtomicEvidence.action.object is required.");
  if (!value.assertion?.type) errors.push("AtomicEvidence.assertion.type is required.");
  if (!isFiniteUnitInterval(value.extraction_confidence)) {
    errors.push("AtomicEvidence.extraction_confidence must be between 0 and 1.");
  }

  if (value.scale?.team_size !== undefined && (!Number.isInteger(value.scale.team_size) || value.scale.team_size < 0)) {
    errors.push("AtomicEvidence.scale.team_size must be a non-negative integer.");
  }

  const span = value.source_span_id;
  if (!span.trim()) errors.push("AtomicEvidence.source_span_id cannot be blank.");

  return errors;
}

export function validateSourceSpan(value: SourceSpan): string[] {
  const errors: string[] = [];

  if (!value.id) errors.push("SourceSpan.id is required.");
  if (!value.document_id) errors.push("SourceSpan.document_id is required.");
  if (!value.text.trim()) errors.push("SourceSpan.text is required.");
  if (!Number.isInteger(value.start_offset) || value.start_offset < 0) {
    errors.push("SourceSpan.start_offset must be a non-negative integer.");
  }
  if (!Number.isInteger(value.end_offset) || value.end_offset < value.start_offset) {
    errors.push("SourceSpan.end_offset must be >= start_offset.");
  }

  return errors;
}

export function validateSupportJudgment(value: SupportJudgment): string[] {
  const errors: string[] = [];

  if (!value.id) errors.push("SupportJudgment.id is required.");
  if (!value.requirement_id) errors.push("SupportJudgment.requirement_id is required.");
  if (!value.facet_id) errors.push("SupportJudgment.facet_id is required.");
  if (!SUPPORT_STATUSES.has(value.status)) errors.push("SupportJudgment.status is invalid.");
  if (!Array.isArray(value.supporting_evidence_ids)) errors.push("SupportJudgment.supporting_evidence_ids must be an array.");
  if (!value.rationale?.trim()) errors.push("SupportJudgment.rationale is required.");
  if (!isFiniteUnitInterval(value.confidence)) errors.push("SupportJudgment.confidence must be between 0 and 1.");
  if (typeof value.abstained !== "boolean") errors.push("SupportJudgment.abstained is required.");

  if (value.status === "NONE" && value.supporting_evidence_ids.length > 0) {
    errors.push("NONE support cannot cite supporting evidence.");
  }

  if (value.status === "CONTRADICTORY" && value.supporting_evidence_ids.length === 0) {
    errors.push("CONTRADICTORY support must cite the contradictory evidence.");
  }

  if (value.abstained && value.status !== "NONE") {
    errors.push("An abstained judgment must not assert a positive support status.");
  }

  return errors;
}

export function validateDemonstrationObjective(value: DemonstrationObjective): string[] {
  const errors: string[] = [];

  if (!value.id) errors.push("DemonstrationObjective.id is required.");
  if (!value.target_unresolved_item_id) errors.push("DemonstrationObjective.target_unresolved_item_id is required.");
  if (!value.observable_cue?.trim()) errors.push("DemonstrationObjective.observable_cue is required.");
  if (!Array.isArray(value.supporting_true_atom_ids)) {
    errors.push("DemonstrationObjective.supporting_true_atom_ids must be an array.");
  }
  if (!value.truthfulness_boundary) {
    errors.push("DemonstrationObjective.truthfulness_boundary is required.");
  } else {
    if (!Array.isArray(value.truthfulness_boundary.permitted_claims)) {
      errors.push("truthfulness_boundary.permitted_claims must be an array.");
    }
    if (!Array.isArray(value.truthfulness_boundary.prohibited_claims)) {
      errors.push("truthfulness_boundary.prohibited_claims must be an array.");
    }
  }

  return errors;
}

export function validatePipelineContext(value: PipelineContext): string[] {
  const errors: string[] = [];
  if (!value.source_language) errors.push("PipelineContext.source_language is required.");
  if (!["en", "fr"].includes(value.product_language)) errors.push("PipelineContext.product_language must be en or fr.");
  if (!["en", "fr"].includes(value.interview_language)) errors.push("PipelineContext.interview_language must be en or fr.");
  return errors;
}

export function aggregateRequirementStatus(
  requirement: Requirement,
  judgments: SupportJudgment[],
): RequirementStatus {
  const facets = requirement.facets;
  if (!facets.length) return "UNRESOLVED";

  const relevant = facets.map((facet) =>
    judgments.find((judgment) => judgment.requirement_id === requirement.id && judgment.facet_id === facet.id),
  );

  if (relevant.some((judgment) => judgment?.status === "CONTRADICTORY")) {
    return "CONTRADICTED";
  }

  const resolved = relevant.filter(Boolean);
  if (!resolved.length) return "UNRESOLVED";

  const supported = resolved.filter((judgment) => judgment!.status === "DIRECT");
  const partial = resolved.filter((judgment) =>
    judgment!.status === "PARTIAL" || judgment!.status === "ANALOGICAL_TRANSFER",
  );

  if (supported.length === facets.length) return "SUPPORTED";
  if (supported.length > 0 || partial.length > 0) return "PARTIAL";
  return "UNRESOLVED";
}

/**
 * Hard truthfulness invariant:
 * every positive claim in a DemonstrationObjective must be traceable to a real
 * atomic evidence ID. The generator may explain or frame an atom, but may not
 * manufacture a new factual basis.
 */
export function validateDemonstrationEvidenceBinding(
  objective: DemonstrationObjective,
  evidence: AtomicEvidence[],
): string[] {
  const known = new Set(evidence.map((item) => item.id));
  return objective.supporting_true_atom_ids
    .filter((id) => !known.has(id))
    .map((id) => `DemonstrationObjective ${objective.id} references unknown atomic evidence ${id}.`);
}

/**
 * Ensures a source span is genuinely a span of the original document.
 * This is deliberately deterministic and should run after extraction.
 */
export function validateSpanBounds(
  sourceSpan: SourceSpan,
  documentText: string,
): string[] {
  const errors: string[] = [];

  if (sourceSpan.start_offset < 0 || sourceSpan.end_offset > documentText.length) {
    errors.push(`SourceSpan ${sourceSpan.id} is outside document bounds.`);
    return errors;
  }

  const extracted = documentText.slice(sourceSpan.start_offset, sourceSpan.end_offset);
  if (extracted !== sourceSpan.text) {
    errors.push(`SourceSpan ${sourceSpan.id} does not exactly match the source document.`);
  }

  return errors;
}

/**
 * Explicitly rejects the most dangerous ontology regressions.
 */
export function forbiddenInferenceViolations(
  atom: AtomicEvidence,
): string[] {
  const violations: string[] = [];

  const source = atom.provenance.source_type;
  if (source !== "CANDIDATE_ELICITED" && atom.assertion.type === "ELICITED") {
    violations.push("ELICITED assertion type requires CANDIDATE_ELICITED provenance.");
  }

  if (atom.subject.ownership === "UNKNOWN" && /\b(my|I|j'ai|je|mon|ma|mes)\b/i.test(atom.action.normalized_action)) {
    violations.push("Ownership cannot be upgraded from UNKNOWN by wording alone.");
  }

  return violations;
}

export { SUPPORT_STATUSES, REQUIREMENT_STATUSES, UNRESOLVED_TYPES };
