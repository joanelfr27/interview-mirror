export const JD_STABILITY_MAX_COUNT_DIVERGENCE = 0.2;
export const JD_STABILITY_MATERIAL_CONCEPTS = ["fund_financial_steering","investor_funder_relations","required_experience","bilingualism","degree_finance_specialization"] as const;
export type JdStabilityConcept = typeof JD_STABILITY_MATERIAL_CONCEPTS[number];
export type JdDecompositionSnapshot = Readonly<{ requirement_count:number; facet_count:number; concepts:Readonly<Record<JdStabilityConcept,boolean>> }>;
function divergence(a:number,b:number){ return Math.abs(a-b)/Math.max(a,b,1); }
export function evaluateJdStability(a:JdDecompositionSnapshot,b:JdDecompositionSnapshot){
 const missing_concepts=JD_STABILITY_MATERIAL_CONCEPTS.filter(k=>!a.concepts[k]||!b.concepts[k]);
 const requirement_count_divergence=Number(divergence(a.requirement_count,b.requirement_count).toFixed(3));
 const facet_count_divergence=Number(divergence(a.facet_count,b.facet_count).toFixed(3));
 return {missing_concepts,requirement_count_divergence,facet_count_divergence,
 pass:missing_concepts.length===0&&requirement_count_divergence<=JD_STABILITY_MAX_COUNT_DIVERGENCE&&facet_count_divergence<=JD_STABILITY_MAX_COUNT_DIVERGENCE,
 failure_response:"PERSIST_VALIDATED_DECOMPOSITION_PER_OPPORTUNITY" as const};
}
