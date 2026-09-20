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

  if (
    extraction.diagnostics.errors.length ||
    extraction.diagnostics.rejected_atoms.length ||
    extraction.diagnostics.rejected_requirements.length ||
    !ledger.evidence.length ||
    !ledger.requirements.length
  ) {
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
