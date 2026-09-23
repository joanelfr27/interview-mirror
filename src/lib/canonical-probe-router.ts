import type { EvidenceLedger } from "@/lib/canonical-evidence-model";
import {
  type CanonicalStrategyBridgeProjection,
  validateCanonicalStrategyBridgeProjection,
} from "@/lib/canonical-strategy-bridge";
import {
  type FitGapProjection,
  validateFitGapProjection,
} from "@/lib/fit-gap-reasoning";
import {
  type FitGapConsumerProjection,
  validateFitGapConsumerProjection,
} from "@/lib/fit-gap-consumer";
import {
  type CanonicalEvidenceRoute,
  validateCanonicalEvidenceRoute,
} from "@/lib/canonical-evidence-router";
import {
  type DemonstrationObjectiveConsumerProjection,
  validateDemonstrationObjectiveConsumerProjection,
} from "@/lib/demonstration-objective-consumer";

export type CanonicalProbeMode =
  | "DEMONSTRATION"
  | "TRANSFER"
  | "PARTIAL"
  | "GAP_VERIFICATION"
  | "BOUNDARY"
  | "ELICITATION";

export type CanonicalProbeRoute = {
  requirement_id: string;
  demonstration_objective_id?: string;
  probe_mode: CanonicalProbeMode;
  probe_family?: string;
  observable_cue?: string;
  unresolved_item_id?: string;
  permitted_claims: string[];
  prohibited_claims: string[];
};

export type CanonicalProbeRoutingProjection = {
  version: "d7-v1";
  routes: CanonicalProbeRoute[];
};

function modeFor(action: CanonicalStrategyBridgeProjection["requirements"][number]["strategy_action"]): CanonicalProbeMode {
  switch (action) {
    case "DEMONSTRATE": return "DEMONSTRATION";
    case "POSITION_TRANSFER": return "TRANSFER";
    case "DEMONSTRATE_PARTIAL": return "PARTIAL";
    case "VERIFY_GAP": return "GAP_VERIFICATION";
    case "DEFEND_BOUNDARY": return "BOUNDARY";
    case "ELICIT_AND_CLARIFY": return "ELICITATION";
  }
}

function sameIds(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

export function buildCanonicalProbeRoutingProjection(
  bridge: CanonicalStrategyBridgeProjection,
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): CanonicalProbeRoutingProjection {
  const validation = validateCanonicalProbeRoutingInputs(bridge, fitGapConsumer, fitGapReasoning, route, objectives, ledger);
  if (!validation.valid) throw new Error("D7 canonical inputs are invalid: " + validation.errors.join(" | "));

  const objectiveById = new Map(objectives.objectives.map((o) => [o.demonstration_objective_id, o]));
  const routes: CanonicalProbeRoute[] = [];

  for (const requirement of bridge.requirements) {
    for (const objectiveId of requirement.demonstration_objective_ids) {
      const objective = objectiveById.get(objectiveId);
      if (!objective) throw new Error("D7 unknown demonstration objective: " + objectiveId);
      routes.push({
        requirement_id: requirement.requirement_id,
        demonstration_objective_id: objective.demonstration_objective_id,
        probe_mode: modeFor(requirement.strategy_action),
        ...(objective.probe_family ? { probe_family: objective.probe_family } : {}),
        observable_cue: objective.observable_cue,
        unresolved_item_id: objective.unresolved_item_id,
        permitted_claims: [...objective.truthfulness_boundary.permitted_claims],
        prohibited_claims: [...objective.truthfulness_boundary.prohibited_claims],
      });
    }
  }

  const projection: CanonicalProbeRoutingProjection = {
    version: "d7-v1",
    routes: routes.sort((a, b) =>
      a.requirement_id.localeCompare(b.requirement_id) ||
      (a.demonstration_objective_id ?? "").localeCompare(b.demonstration_objective_id ?? ""),
    ),
  };
  const result = validateCanonicalProbeRoutingProjection(projection, bridge, fitGapConsumer, fitGapReasoning, route, objectives, ledger);
  if (!result.valid) throw new Error("D7 probe routing projection is invalid: " + result.errors.join(" | "));
  return projection;
}

export function validateCanonicalProbeRoutingInputs(
  bridge: CanonicalStrategyBridgeProjection,
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const bridgeValidation = validateCanonicalStrategyBridgeProjection(bridge, fitGapConsumer, fitGapReasoning, route, objectives, ledger);
  if (!bridgeValidation.valid) errors.push(...bridgeValidation.errors.map((e) => "D6: " + e));
  const d4 = validateFitGapConsumerProjection(fitGapConsumer, fitGapReasoning, route, ledger);
  if (!d4.valid) errors.push(...d4.errors.map((e) => "D4: " + e));
  const d2 = validateFitGapProjection(fitGapReasoning);
  if (!d2.valid) errors.push(...d2.errors.map((e) => "D2: " + e));
  const d3 = validateCanonicalEvidenceRoute(route, ledger);
  if (!d3.valid) errors.push(...d3.errors.map((e) => "D3: " + e));
  const d5 = validateDemonstrationObjectiveConsumerProjection(objectives, fitGapConsumer, fitGapReasoning, route, ledger);
  if (!d5.valid) errors.push(...d5.errors.map((e) => "D5: " + e));
  return { valid: errors.length === 0, errors };
}

export function validateCanonicalProbeRoutingProjection(
  projection: CanonicalProbeRoutingProjection,
  bridge: CanonicalStrategyBridgeProjection,
  fitGapConsumer: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  objectives: DemonstrationObjectiveConsumerProjection,
  ledger: EvidenceLedger,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  errors.push(...validateCanonicalProbeRoutingInputs(bridge, fitGapConsumer, fitGapReasoning, route, objectives, ledger).errors);
  if (projection.version !== "d7-v1") errors.push("D7 projection version must be d7-v1.");

  const bridgeById = new Map(bridge.requirements.map((r) => [r.requirement_id, r]));
  const objectiveById = new Map(objectives.objectives.map((o) => [o.demonstration_objective_id, o]));
  const seen = new Set<string>();

  for (const item of projection.routes) {
    const key = item.requirement_id + "::" + (item.demonstration_objective_id ?? "");
    if (seen.has(key)) errors.push("D7 duplicate probe route: " + key);
    seen.add(key);
    const requirement = bridgeById.get(item.requirement_id);
    if (!requirement) {
      errors.push("D7 unknown requirement: " + item.requirement_id);
      continue;
    }
    const objectiveId = item.demonstration_objective_id;
    if (!objectiveId) {
      errors.push("D7 every route must target a demonstration objective: " + item.requirement_id);
      continue;
    }
    const objective = objectiveById.get(objectiveId);
    if (!objective || objective.requirement_id !== item.requirement_id) {
      errors.push("D7 objective crosses requirement ownership: " + objectiveId);
      continue;
    }
    if (item.probe_mode !== modeFor(requirement.strategy_action)) errors.push("D7 probe mode diverges from D6 action: " + item.requirement_id);
    if (item.probe_family !== objective.probe_family) errors.push("D7 probe family diverges from D5: " + objectiveId);
    if (item.observable_cue !== objective.observable_cue) errors.push("D7 observable cue diverges from D5: " + objectiveId);
    if (item.unresolved_item_id !== objective.unresolved_item_id) errors.push("D7 unresolved target diverges from D5: " + objectiveId);
    if (!sameIds(item.permitted_claims, objective.truthfulness_boundary.permitted_claims)) errors.push("D7 permitted claims diverge: " + objectiveId);
    if (!sameIds(item.prohibited_claims, objective.truthfulness_boundary.prohibited_claims)) errors.push("D7 prohibited claims diverge: " + objectiveId);
  }

  const expectedKeys = objectives.objectives.map((o) => o.requirement_id + "::" + o.demonstration_objective_id).sort();
  const actualKeys = [...seen].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) errors.push("D7 route set does not exactly match D5 objectives.");

  return { valid: errors.length === 0, errors };
}
