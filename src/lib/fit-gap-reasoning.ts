import type { CandidateGapClassification, RequirementStatus, SupportJudgment } from "@/lib/canonical-evidence-model";
import {
  type CanonicalReasoningEvidenceRef,
  type CanonicalReasoningFacet,
  type CanonicalReasoningProjection,
  validateCanonicalReasoningProjection,
} from "@/lib/canonical-reasoning-adapter";

export type FitGapState =
  | "ESTABLISHED"
  | "PARTIAL"
  | "TRANSFERABLE"
  | "UNRESOLVED"
  | "EVIDENCE_GAP"
  | "EXPERIENCE_GAP"
  | "CONTRADICTED";

export type FitGapFacet = {
  facet_id: string;
  type: CanonicalReasoningFacet["type"];
  requirement: string;
  status: SupportJudgment["status"] | "UNJUDGED";
  evidence: CanonicalReasoningEvidenceRef[];
  rationale: string | null;
  confidence: number | null;
};

export type FitGapRequirement = {
  requirement_id: string;
  normalized_requirement: string;
  category: string;
  salience: string;
  requirement_status: RequirementStatus | "UNJUDGED";
  fit_state: FitGapState;
  facets: FitGapFacet[];
  unresolved_item_ids: string[];
  demonstration_objective_ids: string[];
  gap_classification: CandidateGapClassification | null;
};

export type FitGapProjection = {
  version: "d2-v1";
  requirements: FitGapRequirement[];
};

const FIT_GAP_STATES: FitGapState[] = [
  "ESTABLISHED",
  "PARTIAL",
  "TRANSFERABLE",
  "UNRESOLVED",
  "EVIDENCE_GAP",
  "EXPERIENCE_GAP",
  "CONTRADICTED",
];

function classificationForRequirement(
  projection: CanonicalReasoningProjection,
  requirementId: string,
): CandidateGapClassification | null {
  const unresolved = projection.unresolved_items.find(
    (item) => item.requirement_id === requirementId && item.elicitation?.classification,
  );
  return unresolved?.elicitation?.classification ?? null;
}

function stateForRequirement(
  requirementStatus: RequirementStatus | "UNJUDGED",
  classification: CandidateGapClassification | null,
): FitGapState {
  if (classification === "EXPERIENCE_GAP") return "EXPERIENCE_GAP";
  if (classification === "EVIDENCE_GAP") return "EVIDENCE_GAP";
  if (classification === "TRANSFERABLE") return "TRANSFERABLE";

  if (requirementStatus === "SUPPORTED") return "ESTABLISHED";
  if (requirementStatus === "PARTIAL") return "PARTIAL";
  if (requirementStatus === "CONTRADICTED") return "CONTRADICTED";
  return "UNRESOLVED";
}

function objectiveIdsForRequirement(
  projection: CanonicalReasoningProjection,
  unresolvedItemIds: string[],
): string[] {
  const targets = new Set(unresolvedItemIds);
  return projection.demonstration_objectives
    .filter((objective) => targets.has(objective.target_unresolved_item_id))
    .map((objective) => objective.id);
}

export function buildFitGapProjection(
  projection: CanonicalReasoningProjection,
): FitGapProjection {
  const validation = validateCanonicalReasoningProjection(projection);
  if (!validation.valid) {
    throw new Error(validation.errors.join(" | "));
  }

  const requirements = projection.requirements.map((requirement) => {
    const unresolvedItemIds = projection.unresolved_items
      .filter((item) => item.requirement_id === requirement.requirement_id)
      .map((item) => item.unresolved_item_id);

    const gapClassification = classificationForRequirement(
      projection,
      requirement.requirement_id,
    );

    return {
      requirement_id: requirement.requirement_id,
      normalized_requirement: requirement.normalized_requirement,
      category: requirement.category,
      salience: requirement.salience,
      requirement_status: requirement.status,
      fit_state: stateForRequirement(requirement.status, gapClassification),
      facets: requirement.facets.map((facet) => ({ ...facet })),
      unresolved_item_ids: unresolvedItemIds,
      demonstration_objective_ids: objectiveIdsForRequirement(
        projection,
        unresolvedItemIds,
      ),
      gap_classification: gapClassification,
    };
  });

  return {
    version: "d2-v1",
    requirements,
  };
}

export function validateFitGapProjection(
  projection: FitGapProjection,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requirementIds = new Set<string>();

  for (const requirement of projection.requirements) {
    if (!requirement.requirement_id) {
      errors.push("Fit & Gap requirement is missing requirement_id.");
    }
    if (requirementIds.has(requirement.requirement_id)) {
      errors.push(`Duplicate Fit & Gap requirement: ${requirement.requirement_id}.`);
    }
    requirementIds.add(requirement.requirement_id);

    if (!FIT_GAP_STATES.includes(requirement.fit_state)) {
      errors.push(`Requirement ${requirement.requirement_id} has an invalid fit state.`);
    }

    if (requirement.gap_classification === "EXPERIENCE_GAP" &&
        requirement.fit_state !== "EXPERIENCE_GAP") {
      errors.push(`Requirement ${requirement.requirement_id} has an EXPERIENCE_GAP classification but a different fit state.`);
    }
    if (requirement.gap_classification === "EVIDENCE_GAP" &&
        requirement.fit_state !== "EVIDENCE_GAP") {
      errors.push(`Requirement ${requirement.requirement_id} has an EVIDENCE_GAP classification but a different fit state.`);
    }
    if (requirement.gap_classification === "TRANSFERABLE" &&
        requirement.fit_state !== "TRANSFERABLE") {
      errors.push(`Requirement ${requirement.requirement_id} has a TRANSFERABLE classification but a different fit state.`);
    }

    for (const unresolvedId of requirement.unresolved_item_ids) {
      if (!unresolvedId) {
        errors.push(`Requirement ${requirement.requirement_id} contains an empty unresolved item ID.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export { FIT_GAP_STATES };
