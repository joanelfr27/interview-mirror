import type { SessionRecord } from "@/types";
import { extractCanonicalShadow, type CanonicalShadowResult } from "@/lib/canonical-shadow-extractor";
import { judgeCanonicalSupport } from "@/lib/canonical-support-judge";
import { attachDemonstrationObjectives } from "@/lib/demonstration-objectives";
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

  if (extraction.diagnostics.errors.length || !ledger.evidence.length || !ledger.requirements.length) {
    return { ledger, diagnostics, extraction: extraction.diagnostics };
  }

  const judged = await judgeCanonicalSupport(session, ledger);
  ledger = judged.ledger;
  diagnostics.push(...judged.diagnostics);

  const objectives = attachDemonstrationObjectives(ledger);
  ledger = objectives.ledger;
  diagnostics.push(...objectives.diagnostics, ...validateRequirementGraph(ledger));

  return { ledger, diagnostics, extraction: extraction.diagnostics };
}
