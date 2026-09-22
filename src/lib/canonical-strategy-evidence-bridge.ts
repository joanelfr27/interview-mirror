import type { CanonicalEvidenceRoute, CanonicalEvidenceRouteMode } from "@/lib/canonical-evidence-router";
import { validateCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";

export type CanonicalStrategyEvidenceRef = {
  evidence_id: string;
  source_span_id: string;
  source_quote: string;
};

export type CanonicalStrategyRequirement = {
  requirement_id: string;
  normalized_requirement: string;
  category: string;
  salience: string;
  status: string;
  mode: CanonicalEvidenceRouteMode;
  evidence: CanonicalStrategyEvidenceRef[];
  unresolved_item_ids: string[];
  elicitation_ids: string[];
  demonstration_objective_ids: string[];
};

export type CanonicalStrategyEvidenceContext = {
  version: "d3-strategy-v1";
  authoritative: true;
  requirements: CanonicalStrategyRequirement[];
};

export function buildCanonicalStrategyEvidenceContext(
  route: CanonicalEvidenceRoute,
): CanonicalStrategyEvidenceContext {
  const validation = validateCanonicalEvidenceRoute(route);
  if (!validation.valid) {
    throw new Error("D3 Strategy bridge received an invalid canonical route: " + validation.errors.join(" | "));
  }

  return {
    version: "d3-strategy-v1",
    authoritative: true,
    requirements: route.requirements.map((requirement) => ({
      requirement_id: requirement.requirement_id,
      normalized_requirement: requirement.normalized_requirement,
      category: requirement.category,
      salience: requirement.salience,
      status: requirement.status,
      mode: requirement.mode,
      evidence: requirement.candidates.map((candidate) => ({
        evidence_id: candidate.evidence_id,
        source_span_id: candidate.source_span_id,
        source_quote: candidate.source_quote,
      })),
      unresolved_item_ids: [...requirement.unresolved_item_ids],
      elicitation_ids: [...requirement.elicitation_ids],
      demonstration_objective_ids: [...requirement.demonstration_objective_ids],
    })),
  };
}

/**
 * Canonical mode is authoritative whenever a D3 context is supplied.
 * Legacy inference is permitted only as a compatibility check: disagreement
 * is an explicit failure, never a silent precedence decision.
 */
export function assertCanonicalStrategyMode(
  context: CanonicalStrategyEvidenceContext,
  requirementId: string,
  legacyMode?: CanonicalEvidenceRouteMode,
): CanonicalEvidenceRouteMode {
  const requirement = context.requirements.find((item) => item.requirement_id === requirementId);
  if (!requirement) {
    throw new Error("D3 Strategy bridge cannot resolve requirement: " + requirementId);
  }
  if (legacyMode && legacyMode !== requirement.mode) {
    throw new Error(
      "D3 Strategy bridge mode conflict for " +
        requirementId +
        ": canonical=" +
        requirement.mode +
        ", legacy=" +
        legacyMode,
    );
  }
  return requirement.mode;
}
