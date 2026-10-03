import fs from "node:fs";
import { extractRawRequirementsForStability, type RawRequirement } from "../src/lib/canonical-shadow-extractor.ts";
import { evaluateJdStability, type JdDecompositionSnapshot, type JdStabilityConcept } from "../src/lib/jd-stability-gate.ts";

const jd = process.env.JD_STABILITY_TEXT;
const outputPath = process.env.JD_STABILITY_RESULT_PATH ?? "jd-stability-result.json";
if (!jd?.trim()) throw new Error("JD_STABILITY_TEXT is required.");

function conceptPresence(items: readonly RawRequirement[]): Record<JdStabilityConcept, boolean> {
  const text = items.flatMap((item) => [item.source_quote, item.normalized_requirement, ...item.facets.flatMap((f) => [f.source_quote, f.requirement])]).join("\n");
  return {
    fund_financial_steering: /(?:\bfund\b|\bfonds\b).{0,80}(?:financial|financi|budget|forecast|report)|(?:financial|financi).{0,80}(?:\bfund\b|\bfonds\b)/i.test(text),
    investor_funder_relations: /investor|investisseur|lender|prêteur|funder|bailleur|shareholder|actionnaire/i.test(text),
    required_experience: /(?:experience|expérience).{0,60}\b\d{1,2}\s*(?:[-–à]\s*\d{1,2}\s*)?(?:years?|ans?|années?)\b|\b\d{1,2}\s*(?:[-–à]\s*\d{1,2}\s*)?(?:years?|ans?|années?)\b.{0,60}(?:experience|expérience)/i.test(text),
    bilingualism: /bilingual|bilingue|english.{0,40}french|french.{0,40}english|anglais.{0,40}français|français.{0,40}anglais/i.test(text),
    degree_finance_specialization:
      /(?:bac\s*\+?\s*5|master|degree|diplôme).{0,80}(?:finance|corporate finance|finance d'entreprise)|(?:finance|corporate finance|finance d'entreprise).{0,80}(?:bac\s*\+?\s*5|master|degree|diplôme)/i.test(text),
  };
}

function snapshot(items: readonly RawRequirement[]): JdDecompositionSnapshot {
  return { requirement_count: items.length, facet_count: items.reduce((n,item)=>n+item.facets.length,0), concepts: conceptPresence(items) };
}

function serializableRequirements(items: readonly RawRequirement[]) {
  return items.map((item) => ({
    source_quote: item.source_quote,
    normalized_requirement: item.normalized_requirement,
    facets: item.facets.map((facet) => ({ source_quote: facet.source_quote, requirement: facet.requirement })),
  }));
}

const result: any = {
  schema_version: 2,
  mode: "REAL",
  model_id: null,
  expected_calls: 2,
  calls: [
    { call: 1, status: "NOT_STARTED" },
    { call: 2, status: "NOT_STARTED" },
  ],
  complete: false,
};

function writeResult() {
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");
}
writeResult();

try {
  result.calls[0].status = "STARTED"; writeResult();
  const firstItems = await extractRawRequirementsForStability(jd);
  result.model_id = process.env.JD_STABILITY_MODEL_ID ?? "canonical-shadow-extractor-configured-model";
  result.calls[0] = { call: 1, status: "COMPLETED", requirements: serializableRequirements(firstItems), snapshot: snapshot(firstItems) };
  writeResult();

  result.calls[1].status = "STARTED"; writeResult();
  const secondItems = await extractRawRequirementsForStability(jd);
  result.calls[1] = { call: 2, status: "COMPLETED", requirements: serializableRequirements(secondItems), snapshot: snapshot(secondItems) };

  result.evaluation = evaluateJdStability(result.calls[0].snapshot, result.calls[1].snapshot);
  result.complete = true;
  result.verdict = result.evaluation.pass ? "PASS" : "FAIL";
  writeResult();
  console.log(JSON.stringify({ verdict: result.verdict, evaluation: result.evaluation }, null, 2));
  if (!result.evaluation.pass) process.exitCode = 1;
} catch (error) {
  result.error = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  result.verdict = "EXECUTION_ERROR";
  writeResult();
  console.error(error);
  process.exitCode = 1;
}
