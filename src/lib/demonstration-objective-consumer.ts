import type {
  DemonstrationObjective,
  EvidenceLedger,
  AtomicEvidence,
  SourceSpan,
} from "@/lib/canonical-evidence-model";
import {
  validateDemonstrationObjective,
  validateDemonstrationEvidenceBinding,
  validateRequirementGraph,
} from "@/lib/canonical-evidence-model";
import {
  type FitGapConsumerProjection,
  type FitGapConsumerRequirement,
  type FitGapProjection,
  validateFitGapConsumerProjection,
} from "@/lib/fit-gap-consumer";
import { validateCanonicalEvidenceRoute, type CanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";

export type DemonstrationObjectiveEvidenceRef = {
  evidence_id: string;
  source_span_id: string;
  source_quote: string;
};

export type DemonstrationObjectiveConsumerItem = {
  requirement_id: string;
  unresolved_item_id: string;
  demonstration_objective_id: string;
  fit_state: FitGapConsumerRequirement["fit_state"];
  gap_classification: FitGapConsumerRequirement["gap_classification"];
  preparation_state: FitGapConsumerRequirement["preparation_state"];
  observable_cue: string;
  supporting_true_atoms: DemonstrationObjectiveEvidenceRef[];
  truthfulness_boundary: DemonstrationObjective["truthfulness_boundary"];
  candidate_gap_classification?: DemonstrationObjective["candidate_gap_classification"];
  probe_family?: string;
};

export type DemonstrationObjectiveConsumerProjection = {
  version: "d5-v1";
  objectives: DemonstrationObjectiveConsumerItem[];
};

function sameIds(a: string[], b: string[]): boolean {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function sourceSpanFor(ledger: EvidenceLedger, id: string): SourceSpan {
  const span = ledger.source_spans.find((s) => s.id === id);
  if (!span) throw new Error("D5 unknown source span: " + id);
  return span;
}

function atomFor(ledger: EvidenceLedger, id: string): AtomicEvidence {
  const atom = ledger.evidence.find((e) => e.id === id);
  if (!atom) throw new Error("D5 unknown evidence atom: " + id);
  return atom;
}

function objectiveIdsForRequirement(
  ledger: EvidenceLedger,
  requirementId: string,
): string[] {
  const unresolved = new Set(
    ledger.unresolved_items
      .filter((item) => item.requirement_id === requirementId)
      .map((item) => item.id),
  );
  return ledger.demonstration_objectives
    .filter((objective) => unresolved.has(objective.target_unresolved_item_id))
    .map((objective) => objective.id);
}

function buildEvidenceRefs(
  ledger: EvidenceLedger,
  objective: DemonstrationObjective,
  unresolvedRequirementId: string,
): DemonstrationObjectiveEvidenceRef[] {
  const unresolved = ledger.unresolved_items.find(
    (item) => item.id === objective.target_unresolved_item_id,
  );
  if (!unresolved) throw new Error("D5 objective targets unknown unresolved item: " + objective.target_unresolved_item_id);
  if (unresolved.requirement_id !== unresolvedRequirementId) {
    throw new Error("D5 objective crosses requirement ownership: " + objective.id);
  }

  const allowed = new Set(unresolved.supporting_evidence_ids);
  return objective.supporting_true_atom_ids.map((id) => {
    if (!allowed.has(id)) {
      throw new Error("D5 objective evidence is not owned by its unresolved item: " + objective.id + " -> " + id);
    }
    const atom = atomFor(ledger, id);
    if (atom.assertion.polarity !== "AFFIRMATIVE") {
      throw new Error("D5 supporting true atom must be AFFIRMATIVE: " + id);
    }
    const span = sourceSpanFor(ledger, atom.source_span_id);
    return {
      evidence_id: atom.id,
      source_span_id: span.id,
      source_quote: span.text,
    };
  });
}

function buildItem(
  objective: DemonstrationObjective,
  fitRequirement: FitGapConsumerRequirement,
  ledger: EvidenceLedger,
): DemonstrationObjectiveConsumerItem {
  if (!fitRequirement.unresolved_item_ids.includes(objective.target_unresolved_item_id)) {
    throw new Error("D5 objective target is not requirement-local: " + objective.id);
  }

  const refs = buildEvidenceRefs(ledger, objective, fitRequirement.requirement_id);

  if (
    objective.candidate_gap_classification !== undefined &&
    objective.candidate_gap_classification !== fitRequirement.gap_classification
  ) {
    throw new Error("D5 objective classification diverges from D4: " + objective.id);
  }

  return {
    requirement_id: fitRequirement.requirement_id,
    unresolved_item_id: objective.target_unresolved_item_id,
    demonstration_objective_id: objective.id,
    fit_state: fitRequirement.fit_state,
    gap_classification: fitRequirement.gap_classification,
    preparation_state: fitRequirement.preparation_state,
    observable_cue: objective.observable_cue,
    supporting_true_atoms: refs,
    truthfulness_boundary: {
      permitted_claims: [...objective.truthfulness_boundary.permitted_claims],
      prohibited_claims: [...objective.truthfulness_boundary.prohibited_claims],
    },
    ...(objective.candidate_gap_classification
      ? { candidate_gap_classification: objective.candidate_gap_classification }
      : {}),
    ...(objective.probe_family ? { probe_family: objective.probe_family } : {}),
  };
}

export function buildDemonstrationObjectiveConsumerProjection(
  fitGapProjection: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  ledger: EvidenceLedger,
): DemonstrationObjectiveConsumerProjection {
  const inputErrors: string[] = [];
  const graphValidation = validateRequirementGraph(ledger);
  if (graphValidation.length) inputErrors.push(...graphValidation.map((e) => "E1: " + e));
  const d4Validation = validateFitGapConsumerProjection(fitGapProjection, fitGapReasoning, route, ledger);
  if (!d4Validation.valid) inputErrors.push(...d4Validation.errors.map((e) => "D4: " + e));
  const routeValidation = validateCanonicalEvidenceRoute(route, ledger);
  if (!routeValidation.valid) inputErrors.push(...routeValidation.errors.map((e) => "D3: " + e));
  if (fitGapProjection.version !== "d4-v1") inputErrors.push("D5 requires the d4-v1 Fit & Gap consumer projection.");
  const fitIds = new Set(fitGapProjection.requirements.map((r) => r.requirement_id));
  const routeIds = new Set(route.requirements.map((r) => r.requirement_id));
  if (fitIds.size !== routeIds.size || [...fitIds].some((id) => !routeIds.has(id))) {
    inputErrors.push("D5 D2/D3 requirement sets differ.");
  }
  if (inputErrors.length) throw new Error("D5 canonical inputs are invalid: " + inputErrors.join(" | "));

  const byRequirement = new Map(
    fitGapProjection.requirements.map((requirement) => [requirement.requirement_id, requirement]),
  );
  const objectives: DemonstrationObjectiveConsumerItem[] = [];

  for (const objective of ledger.demonstration_objectives) {
    const unresolved = ledger.unresolved_items.find(
      (item) => item.id === objective.target_unresolved_item_id,
    );
    if (!unresolved) throw new Error("D5 objective target is unknown: " + objective.id);
    const requirement = byRequirement.get(unresolved.requirement_id);
    if (!requirement) throw new Error("D5 objective requirement is unknown: " + objective.id);
    objectives.push(buildItem(objective, requirement, ledger));
  }

  objectives.sort((a, b) =>
    a.requirement_id.localeCompare(b.requirement_id) ||
    a.unresolved_item_id.localeCompare(b.unresolved_item_id) ||
    a.demonstration_objective_id.localeCompare(b.demonstration_objective_id),
  );

  const result: DemonstrationObjectiveConsumerProjection = {
    version: "d5-v1",
    objectives,
  };
  const resultValidation = validateDemonstrationObjectiveConsumerProjection(
    result,
    fitGapProjection,
    route,
    ledger,
  );
  if (!resultValidation.valid) {
    throw new Error("D5 consumer projection is invalid: " + resultValidation.errors.join(" | "));
  }
  return result;
}

export function validateDemonstrationObjectiveConsumerProjection(
  projection: DemonstrationObjectiveConsumerProjection,
  fitGapProjection: FitGapConsumerProjection,
  fitGapReasoning: FitGapProjection,
  route: CanonicalEvidenceRoute,
  ledger: EvidenceLedger,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const graphValidation = validateRequirementGraph(ledger);
  if (graphValidation.length) errors.push(...graphValidation.map((e) => "E1: " + e));

  const d4Validation = validateFitGapConsumerProjection(fitGapProjection, fitGapReasoning, route, ledger);
  if (!d4Validation.valid) errors.push(...d4Validation.errors.map((e) => "D4: " + e));

  const routeValidation = validateCanonicalEvidenceRoute(route, ledger);
  if (!routeValidation.valid) errors.push(...routeValidation.errors.map((e) => "D3: " + e));

  const fitIds = new Set(fitGapProjection.requirements.map((r) => r.requirement_id));
  const routeIds = new Set(route.requirements.map((r) => r.requirement_id));
  if (fitIds.size !== routeIds.size || [...fitIds].some((id) => !routeIds.has(id))) {
    errors.push("D5 D2/D3 requirement sets differ.");
  }

  if (projection.version !== "d5-v1") errors.push("D5 projection version must be d5-v1.");

  const objectiveById = new Map(ledger.demonstration_objectives.map((o) => [o.id, o]));
  const seen = new Set<string>();

  for (const item of projection.objectives) {
    if (seen.has(item.demonstration_objective_id)) {
      errors.push("D5 duplicate demonstration objective: " + item.demonstration_objective_id);
      continue;
    }
    seen.add(item.demonstration_objective_id);

    const objective = objectiveById.get(item.demonstration_objective_id);
    if (!objective) {
      errors.push("D5 unknown demonstration objective: " + item.demonstration_objective_id);
      continue;
    }

    const fitRequirement = fitGapProjection.requirements.find((r) => r.requirement_id === item.requirement_id);
    if (!fitRequirement) {
      errors.push("D5 objective requirement missing from D4: " + item.requirement_id);
      continue;
    }

    if (!fitRequirement.unresolved_item_ids.includes(item.unresolved_item_id) ||
        objective.target_unresolved_item_id !== item.unresolved_item_id) {
      errors.push("D5 objective target is not requirement-local: " + item.demonstration_objective_id);
    }

    if (item.fit_state !== fitRequirement.fit_state) {
      errors.push("D5 fit state diverges from D4: " + item.demonstration_objective_id);
    }
    if (item.gap_classification !== fitRequirement.gap_classification) {
      errors.push("D5 gap classification diverges from D4: " + item.demonstration_objective_id);
    }
    if (item.preparation_state !== fitRequirement.preparation_state) {
      errors.push("D5 preparation state diverges from D4: " + item.demonstration_objective_id);
    }
    if (item.observable_cue !== objective.observable_cue) {
      errors.push("D5 observable cue diverges from canonical objective: " + item.demonstration_objective_id);
    }
    if (JSON.stringify(item.truthfulness_boundary) !== JSON.stringify(objective.truthfulness_boundary)) {
      errors.push("D5 truthfulness boundary diverges from canonical objective: " + item.demonstration_objective_id);
    }
    if (item.candidate_gap_classification !== objective.candidate_gap_classification) {
      errors.push("D5 candidate gap classification diverges from canonical objective: " + item.demonstration_objective_id);
    }
    if (item.probe_family !== objective.probe_family) {
      errors.push("D5 probe family diverges from canonical objective: " + item.demonstration_objective_id);
    }

    const canonicalObjectiveValidation = [
      ...validateDemonstrationObjective(objective),
      ...validateDemonstrationEvidenceBinding(objective, ledger.evidence),
    ];
    errors.push(...canonicalObjectiveValidation.map((e) => "D5 objective: " + e));

    if (
      objective.candidate_gap_classification !== undefined &&
      objective.candidate_gap_classification !== fitRequirement.gap_classification
    ) {
      errors.push("D5 objective classification diverges from D4: " + item.demonstration_objective_id);
    }

    const unresolved = ledger.unresolved_items.find((u) => u.id === item.unresolved_item_id);
    if (!unresolved || unresolved.requirement_id !== item.requirement_id) {
      errors.push("D5 unresolved ownership mismatch: " + item.demonstration_objective_id);
      continue;
    }

    const allowed = new Set(unresolved.supporting_evidence_ids);
    const refIds = item.supporting_true_atoms.map((r) => r.evidence_id);
    if (!sameIds(refIds, objective.supporting_true_atom_ids)) {
      errors.push("D5 supporting atom associations diverge: " + item.demonstration_objective_id);
    }

    for (const ref of item.supporting_true_atoms) {
      const atom = ledger.evidence.find((a) => a.id === ref.evidence_id);
      if (!atom) {
        errors.push("D5 unknown supporting evidence: " + ref.evidence_id);
        continue;
      }
      if (!allowed.has(atom.id)) {
        errors.push("D5 supporting evidence is not owned by unresolved item: " + ref.evidence_id);
      }
      if (atom.assertion.polarity !== "AFFIRMATIVE") {
        errors.push("D5 supporting true atom must be AFFIRMATIVE: " + ref.evidence_id);
      }
      if (ref.source_span_id !== atom.source_span_id) {
        errors.push("D5 source span diverges from canonical evidence: " + ref.evidence_id);
      }
      const span = ledger.source_spans.find((s) => s.id === atom.source_span_id);
      if (!span) {
        errors.push("D5 source span is missing: " + atom.source_span_id);
      } else if (ref.source_quote !== span.text) {
        errors.push("D5 source quote diverges from source span: " + ref.evidence_id);
      }
    }
  }

  const expectedObjectiveIds = ledger.demonstration_objectives.map((o) => o.id);
  if (!sameIds([...seen], expectedObjectiveIds)) {
    errors.push("D5 objective set does not exactly match canonical ledger.");
  }

  for (const requirement of fitGapProjection.requirements) {
    const expectedIds = objectiveIdsForRequirement(ledger, requirement.requirement_id);
    const d4Ids = requirement.demonstration_objective_ids;
    if (!sameIds(expectedIds, d4Ids)) {
      errors.push("D5 objective associations diverge from D4: " + requirement.requirement_id);
    }
  }

  return { valid: errors.length === 0, errors };
}
