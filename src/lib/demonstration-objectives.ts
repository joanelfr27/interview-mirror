import type {
  AtomicEvidence, DemonstrationObjective, EvidenceLedger, CandidateGapClassification,
} from "@/lib/canonical-evidence-model";
import { validateDemonstrationObjective, validateDemonstrationEvidenceBinding } from "@/lib/canonical-evidence-model";

/**
 * E1.5 — demonstration objectives are generated downstream of the ledger.
 * They are not allowed to create evidence or upgrade a gap.
 */

function quoteForAtom(atom: AtomicEvidence, ledger: EvidenceLedger): string {
  return ledger.source_spans.find(s => s.id === atom.source_span_id)?.text ?? atom.action.normalized_action;
}

export function buildDemonstrationObjectives(ledger: EvidenceLedger): {
  objectives: DemonstrationObjective[];
  diagnostics: string[];
} {
  const diagnostics: string[] = [];
  const objectives: DemonstrationObjective[] = [];

  for (const item of ledger.unresolved_items) {
    const req = ledger.requirements.find(r => r.id === item.requirement_id);
    if (!req) continue;
    const facets = req.facets.filter(f => item.facet_ids.includes(f.id));
    const atoms = ledger.evidence.filter(
      a => item.supporting_evidence_ids.includes(a.id) && a.assertion.polarity === "AFFIRMATIVE",
    );
    const elicitation = ledger.candidate_elicitations.find(e => e.unresolved_item_id === item.id);
    const classification: CandidateGapClassification | undefined = elicitation?.classification;

    const permitted = atoms.map(a => "You may state only what is explicitly supported by: " + quoteForAtom(a, ledger));
    const prohibited = [
      "Do not claim the unresolved facet is fully established.",
      "Do not add an unrecorded tool, scope, ownership, metric, outcome, seniority or sector experience.",
    ];
    if (classification === "EXPERIENCE_GAP") {
      prohibited.push("Do not present the adjacent or hypothetical experience as direct experience.");
    }
    if (classification === "TRANSFERABLE") {
      prohibited.push("Do not describe the transferable experience as if it were the same requirement.");
    }

    const objective: DemonstrationObjective = {
      id: "DEMO-" + item.id,
      target_unresolved_item_id: item.id,
      observable_cue: "Make explicit the candidate's own evidence for: " + facets.map(f => f.requirement).join("; ") +
        ". If it cannot be honestly demonstrated, state the boundary rather than inventing evidence.",
      supporting_true_atom_ids: atoms.map(a => a.id),
      truthfulness_boundary: { permitted_claims: permitted, prohibited_claims: prohibited },
      candidate_gap_classification: classification,
      probe_family: facets.map(f => f.type).join("+"),
    };

    const validation = [
      ...validateDemonstrationObjective(objective),
      ...validateDemonstrationEvidenceBinding(objective, ledger.evidence),
    ];
    if (validation.length) diagnostics.push(...validation.map(x => "[" + objective.id + "] " + x));
    else objectives.push(objective);
  }

  return { objectives, diagnostics };
}

export function attachDemonstrationObjectives(ledger: EvidenceLedger): {
  ledger: EvidenceLedger;
  diagnostics: string[];
} {
  const built = buildDemonstrationObjectives(ledger);
  return {
    ledger: { ...ledger, demonstration_objectives: built.objectives },
    diagnostics: built.diagnostics,
  };
}
