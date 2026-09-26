import type { SessionRecord } from "@/types";
import { extractCanonicalShadow, type CanonicalShadowResult } from "@/lib/canonical-shadow-extractor";
import { judgeCanonicalSupport } from "@/lib/canonical-support-judge";
import { attachDemonstrationObjectives } from "@/lib/demonstration-objectives";
import { buildElicitationQuestion } from "@/lib/candidate-elicitation";
import { normalizeLanguage } from "@/lib/openai";
import { validateRequirementGraph, type EvidenceLedger } from "@/lib/canonical-evidence-model";

/**
 * Full E1 shadow pipeline. It remains isolated from the production Strategy
 * engine and writes nothing to sessions.
 */
export async function runCanonicalShadowPipeline(session: SessionRecord): Promise<{
  ledger: EvidenceLedger;
  diagnostics: string[];
  extraction: CanonicalShadowResult["diagnostics"];
}> {
  const extraction = await extractCanonicalShadow(session);
  let ledger = extraction.ledger;
  const diagnostics = [...extraction.diagnostics.errors, ...extraction.diagnostics.warnings];

  const extractionGateReasons: string[] = [];
  if (extraction.diagnostics.errors.length) extractionGateReasons.push(`errors=${extraction.diagnostics.errors.length}`);
  if (extraction.diagnostics.rejected_atoms.length) extractionGateReasons.push(`rejected_atoms=${extraction.diagnostics.rejected_atoms.length}`);
  if (extraction.diagnostics.rejected_requirements.length) extractionGateReasons.push(`rejected_requirements=${extraction.diagnostics.rejected_requirements.length}`);
  if (!ledger.evidence.length) extractionGateReasons.push("no_evidence");
  if (!ledger.requirements.length) extractionGateReasons.push("no_requirements");

  if (extractionGateReasons.length) {
    diagnostics.push(
      "E1 shadow extraction gate prevented support judging: " + extractionGateReasons.join(", ") +
      ` | evidence=${ledger.evidence.length} | requirements=${ledger.requirements.length} | facets=${ledger.requirements.reduce((count, requirement) => count + requirement.facets.length, 0)}`,
    );
    return { ledger, diagnostics, extraction: extraction.diagnostics };
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

  return { ledger, diagnostics, extraction: extraction.diagnostics };
}
