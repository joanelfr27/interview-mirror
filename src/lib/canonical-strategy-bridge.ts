import type { EvidenceLedger, RequirementStatus } from "@/lib/canonical-evidence-model";
import {
  type CanonicalEvidenceRoute,
  validateCanonicalEvidenceRoute,
} from "@/lib/canonical-evidence-router";
import {
  type FitGapProjection,
  validateFitGapProjection,
} from "@/lib/fit-gap-reasoning";
import {
  type FitGapConsumerProjection,
  validateFitGapConsumerProjection,
} from "@/lib/fit-gap-consumer";
import {
  type DemonstrationObjectiveConsumerProjection,
  validateDemonstrationObjectiveConsumerProjection,
} from "@/lib/demonstration-objective-consumer";

export type CanonicalStrategyBridgeEvidence = {
  evidence_id: string;
  source_span_id: string;
  source_quote: string;
  support_status: string;
};

export type CanonicalStrategyBridgeAction =\n  | "DEMONSTRATE"\n  | "POSITION_TRANSFER"\n  | "VERIFY_GAP"\n  | "DEMONSTRATE_PARTIAL"\n  | "DEFEND_BOUNDARY"\n  | "ELICIT_AND_CLARIFY";\n\nexport type CanonicalStrategyBridgeBoundary = {
  permitted_claims: string[];
  prohibited_claims: string[];
};

export type CanonicalStrategyBridgeRequirement = {
  requirement_id: string;
  normalized_requirement: string;
  status: RequirementStatus | "UNJUDGED";
  route_mode: "DIRECT" | "TRANSFERABLE" | "VERIFY_GAP";
  fit_state: string;
  gap_classification: FitGapConsumerProjection["requirements"][number]["gap_classification"];
  preparation_state: string;
  evidence: CanonicalStrategyBridgeEvidence[];
  unresolved_item_ids: string[];
  demonstration_objective_ids: string[];
  boundaries: CanonicalStrategyBridgeBoundary[];
};

export type CanonicalStrategyBridgeProjection = {
  version: "d6-v1";
  requirements: CanonicalStrategyBridgeRequirement[];
};

export function strategyActionFor(preparationState: FitGapConsumerProjection["requirements"][number]["preparation_state"]): CanonicalStrategyBridgeAction {\n  switch (preparationState) {\n    case "READY_TO_DEMONSTRATE": return "DEMONSTRATE";\n    case "PREPARE_TRANSFER": return "POSITION_TRANSFER";\n    case "VERIFY_BEFORE_INTERVIEW": return "VERIFY_GAP";\n    case "PREPARE_PARTIAL": return "DEMONSTRATE_PARTIAL";\n    case "DEFEND_BOUNDARY": return "DEFEND_BOUNDARY";\n    case "ELICIT_AND_CLARIFY": return "ELICIT_AND_CLARIFY";\n  }\n}\n\nfunction sameIds(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

export function buildCanonicalStrategyBridgeProjection(
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): CanonicalStrategyBridgeProjection {
  const validation = validateCanonicalStrategyBridgeInputs(
    fitGapConsumer,
    fitGapReasoning,
    route,
    objectives,
    ledger,
  );
  if (!validation.valid) {
    throw new Error("D6 canonical inputs are invalid: " + validation.errors.join(" | "));
  }

  const fitById = new Map(fitGapConsumer.requirements.map((r) => [r.requirement_id, r]));
  const routeById = new Map(route.requirements.map((r) => [r.requirement_id, r]));
  const objectiveByRequirement = new Map<string, CanonicalStrategyBridgeBoundary[]>();

  for (const item of objectives.objectives) {
    const list = objectiveByRequirement.get(item.requirement_id) ?? [];
    list.push({
      permitted_claims: [...item.truthfulness_boundary.permitted_claims],
      prohibited_claims: [...item.truthfulness_boundary.prohibited_claims],
    });
    objectiveByRequirement.set(item.requirement_id, list);
  }

  const requirements = route.requirements.map((r) => {
    const fit = fitById.get(r.requirement_id)!;
    const boundaries = objectiveByRequirement.get(r.requirement_id) ?? [];
    return {
      requirement_id: r.requirement_id,
      normalized_requirement: r.normalized_requirement,
      status: r.status,
      route_mode: r.mode,
      fit_state: fit.fit_state,
      gap_classification: fit.gap_classification,
      preparation_state: fit.preparation_state,
      evidence: r.candidates.map((candidate) => ({
        evidence_id: candidate.evidence_id,
        source_span_id: candidate.source_span_id,
        source_quote: candidate.source_quote,
        support_status: candidate.support_status,
      })),
      unresolved_item_ids: [...r.unresolved_item_ids],
      demonstration_objective_ids: [...r.demonstration_objective_ids],
      boundaries,
    };
  }).sort((a, b) => a.requirement_id.localeCompare(b.requirement_id));

  const projection: CanonicalStrategyBridgeProjection = {
    version: "d6-v1",
    requirements,
  };

  const result = validateCanonicalStrategyBridgeProjection(
    projection,
    fitGapConsumer,
    fitGapReasoning,
    route,
    objectives,
    ledger,
  );
  if (!result.valid) {
    throw new Error("D6 strategy bridge projection is invalid: " + result.errors.join(" | "));
  }
  return projection;
}

export function validateCanonicalStrategyBridgeInputs(
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const routeValidation = validateCanonicalEvidenceRoute(route, ledger);
  if (!routeValidation.valid) errors.push(...routeValidation.errors.map((e) => "D3: " + e));
  const d2Validation = validateFitGapProjection(fitGapReasoning);
  if (!d2Validation.valid) errors.push(...d2Validation.errors.map((e) => "D2: " + e));
  const d4Validation = validateFitGapConsumerProjection(fitGapConsumer, fitGapReasoning, route, ledger);
  if (!d4Validation.valid) errors.push(...d4Validation.errors.map((e) => "D4: " + e));
  const d5Validation = validateDemonstrationObjectiveConsumerProjection(
    objectives,
    fitGapConsumer,
    fitGapReasoning,
    route,
    ledger,
  );
  if (!d5Validation.valid) errors.push(...d5Validation.errors.map((e) => "D5: " + e));
  return { valid: errors.length === 0, errors };
}

export function validateCanonicalStrategyBridgeProjection(
  projection: CanonicalStrategyBridgeProjection,
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const inputValidation = validateCanonicalStrategyBridgeInputs(
    fitGapConsumer,
    fitGapReasoning,
    route,
    objectives,
    ledger,
  );
  errors.push(...inputValidation.errors);
  if (projection.version !== "d6-v1") errors.push("D6 projection version must be d6-v1.");

  const fitById = new Map(fitGapConsumer.requirements.map((r) => [r.requirement_id, r]));
  const routeById = new Map(route.requirements.map((r) => [r.requirement_id, r]));
  const objectiveById = new Map(objectives.objectives.map((o) => [o.demonstration_objective_id, o]));
  const seen = new Set<string>();

  for (const item of projection.requirements) {
    if (seen.has(item.requirement_id)) {
      errors.push("D6 duplicate requirement: " + item.requirement_id);
      continue;
    }
    seen.add(item.requirement_id);

    const routeRequirement = routeById.get(item.requirement_id);
    const fitRequirement = fitById.get(item.requirement_id);
    if (!routeRequirement || !fitRequirement) {
      errors.push("D6 unknown upstream requirement: " + item.requirement_id);
      continue;
    }

    if (item.normalized_requirement !== routeRequirement.normalized_requirement) {
      errors.push("D6 requirement text diverges from D3: " + item.requirement_id);
    }
    if (item.status !== routeRequirement.status) errors.push("D6 status diverges from D3: " + item.requirement_id);
    if (item.route_mode !== routeRequirement.mode) errors.push("D6 route mode diverges from D3: " + item.requirement_id);
    if (item.fit_state !== fitRequirement.fit_state) errors.push("D6 fit state diverges from D4: " + item.requirement_id);
    if (item.gap_classification !== fitRequirement.gap_classification) errors.push("D6 gap classification diverges from D4: " + item.requirement_id);
    if (item.preparation_state !== fitRequirement.preparation_state) errors.push("D6 preparation state diverges from D4: " + item.requirement_id);\n    if (item.strategy_action !== strategyActionFor(fitRequirement.preparation_state)) errors.push("D6 strategy action is not deterministic: " + item.requirement_id);
    if (!sameIds(item.unresolved_item_ids, routeRequirement.unresolved_item_ids)) errors.push("D6 unresolved associations diverge: " + item.requirement_id);
    if (!sameIds(item.demonstration_objective_ids, routeRequirement.demonstration_objective_ids)) errors.push("D6 objective associations diverge: " + item.requirement_id);

    const expectedEvidenceKeys = routeRequirement.candidates
      .map((candidate) => `${candidate.evidence_id}::${candidate.support_status}`)
      .sort();
    const actualEvidenceKeys = item.evidence
      .map((evidence) => `${evidence.evidence_id}::${evidence.support_status}`)
      .sort();
    if (JSON.stringify(actualEvidenceKeys) !== JSON.stringify(expectedEvidenceKeys)) {
      errors.push("D6 evidence set diverges from D3: " + item.requirement_id);
    }

    for (const evidence of item.evidence) {
      const canonical = ledger.evidence.find((e) => e.id === evidence.evidence_id);
      if (!canonical) {
        errors.push("D6 unknown evidence: " + evidence.evidence_id);
        continue;
      }
      if (canonical.source_span_id !== evidence.source_span_id) errors.push("D6 source span diverges: " + evidence.evidence_id);
      const span = ledger.source_spans.find((s) => s.id === canonical.source_span_id);
      if (!span || span.text !== evidence.source_quote) errors.push("D6 source quote diverges: " + evidence.evidence_id);
      const routeCandidate = routeRequirement.candidates.find(
        (candidate) => candidate.evidence_id === evidence.evidence_id && candidate.support_status === evidence.support_status,
      );
      if (!routeCandidate) errors.push("D6 evidence is not requirement-local: " + evidence.evidence_id);
    }

    for (const objectiveId of item.demonstration_objective_ids) {
      const objective = objectiveById.get(objectiveId);
      if (!objective || objective.requirement_id !== item.requirement_id) {
        errors.push("D6 objective crosses requirement ownership: " + objectiveId);
      }
    }

    const expectedBoundaries = item.demonstration_objective_ids
      .map((id) => objectiveById.get(id))
      .filter((o): o is NonNullable<typeof o> => Boolean(o))
      .map((o) => ({
        permitted_claims: [...o.truthfulness_boundary.permitted_claims],
        prohibited_claims: [...o.truthfulness_boundary.prohibited_claims],
      }));
    if (JSON.stringify(item.boundaries) !== JSON.stringify(expectedBoundaries)) {
      errors.push("D6 truthfulness boundaries diverge: " + item.requirement_id);
    }
  }

  const expectedRequirementIds = route.requirements.map((r) => r.requirement_id);
  if (!sameIds([...seen], expectedRequirementIds)) errors.push("D6 requirement set does not exactly match D3.");

  return { valid: errors.length === 0, errors };
}
