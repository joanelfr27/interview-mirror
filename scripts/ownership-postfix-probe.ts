import { diagnosticExtractAtomsProbe } from "@/lib/canonical-shadow-extractor";

const cases = [
  ["positive_en", "I built financial models."],
  ["positive_en_managerial", "I managed the forecasting process."],
  ["positive_fr", "J'ai construit des modèles de forecast."],
  ["positive_fr_managerial", "J'ai piloté le processus budgétaire."],
  ["negative_manager_assignment", "My manager assigned this responsibility to me."],
  ["negative_predecessor", "My predecessor owned the reporting process before I joined."],
  ["adversarial_joint", "I supported my manager in building the forecast models."],
  ["adversarial_shared", "I jointly built the forecast models with my manager."],
] as const;

for (const [name, probe] of cases) {
  const atoms = await diagnosticExtractAtomsProbe(probe);
  console.log(
    "OWNERSHIP_POSTFIX_PROBE_RESULT=" +
      JSON.stringify({
        case: name,
        input: probe,
        atoms: atoms.map((atom) => ({
          id: atom.id,
          ownership: atom.ownership,
          normalized_action: atom.normalized_action,
          object: atom.object,
          assertion_type: atom.assertion_type,
        })),
      }),
  );
}
