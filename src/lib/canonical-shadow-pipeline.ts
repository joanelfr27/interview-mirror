import type { SessionRecord } from "@/types";
import { extractCanonicalShadow, type CanonicalShadowResult } from "@/lib/canonical-shadow-extractor";
import { judgeCanonicalSupport } from "@/lib/canonical-support-judge";
import { attachDemonstrationObjectives } from "@/lib/demonstration-objectives";
import { buildElicitationQuestion } from "@/lib/candidate-elicitation";
import { normalizeLanguage } from "@/lib/openai";
import { validateRequirementGraph, type EvidenceLedger } from "@/lib/canonical-evidence-model";

export type CanonicalShadowEarlyReturnReason =
  | "NO_EVIDENCE"
  | "NO_REQUIREMENTS";

export type CanonicalShadowCompleteness = Readonly<{
  status: "COMPLETE" | "INCOMPLETE";
  dropped_atom_ids: readonly string[];
  dropped_requirement_ids: readonly string[];
}>;

export class CanonicalShadowExtractionEarlyReturnError extends Error {
  public readonly extraction: CanonicalShadowResult["diagnostics"];
  public readonly reasons: readonly CanonicalShadowEarlyReturnReason[];

  constructor(
    extraction: CanonicalShadowResult["diagnostics"],
    reasons: readonly CanonicalShadowEarlyReturnReason[],
  ) {
    super("Canonical shadow pipeline stopped before support judge: " + reasons.join(", "));
    this.name = "CanonicalShadowExtractionEarlyReturnError";
    this.extraction = extraction;
    this.reasons = reasons;
  }
}

export function getCanonicalShadowEarlyReturnReasons(
  diagnostics: CanonicalShadowResult["diagnostics"],
  ledger: EvidenceLedger,
): CanonicalShadowEarlyReturnReason[] {
  const reasons: CanonicalShadowEarlyReturnReason[] = [];
  // Item-local validation failures are already excluded from the canonical ledger.
  // Preserve them in diagnostics/completeness, but do not turn partial extraction
  // into a session-level stop. Only total loss of a required collection is fatal.
  if (!ledger.evidence.length) reasons.push("NO_EVIDENCE");
  if (!ledger.requirements.length) reasons.push("NO_REQUIREMENTS");
  return reasons;
}

/**
 * Full E1 shadow pipeline. It remains isolated from the production Strategy
 * engine and writes nothing to sessions.
 */
export async function runCanonicalShadowPipeline(session: SessionRecord): Promise<{
  ledger: EvidenceLedger;
  diagnostics: string[];
  extraction: CanonicalShadowResult["diagnostics"];
  completeness: CanonicalShadowCompleteness;
}> {
  const extraction = await extractCanonicalShadow(session);
  let ledger = extraction.ledger;
  const diagnostics = [...extraction.diagnostics.errors, ...extraction.diagnostics.warnings];
  const earlyReturnReasons = getCanonicalShadowEarlyReturnReasons(extraction.diagnostics, ledger);
  const completeness: CanonicalShadowCompleteness = {
    status:
      extraction.diagnostics.rejected_atoms.length || extraction.diagnostics.rejected_requirements.length
        ? "INCOMPLETE"
        : "COMPLETE",
    dropped_atom_ids: [...extraction.diagnostics.rejected_atoms],
    dropped_requirement_ids: [...extraction.diagnostics.rejected_requirements],
  };
  if (completeness.status === "INCOMPLETE") {
    diagnostics.push(
      "Canonical extraction is incomplete: dropped atoms=" +
        completeness.dropped_atom_ids.join(",") +
        "; dropped requirements=" +
        completeness.dropped_requirement_ids.join(",") +
        ". Downstream outputs must not present this assessment as complete.",
    );
  }

  if (earlyReturnReasons.length) {
    throw new CanonicalShadowExtractionEarlyReturnError(
      extraction.diagnostics,
      earlyReturnReasons,
    );
  }

  const judged = await judgeCanonicalSupport(session, ledger);
  ledger = judged.ledger;
  diagnostics.push(...judged.diagnostics);

  const language = normalizeLanguage(session.preparation_language);
  const elicitations = ledger.unresolved_items.map(item =>
    buildElicitationQuestion(item, ledger, language),
  );
  ledger = { ...ledger, candidate_elicitations: elicitations };
  diagnostics.push(...validateRequirementGraph(ledger));

  const objectives = attachDemonstrationObjectives(ledger);
  ledger = objectives.ledger;
  diagnostics.push(...objectives.diagnostics, ...validateRequirementGraph(ledger));

  const finalErrors = validateRequirementGraph(ledger);
  if (finalErrors.length) {
    throw new Error("Canonical shadow graph failed final validation: " + finalErrors.join(" | "));
  }

  return { ledger, diagnostics, extraction: extraction.diagnostics, completeness };
}
