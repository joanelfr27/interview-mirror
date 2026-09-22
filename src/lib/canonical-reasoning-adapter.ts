import type {
  CandidateElicitation,
  DemonstrationObjective,
  EvidenceLedger,
  Requirement,
  RequirementFacet,
  RequirementStatus,
  SupportJudgment,
  UnresolvedItem,
} from "@/lib/canonical-evidence-model";
import { validateRequirementGraph } from "@/lib/canonical-evidence-model";

export type CanonicalReasoningEvidenceRef = {
  evidence_id: string;
  source_span_id: string;
  source_quote: string;
};

export type CanonicalReasoningFacet = {
  facet_id: string;
  type: RequirementFacet["type"];
  requirement: string;
  status: SupportJudgment["status"] | "UNJUDGED";
  evidence: CanonicalReasoningEvidenceRef[];
  rationale: string | null;
  confidence: number | null;
};

export type CanonicalReasoningRequirement = {
  requirement_id: string;
  normalized_requirement: string;
  category: string;
  salience: Requirement["salience"];
  status: RequirementStatus | "UNJUDGED";
  facets: CanonicalReasoningFacet[];
};

export type CanonicalReasoningUnresolved = {
  unresolved_item_id: string;
  requirement_id: string;
  facet_ids: string[];
  type: UnresolvedItem["type"];
  supporting_evidence: CanonicalReasoningEvidenceRef[];
  contradiction_evidence: CanonicalReasoningEvidenceRef[];
  elicitation: CandidateElicitation | null;
};

export type CanonicalReasoningProjection = {
  version: "d1-v1";
  requirements: CanonicalReasoningRequirement[];
  unresolved_items: CanonicalReasoningUnresolved[];
  demonstration_objectives: DemonstrationObjective[];
};

export type CanonicalReasoningValidation = {
  valid: boolean;
  errors: string[];
};

function evidenceRef(
  ledger: EvidenceLedger,
  evidenceId: string,
): CanonicalReasoningEvidenceRef | null {
  const atom = ledger.evidence.find((item) => item.id === evidenceId);
  if (!atom) return null;
  const span = ledger.source_spans.find((item) => item.id === atom.source_span_id);
  if (!span) return null;
  return {
    evidence_id: atom.id,
    source_span_id: span.id,
    source_quote: span.text,
  };
}

function judgmentForFacet(
  ledger: EvidenceLedger,
  requirementId: string,
  facetId: string,
): SupportJudgment | null {
  return ledger.support_judgments.find(
    (item) => item.requirement_id === requirementId && item.facet_id === facetId,
  ) ?? null;
}

function requirementStatus(
  ledger: EvidenceLedger,
  requirementId: string,
): RequirementStatus | "UNJUDGED" {
  return ledger.requirement_statuses.find((item) => item.requirement_id === requirementId)?.status
    ?? "UNJUDGED";
}

function buildFacet(
  ledger: EvidenceLedger,
  requirement: Requirement,
  facet: RequirementFacet,
): CanonicalReasoningFacet {
  const judgment = judgmentForFacet(ledger, requirement.id, facet.id);
  const evidence = (judgment?.supporting_evidence_ids ?? [])
    .map((id) => evidenceRef(ledger, id))
    .filter((item): item is CanonicalReasoningEvidenceRef => Boolean(item));

  return {
    facet_id: facet.id,
    type: facet.type,
    requirement: facet.requirement,
    status: judgment?.status ?? "UNJUDGED",
    evidence,
    rationale: judgment?.rationale ?? null,
    confidence: judgment ? judgment.confidence : null,
  };
}

function validateLedgerReferences(ledger: EvidenceLedger): string[] {
  return validateRequirementGraph(ledger);
}

export function buildCanonicalReasoningProjection(
  ledger: EvidenceLedger,
): CanonicalReasoningProjection {
  const ledgerErrors = validateLedgerReferences(ledger);
  if (ledgerErrors.length) throw new Error(ledgerErrors.join(" | "));

  const requirements = ledger.requirements.map((requirement) => ({
    requirement_id: requirement.id,
    normalized_requirement: requirement.normalized_requirement,
    category: requirement.category,
    salience: requirement.salience,
    status: requirementStatus(ledger, requirement.id),
    facets: requirement.facets.map((facet) => buildFacet(ledger, requirement, facet)),
  }));

  const unresolved_items = ledger.unresolved_items.map((item) => {
    const elicitation =
      ledger.candidate_elicitations.find((candidate) => candidate.unresolved_item_id === item.id)
      ?? null;

    return {
      unresolved_item_id: item.id,
      requirement_id: item.requirement_id,
      facet_ids: item.facet_ids,
      type: item.type,
      supporting_evidence: item.supporting_evidence_ids
        .map((id) => evidenceRef(ledger, id))
        .filter((ref): ref is CanonicalReasoningEvidenceRef => Boolean(ref)),
      contradiction_evidence: item.contradiction_evidence_ids
        .map((id) => evidenceRef(ledger, id))
        .filter((ref): ref is CanonicalReasoningEvidenceRef => Boolean(ref)),
      elicitation,
    };
  });

  return {
    version: "d1-v1",
    requirements,
    unresolved_items,
    demonstration_objectives: ledger.demonstration_objectives,
  };
}

export function validateCanonicalReasoningProjection(
  projection: CanonicalReasoningProjection,
): CanonicalReasoningValidation {
  const errors: string[] = [];
  const requirementIds = new Set<string>();
  const facetIds = new Set<string>();

  for (const requirement of projection.requirements) {
    if (!requirement.requirement_id) errors.push("Requirement projection is missing requirement_id.");
    if (requirementIds.has(requirement.requirement_id)) {
      errors.push(`Duplicate projected requirement: ${requirement.requirement_id}.`);
    }
    requirementIds.add(requirement.requirement_id);

    for (const facet of requirement.facets) {
      if (!facet.facet_id) errors.push(`Requirement ${requirement.requirement_id} has a facet without facet_id.`);
      if (facetIds.has(facet.facet_id)) errors.push(`Duplicate projected facet: ${facet.facet_id}.`);
      facetIds.add(facet.facet_id);

      if (
        facet.status !== "UNJUDGED" &&
        !["DIRECT", "PARTIAL", "ANALOGICAL_TRANSFER", "CONTRADICTORY", "NONE"].includes(facet.status)
      ) {
        errors.push(`Facet ${facet.facet_id} has an invalid support status.`);
      }

      for (const evidence of facet.evidence) {
        if (!evidence.evidence_id || !evidence.source_span_id || !evidence.source_quote.trim()) {
          errors.push(`Facet ${facet.facet_id} contains an invalid evidence reference.`);
        }
      }
    }
  }

  for (const item of projection.unresolved_items) {
    if (!item.unresolved_item_id) errors.push("Unresolved projection is missing unresolved_item_id.");
    if (!requirementIds.has(item.requirement_id)) {
      errors.push(`Unresolved item ${item.unresolved_item_id} references an unknown requirement.`);
    }
    for (const facetId of item.facet_ids) {
      if (!facetIds.has(facetId)) {
        errors.push(`Unresolved item ${item.unresolved_item_id} references an unknown facet: ${facetId}.`);
      }
    }
  }

  for (const objective of projection.demonstration_objectives) {
    if (!objective.id || !objective.target_unresolved_item_id) {
      errors.push("Demonstration objective is missing its identity or unresolved target.");
    }
    if (
      !projection.unresolved_items.some(
        (item) => item.unresolved_item_id === objective.target_unresolved_item_id,
      )
    ) {
      errors.push(`Demonstration objective ${objective.id} references an unknown unresolved item.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
