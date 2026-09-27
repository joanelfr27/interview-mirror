import { diagnosticExtractAtomsProbe } from "@/lib/canonical-shadow-extractor";

const probes = [
  "J'ai construit des modèles de forecast.",
  "My manager assigned this responsibility to me.",
  "My predecessor owned the reporting process before I joined.",
];

for (const probe of probes) {
  const atoms = await diagnosticExtractAtomsProbe(probe);

  console.log("OWNERSHIP_ISOLATED_PROBE_INPUT=" + JSON.stringify(probe));
  console.log("OWNERSHIP_ISOLATED_PROBE_RESULT=" + JSON.stringify(
    atoms.map((atom) => ({
      id: atom.id,
      source_quote: atom.source_quote,
      ownership: atom.ownership,
      normalized_action: atom.normalized_action,
      object: atom.object,
      assertion_type: atom.assertion_type,
    })),
  ));
}
