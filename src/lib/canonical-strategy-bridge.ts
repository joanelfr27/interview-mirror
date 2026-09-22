import {
  validateCanonicalEvidenceRoute,
  type CanonicalEvidenceRoute,
  type CanonicalEvidenceRouteCandidate,
  type CanonicalEvidenceRouteMode,
} from "@/lib/canonical-evidence-router";

export type CanonicalStrategyEvidenceRef = CanonicalEvidenceRouteCandidate;

export type CanonicalStrategyRequirement = {
  requirement_id: string;
  normalized_requirement: string;
  category: string;
  salience: string;
  status: CanonicalEvidenceRoute["requirements"][number]["status"];
  mode: CanonicalEvidenceRouteMode;
  facets: CanonicalEvidenceRoute["requirements"][number]["facets"];
  candidates: CanonicalStrategyEvidenceRef[];
  unresolved_item_ids: string[];
  elicitation_ids: string[];
  demonstration_objective_ids: string[];
};

export type CanonicalStrategyBridge = {
  version: "d3-strategy-v1";
  requirements: CanonicalStrategyRequirement[];
  unresolved_items: CanonicalEvidenceRoute["unresolved_items"];
  demonstration_objectives: CanonicalEvidenceRoute["demonstration_objectives"];
};

export function buildCanonicalStrategyBridge(
  route: CanonicalEvidenceRoute,
): CanonicalStrategyBridge {
  const validation = validateCanonicalEvidenceRoute(route);
  if (!validation.valid) {
    throw new Error("D3 Strategy bridge rejected invalid canonical route: " + validation.errors.join(" | "));
  }

  return {
    version: "d3-strategy-v1",
    requirements: route.requirements.map((requirement) => ({
      requirement_id: requirement.requirement_id,
      normalized_requirement: requirement.normalized_requirement,
      category: requirement.category,
      salience: requirement.salience,
      status: requirement.status,
      mode: requirement.mode,
      facets: requirement.facets,
      candidates: requirement.candidates.map((candidate) => ({ ...candidate })),
      unresolved_item_ids: [...requirement.unresolved_item_ids],
      elicitation_ids: [...requirement.elicitation_ids],
      demonstration_objective_ids: [...requirement.demonstration_objective_ids],
    })),
    unresolved_items: route.unresolved_items.map((item) => ({
      ...item,
      facet_ids: [...item.facet_ids],
      supporting_evidence: item.supporting_evidence.map((evidence) => ({ ...evidence })),
      contradiction_evidence: item.contradiction_evidence.map((evidence) => ({ ...evidence })),
      elicitation: item.elicitation ? { ...item.elicitation } : null,
    })),
    demonstration_objectives: route.demonstration_objectives.map((objective) => ({
      ...objective,
      supporting_true_atom_ids: [...objective.supporting_true_atom_ids],
      truthfulness_boundary: {
        permitted_claims: [...objective.truthfulness_boundary.permitted_claims],
        prohibited_claims: [...objective.truthfulness_boundary.prohibited_claims],
      },
    })),
  };
}

export function validateCanonicalStrategyBridge(
  bridge: CanonicalStrategyBridge,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (bridge.version !== "d3-strategy-v1") errors.push("D3 Strategy bridge version must be d3-strategy-v1.");

  const requirementIds = new Set<string>();
  for (const requirement of bridge.requirements) {
    if (requirementIds.has(requirement.requirement_id)) {
      errors.push("D3 Strategy bridge contains duplicate requirement: " + requirement.requirement_id);
    }
    requirementIds.add(requirement.requirement_id);

    if (!["DIRECT", "TRANSFERABLE", "VERIFY_GAP"].includes(requirement.mode)) {
      errors.push("D3 Strategy bridge contains invalid mode: " + requirement.requirement_id);
    }

    if (requirement.mode === "DIRECT" && requirement.status !== "SUPPORTED") {
      errors.push("D3 Strategy bridge DIRECT requirement is not SUPPORTED: " + requirement.requirement_id);
    }
    if (
      requirement.mode === "DIRECT" &&
      (requirement.facets.length === 0 || requirement.facets.some((facet) => facet.status !== "DIRECT"))
    ) {
      errors.push("D3 Strategy bridge DIRECT requirement has non-DIRECT facets: " + requirement.requirement_id);
    }
    if (
      requirement.mode === "TRANSFERABLE" &&
      !requirement.facets.some((facet) => facet.status === "ANALOGICAL_TRANSFER")
    ) {
      errors.push("D3 Strategy bridge TRANSFERABLE requirement lacks ANALOGICAL_TRANSFER: " + requirement.requirement_id);
    }
  }

  const unresolvedIds = new Set(bridge.unresolved_items.map((item) => item.unresolved_item_id));
  for (const objective of bridge.demonstration_objectives) {
    if (!unresolvedIds.has(objective.target_unresolved_item_id)) {
      errors.push("D3 Strategy bridge objective has unknown unresolved target: " + objective.id);
    }
  }

  return { valid: errors.length === 0, errors };
}
