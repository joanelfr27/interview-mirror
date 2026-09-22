import type {
  AtomicEvidence,
  CandidateElicitation,
  DemonstrationObjective,
  EvidenceLedger,
  RequirementStatus,
  SupportStatus,
} from "@/lib/canonical-evidence-model";
import {
  buildCanonicalReasoningProjection,
  validateCanonicalReasoningProjection,
  type CanonicalReasoningEvidenceRef,
} from "@/lib/canonical-reasoning-adapter";

export type CanonicalEvidenceRouteMode = "DIRECT" | "TRANSFERABLE" | "VERIFY_GAP";

export type CanonicalEvidenceRouteCandidate = {
  evidence_id: string;
  source_span_id: string;
  source_quote: string;
  support_status: SupportStatus;
};

export type CanonicalEvidenceRouteFacet = {
  facet_id: string;
  type: string;
  requirement: string;
  status: SupportStatus | "UNJUDGED";
  evidence: CanonicalEvidenceRouteCandidate[];
  rationale: string | null;
  confidence: number | null;
};

export type CanonicalEvidenceRouteRequirement = {
  requirement_id: string;
  normalized_requirement: string;
  category: string;
  salience: string;
  status: RequirementStatus | "UNJUDGED";
  mode: CanonicalEvidenceRouteMode;
  facets: CanonicalEvidenceRouteFacet[];
  candidates: CanonicalEvidenceRouteCandidate[];
  unresolved_item_ids: string[];
  elicitation_ids: string[];
  demonstration_objective_ids: string[];
};

export type CanonicalEvidenceRoute = {
  version: "d3-v1";
  requirements: CanonicalEvidenceRouteRequirement[];
  unresolved_items: Array<{
    unresolved_item_id: string;
    requirement_id: string;
    facet_ids: string[];
    type: "ABSENT" | "AMBIGUOUS" | "CONFLICTING";
    supporting_evidence: CanonicalReasoningEvidenceRef[];
    contradiction_evidence: CanonicalReasoningEvidenceRef[];
    elicitation: CandidateElicitation | null;
  }>;
  demonstration_objectives: DemonstrationObjective[];
};

function modeForRequirement(
  status: RequirementStatus | "UNJUDGED",
  facets: CanonicalEvidenceRouteFacet[],
): CanonicalEvidenceRouteMode {
  const statuses = facets.map((facet) => facet.status);
  if (status === "SUPPORTED" && facets.length > 0 && statuses.every((value) => value === "DIRECT")) {
    return "DIRECT";
  }

  const hasContradiction = statuses.includes("CONTRADICTORY");
  const hasDirect = statuses.includes("DIRECT");
  const hasTransfer = statuses.includes("ANALOGICAL_TRANSFER");
  const hasOther = statuses.some((value) => value === "PARTIAL" || value === "NONE" || value === "UNJUDGED");

  if (!hasContradiction && !hasDirect && hasTransfer && !hasOther) return "TRANSFERABLE";
  return "VERIFY_GAP";
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function routeEvidence(
  ledger: EvidenceLedger,
  evidenceIds: string[],
  supportStatus: SupportStatus,
): CanonicalEvidenceRouteCandidate[] {
  const byId = new Map(ledger.evidence.map((atom) => [atom.id, atom]));
  const spans = new Map(ledger.source_spans.map((span) => [span.id, span]));

  return unique(evidenceIds)
    .map((id) => {
      const atom = byId.get(id);
      if (!atom) throw new Error("D3 evidence router encountered unknown evidence id: " + id);
      const span = spans.get(atom.source_span_id);
      if (!span) throw new Error("D3 evidence router encountered unknown source span: " + atom.source_span_id);
      return {
        evidence_id: atom.id,
        source_span_id: span.id,
        source_quote: span.text,
        support_status: supportStatus,
      };
    })
    .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
}

function candidateEvidenceForRequirement(
  ledger: EvidenceLedger,
  requirementId: string,
  facets: CanonicalEvidenceRouteFacet[],
): CanonicalEvidenceRouteCandidate[] {
  const result: CanonicalEvidenceRouteCandidate[] = [];
  for (const facet of facets) result.push(...facet.evidence);

  const unresolvedSupporting = ledger.unresolved_items
    .filter((item) => item.requirement_id === requirementId)
    .flatMap((item) => item.supporting_evidence_ids);

  const unresolvedContradictory = ledger.unresolved_items
    .filter((item) => item.requirement_id === requirementId)
    .flatMap((item) => item.contradiction_evidence_ids);

  if (unresolvedSupporting.length) result.push(...routeEvidence(ledger, unresolvedSupporting, "PARTIAL"));
  if (unresolvedContradictory.length) {
    result.push(...routeEvidence(ledger, unresolvedContradictory, "CONTRADICTORY"));
  }

  const deduped = new Map<string, CanonicalEvidenceRouteCandidate>();
  for (const candidate of result) {
    const existing = deduped.get(candidate.evidence_id);
    if (!existing || (existing.support_status !== "DIRECT" && candidate.support_status === "DIRECT")) {
      deduped.set(candidate.evidence_id, candidate);
    }
  }

  return [...deduped.values()].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
}

export function buildCanonicalEvidenceRoute(ledger: EvidenceLedger): CanonicalEvidenceRoute {
  const projection = buildCanonicalReasoningProjection(ledger);
  const projectionValidation = validateCanonicalReasoningProjection(projection);
  if (!projectionValidation.valid) {
    throw new Error("D3 canonical reasoning projection is invalid: " + projectionValidation.errors.join(" | "));
  }

  const requirements = projection.requirements.map((requirement) => {
    const facets = requirement.facets.map((facet) => ({
      facet_id: facet.facet_id,
      type: facet.type,
      requirement: facet.requirement,
      status: facet.status,
      evidence: routeEvidence(
        ledger,
        facet.evidence.map((ref) => ref.evidence_id),
        facet.status === "UNJUDGED" ? "NONE" : facet.status,
      ),
      rationale: facet.rationale,
      confidence: facet.confidence,
    }));

    const unresolved = ledger.unresolved_items.filter((item) => item.requirement_id === requirement.requirement_id);
    const objectives = ledger.demonstration_objectives.filter((objective) =>
      unresolved.some((item) => item.id === objective.target_unresolved_item_id),
    );

    return {
      requirement_id: requirement.requirement_id,
      normalized_requirement: requirement.normalized_requirement,
      category: requirement.category,
      salience: requirement.salience,
      status: requirement.status,
      mode: modeForRequirement(requirement.status, facets),
      facets,
      candidates: candidateEvidenceForRequirement(ledger, requirement.requirement_id, facets),
      unresolved_item_ids: unresolved.map((item) => item.id).sort(),
      elicitation_ids: unresolved
        .map((item) => ledger.candidate_elicitations.find((e) => e.unresolved_item_id === item.id)?.id)
        .filter((id): id is string => Boolean(id))
        .sort(),
      demonstration_objective_ids: objectives.map((objective) => objective.id).sort(),
    };
  });

  const route: CanonicalEvidenceRoute = {
    version: "d3-v1",
    requirements,
    unresolved_items: projection.unresolved_items,
    demonstration_objectives: projection.demonstration_objectives,
  };

  const routeValidation = validateCanonicalEvidenceRoute(route, ledger);
  if (!routeValidation.valid) {
    throw new Error("D3 canonical evidence route is invalid: " + routeValidation.errors.join(" | "));
  }

  return route;
}

export function validateCanonicalEvidenceRoute(
  route: CanonicalEvidenceRoute,
  ledger: EvidenceLedger,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const evidenceById = new Map(ledger.evidence.map((atom) => [atom.id, atom]));
  const spanById = new Map(ledger.source_spans.map((span) => [span.id, span]));

  const validateEvidenceProvenance = (
    evidence: CanonicalEvidenceRouteCandidate | CanonicalReasoningEvidenceRef,
    context: string,
  ) => {
    const atom = evidenceById.get(evidence.evidence_id);
    if (!atom) {
      errors.push(`${context} references unknown evidence: ${evidence.evidence_id}`);
      return;
    }
    const span = spanById.get(evidence.source_span_id);
    if (!span) {
      errors.push(`${context} references unknown source span: ${evidence.source_span_id}`);
      return;
    }
    if (atom.source_span_id !== span.id) {
      errors.push(
        `${context} source span does not match evidence ${evidence.evidence_id}: expected ${atom.source_span_id}, got ${span.id}`,
      );
    }
    if (evidence.source_quote !== span.text) {
      errors.push(`${context} source quote does not match source span: ${evidence.evidence_id}`);
    }
  };

  if (route.version !== "d3-v1") errors.push("D3 route version must be d3-v1.");

  const requirementIds = new Set<string>();
  const facetIds = new Set<string>();

  for (const requirement of route.requirements) {
    if (!requirement.requirement_id) errors.push("D3 requirement is missing requirement_id.");
    if (requirementIds.has(requirement.requirement_id)) {
      errors.push("D3 route contains duplicate requirement: " + requirement.requirement_id);
    }
    requirementIds.add(requirement.requirement_id);

    if (!["DIRECT", "TRANSFERABLE", "VERIFY_GAP"].includes(requirement.mode)) {
      errors.push("D3 requirement has invalid mode: " + requirement.requirement_id);
    }

    for (const facet of requirement.facets) {
      if (facetIds.has(facet.facet_id)) errors.push("D3 route contains duplicate facet: " + facet.facet_id);
      facetIds.add(facet.facet_id);
      for (const evidence of facet.evidence) {
        if (!evidence.evidence_id || !evidence.source_span_id || !evidence.source_quote.trim()) {
          errors.push("D3 facet contains an invalid evidence reference: " + facet.facet_id);
        } else {
          validateEvidenceProvenance(evidence, "D3 facet evidence");
        }
      }
    }

    const requirementEvidenceIds = new Set<string>(requirement.facets.flatMap((facet) =>
      facet.evidence.map((evidence) => evidence.evidence_id),
    ));
    for (const unresolvedItem of route.unresolved_items.filter(
      (item) => item.requirement_id === requirement.requirement_id,
    )) {
      for (const evidence of [...unresolvedItem.supporting_evidence, ...unresolvedItem.contradiction_evidence]) {
        requirementEvidenceIds.add(evidence.evidence_id);
      }
    }

    for (const candidate of requirement.candidates) {
      if (!candidate.evidence_id || !candidate.source_span_id || !candidate.source_quote.trim()) {
        errors.push("D3 requirement contains an invalid candidate evidence reference: " + requirement.requirement_id);
      } else {
        validateEvidenceProvenance(candidate, "D3 requirement candidate");
      }
      if (!requirementEvidenceIds.has(candidate.evidence_id)) {
        errors.push(
          "D3 candidate references evidence not owned by requirement: " +
          requirement.requirement_id +
          " -> " +
          candidate.evidence_id,
        );
      }
    }

    const unresolvedIds = new Set(route.unresolved_items
      .filter((item) => item.requirement_id === requirement.requirement_id)
      .map((item) => item.unresolved_item_id));

    for (const unresolvedItemId of requirement.unresolved_item_ids) {
      const unresolvedItem = route.unresolved_items.find((item) => item.unresolved_item_id === unresolvedItemId);
      if (!unresolvedItem) {
        errors.push(
          "D3 requirement references unknown unresolved item: " +
          requirement.requirement_id +
          " -> " +
          unresolvedItemId,
        );
      } else if (unresolvedItem.requirement_id !== requirement.requirement_id) {
        errors.push(
          "D3 requirement references unresolved item owned by another requirement: " +
          requirement.requirement_id +
          " -> " +
          unresolvedItemId,
        );
      }
    }

    for (const elicitationId of requirement.elicitation_ids) {
      const matches = route.unresolved_items.filter(
        (item) => unresolvedIds.has(item.unresolved_item_id) && item.elicitation?.id === elicitationId,
      );
      if (matches.length !== 1) {
        errors.push(
          "D3 requirement references an elicitation not owned by its unresolved items: " +
          requirement.requirement_id +
          " -> " +
          elicitationId,
        );
      }
    }

    for (const objectiveId of requirement.demonstration_objective_ids) {
      const objective = route.demonstration_objectives.find((item) => item.id === objectiveId);
      if (!objective) {
        errors.push(
          "D3 requirement references unknown demonstration objective: " +
          requirement.requirement_id +
          " -> " +
          objectiveId,
        );
        continue;
      }
      const target = route.unresolved_items.find(
        (item) => item.unresolved_item_id === objective.target_unresolved_item_id,
      );
      if (!target || target.requirement_id !== requirement.requirement_id) {
        errors.push(
          "D3 requirement references demonstration objective owned by another requirement: " +
          requirement.requirement_id +
          " -> " +
          objectiveId,
        );
      }
    }

    if (
      requirement.mode === "DIRECT" &&
      !(requirement.status === "SUPPORTED" && requirement.facets.length > 0 && requirement.facets.every((facet) => facet.status === "DIRECT"))
    ) {
      errors.push("D3 DIRECT mode requires a fully DIRECT/SUPPORTED requirement: " + requirement.requirement_id);
    }

    if (
      requirement.mode === "TRANSFERABLE" &&
      !(requirement.facets.length > 0 && requirement.facets.every((facet) => facet.status === "ANALOGICAL_TRANSFER"))
    ) {
      errors.push(
        "D3 TRANSFERABLE mode requires every facet to be ANALOGICAL_TRANSFER: " +
        requirement.requirement_id,
      );
    }

    const expectedMode = modeForRequirement(requirement.status, requirement.facets);
    if (requirement.mode !== expectedMode) {
      errors.push(
        "D3 requirement mode does not match its status/facets: " +
        requirement.requirement_id +
        " expected " +
        expectedMode +
        " got " +
        requirement.mode,
      );
    }
  }

  for (const item of route.unresolved_items) {
    if (!requirementIds.has(item.requirement_id)) {
      errors.push("D3 unresolved item references unknown requirement: " + item.unresolved_item_id);
    }
    const owningRequirement = route.requirements.find((requirement) => requirement.requirement_id === item.requirement_id);
    const owningFacetIds = new Set(owningRequirement?.facets.map((facet) => facet.facet_id) ?? []);
    for (const facetId of item.facet_ids) {
      if (!facetIds.has(facetId)) {
        errors.push("D3 unresolved item references unknown facet: " + facetId);
      } else if (!owningFacetIds.has(facetId)) {
        errors.push(
          "D3 unresolved item references facet owned by another requirement: " +
          item.unresolved_item_id +
          " -> " +
          facetId,
        );
      }
    }
    for (const evidence of [...item.supporting_evidence, ...item.contradiction_evidence]) {
      if (!evidence.evidence_id || !evidence.source_span_id || !evidence.source_quote.trim()) {
        errors.push("D3 unresolved item contains an invalid evidence reference: " + item.unresolved_item_id);
      } else {
        validateEvidenceProvenance(evidence, "D3 unresolved item evidence");
      }
    }
  }

  for (const objective of route.demonstration_objectives) {
    if (!route.unresolved_items.some((item) => item.unresolved_item_id === objective.target_unresolved_item_id)) {
      errors.push("D3 objective references unknown unresolved item: " + objective.id);
    }
  }

  return { valid: errors.length === 0, errors };
}
