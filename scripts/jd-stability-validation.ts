import { extractRawRequirementsForStability, type RawRequirement } from "../src/lib/canonical-shadow-extractor.ts";
import { evaluateJdStability, type JdDecompositionSnapshot, type JdStabilityConcept } from "../src/lib/jd-stability-gate.ts";

const jd = process.env.JD_STABILITY_TEXT;
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
const first = snapshot(await extractRawRequirementsForStability(jd));
const second = snapshot(await extractRawRequirementsForStability(jd));
const evaluation = evaluateJdStability(first, second);
console.log(JSON.stringify({ first, second, evaluation }, null, 2));
if (!evaluation.pass) process.exitCode = 1;
