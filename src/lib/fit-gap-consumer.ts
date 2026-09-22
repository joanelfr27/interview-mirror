import type { EvidenceLedger } from "@/lib/canonical-evidence-model";
import {
  validateCanonicalEvidenceRoute,
  type CanonicalEvidenceRoute,
  type CanonicalEvidenceRouteCandidate,
} from "@/lib/canonical-evidence-router";
import {
  validateFitGapProjection,
  type FitGapProjection,
  type FitGapRequirement,
  type FitGapState,
} from "@/lib/fit-gap-reasoning";

export type FitGapPreparationState =
  | "READY_TO_DEMONSTRATE"
  | "PREPARE_TRANSFER"
  | "VERIFY_BEFORE_INTERVIEW"
  | "DEFEND_BOUNDARY"
  | "ELICIT_AND_CLARIFY";

export type FitGapConsumerEvidenceRef = CanonicalEvidenceRouteCandidate;

export type FitGapConsumerRequirement = {
  requirement_id: string;
  normalized_requirement: string;
  category: string;
  salience: string;
  requirement_status: FitGapRequirement["requirement_status"];
  fit_state: FitGapState;
  gap_classification: FitGapRequirement["gap_classification"];
  route_mode: CanonicalEvidenceRoute["requirements"][number]["mode"];
  facets: CanonicalEvidenceRoute["requirements"][number]["facets"];
  candidates: FitGapConsumerEvidenceRef[];
  unresolved_item_ids: string[];
  elicitation_ids: string[];
  demonstration_objective_ids: string[];
  preparation_state: FitGapPreparationState;
};

export type FitGapConsumerProjection = {
  version: "d4-v1";
  requirements: FitGapConsumerRequirement[];
};

function preparationStateFor(
  fitState: FitGapState,
  routeMode: FitGapConsumerRequirement["route_mode"],
): FitGapPreparationState {
  if (fitState === "CONTRADICTED") return "DEFEND_BOUNDARY";
  if (fitState === "EVIDENCE_GAP" || fitState === "UNRESOLVED") return "ELICIT_AND_CLARIFY";
  if (fitState === "EXPERIENCE_GAP") return "VERIFY_BEFORE_INTERVIEW";
  if (fitState === "TRANSFERABLE" || routeMode === "TRANSFERABLE") return "PREPARE_TRANSFER";
  return "READY_TO_DEMONSTRATE";
}

function sameIds(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function candidateKey(candidate: FitGapConsumerEvidenceRef): string {
  return [
    candidate.evidence_id,
    candidate.source_span_id,
    candidate.source_quote,
    candidate.support_status,
  ].join("\u0000");
}

export function buildFitGapConsumerProjection(
  fitGapProjection: FitGapProjection,
  route: CanonicalEvidenceRoute,
  ledger: EvidenceLedger,
): FitGapConsumerProjection {
  const fitValidation = validateFitGapProjection(fitGapProjection);
  if (!fitValidation.valid) {
    throw new Error("D4 Fit & Gap projection is invalid: " + fitValidation.errors.join(" | "));
  }

  const routeValidation = validateCanonicalEvidenceRoute(route, ledger);
  if (!routeValidation.valid) {
    throw new Error("D4 canonical evidence route is invalid: " + routeValidation.errors.join(" | "));
  }

  if (route.version !== "d3-v1") {
    throw new Error("D4 requires the d3-v1 canonical evidence route.");
  }

  const fitById = new Map(fitGapProjection.requirements.map((r) => [r.requirement_id, r]));
  const routeById = new Map(route.requirements.map((r) => [r.requirement_id, r]));

  if (fitById.size !== routeById.size) {
    throw new Error("D4 Fit & Gap and route requirement sets differ.");
  }

  const requirements = fitGapProjection.requirements.map((fit) => {
    const routed = routeById.get(fit.requirement_id);
    if (!routed) throw new Error("D4 route is missing requirement: " + fit.requirement_id);

    if (
      fit.normalized_requirement !== routed.normalized_requirement ||
      fit.category !== routed.category ||
      fit.salience !== routed.salience ||
      fit.requirement_status !== routed.status
    ) {
      throw new Error("D4 requirement reasoning is inconsistent: " + fit.requirement_id);
    }

    if (!sameIds(fit.unresolved_item_ids, routed.unresolved_item_ids)) {
      throw new Error("D4 unresolved item associations differ: " + fit.requirement_id);
    }
    if (!sameIds(fit.demonstration_objective_ids, routed.demonstration_objective_ids)) {
      throw new Error("D4 demonstration objective associations differ: " + fit.requirement_id);
    }

    const facetById = new Map(fit.facets.map((facet) => [facet.facet_id, facet]));
    if (facetById.size !== routed.facets.length) {
      throw new Error("D4 facet sets differ: " + fit.requirement_id);
    }
    for (const facet of routed.facets) {
      const fitFacet = facetById.get(facet.facet_id);
      if (
        !fitFacet ||
        fitFacet.type !== facet.type ||
        fitFacet.requirement !== facet.requirement ||
        fitFacet.status !== facet.status ||
        !sameIds(
          fitFacet.evidence.map((e) => e.evidence_id),
          facet.evidence.map((e) => e.evidence_id),
        )
      ) {
        throw new Error("D4 facet reasoning is inconsistent: " + fit.requirement_id + "/" + facet.facet_id);
      }
    }

    const candidateKeys = routed.candidates.map(candidateKey);
    if (new Set(candidateKeys).size !== candidateKeys.length) {
      throw new Error("D4 route contains duplicate candidate evidence: " + fit.requirement_id);
    }

    return {
      requirement_id: fit.requirement_id,
      normalized_requirement: fit.normalized_requirement,
      category: fit.category,
      salience: fit.salience,
      requirement_status: fit.requirement_status,
      fit_state: fit.fit_state,
      gap_classification: fit.gap_classification,
      route_mode: routed.mode,
      facets: routed.facets.map((facet) => ({ ...facet, evidence: facet.evidence.map((e) => ({ ...e })) })),
      candidates: routed.candidates.map((candidate) => ({ ...candidate })),
      unresolved_item_ids: [...routed.unresolved_item_ids],
      elicitation_ids: [...routed.elicitation_ids],
      demonstration_objective_ids: [...routed.demonstration_objective_ids],
      preparation_state: preparationStateFor(fit.fit_state, routed.mode),
    };
  });

  const result: FitGapConsumerProjection = { version: "d4-v1", requirements };
  const validation = validateFitGapConsumerProjection(result, fitGapProjection, route, ledger);
  if (!validation.valid) throw new Error("D4 consumer projection is invalid: " + validation.errors.join(" | "));
  return result;
}

export function validateFitGapConsumerProjection(
  projection: FitGapConsumerProjection,
  fitGapProjection: FitGapProjection,
  route: CanonicalEvidenceRoute,
  ledger: EvidenceLedger,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (projection.version !== "d4-v1") errors.push("D4 projection version must be d4-v1.");

  const fitValidation = validateFitGapProjection(fitGapProjection);
  if (!fitValidation.valid) errors.push(...fitValidation.errors.map((e) => "D2: " + e));
  const routeValidation = validateCanonicalEvidenceRoute(route, ledger);
  if (!routeValidation.valid) errors.push(...routeValidation.errors.map((e) => "D3: " + e));

  const fitById = new Map(fitGapProjection.requirements.map((r) => [r.requirement_id, r]));
  const routeById = new Map(route.requirements.map((r) => [r.requirement_id, r]));
  const consumerIds = new Set<string>();

  for (const requirement of projection.requirements) {
    if (consumerIds.has(requirement.requirement_id)) errors.push("Duplicate D4 requirement: " + requirement.requirement_id);
    consumerIds.add(requirement.requirement_id);

    const fit = fitById.get(requirement.requirement_id);
    const routed = routeById.get(requirement.requirement_id);
    if (!fit || !routed) {
      errors.push("D4 requirement is not present in both canonical inputs: " + requirement.requirement_id);
      continue;
    }

    if (requirement.route_mode !== routed.mode || requirement.fit_state !== fit.fit_state) {
      errors.push("D4 route mode or fit state diverges from canonical inputs: " + requirement.requirement_id);
    }
    if (!sameIds(requirement.unresolved_item_ids, routed.unresolved_item_ids)) {
      errors.push("D4 unresolved associations diverge: " + requirement.requirement_id);
    }
    if (!sameIds(requirement.elicitation_ids, routed.elicitation_ids)) {
      errors.push("D4 elicitation associations diverge: " + requirement.requirement_id);
    }
    if (!sameIds(requirement.demonstration_objective_ids, routed.demonstration_objective_ids)) {
      errors.push("D4 objective associations diverge: " + requirement.requirement_id);
    }

    const expectedCandidates = routed.candidates.map(candidateKey).sort();
    const actualCandidates = requirement.candidates.map(candidateKey).sort();
    if (JSON.stringify(actualCandidates) !== JSON.stringify(expectedCandidates)) {
      errors.push("D4 candidates diverge from D3 route: " + requirement.requirement_id);
    }

    if (requirement.preparation_state !== preparationStateFor(requirement.fit_state, requirement.route_mode)) {
      errors.push("D4 preparation state is not deterministic: " + requirement.requirement_id);
    }

    for (const candidate of requirement.candidates) {
      if (!routed.candidates.some((source) => candidateKey(source) === candidateKey(candidate))) {
        errors.push("D4 contains evidence not supplied by D3: " + requirement.requirement_id);
      }
    }
  }

  if (consumerIds.size !== fitById.size || consumerIds.size !== routeById.size) {
    errors.push("D4 requirement set does not exactly match D2 and D3.");
  }

  return { valid: errors.length === 0, errors };
}
