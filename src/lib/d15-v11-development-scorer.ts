import type { GSDecision } from '@/lib/d15-gs-judges';
import type { D15BVerificationResult } from '@/lib/d15-semantic-thread-engine';
export const DEVELOPMENT_EXPECTATIONS = {
  codebook_blob:'56f753c50e50aeb8532d7e7a70eeea04f0e69255',
  status:'DEVELOPMENT_ONLY_NOT_QUALIFICATION',
  label_author:'AI_ASSISTANT_DEVELOPMENT_EXPECTATIONS_NOT_HUMAN_GOLD',
  // Expected labels apply to these exact propositions and cited legacy evidence,
  // not every possible headline from a CV. No minimum thread-count quota.
  controls:[
    {fixture:'NANCY',ids:['E4','E5','E6'],headline:'You work at the intersection of financial systems and business changes.',G:true,S:false},
    {fixture:'NANCY',ids:['E8','E10'],headline:'You bridge the gap between financial data and decision-making for your team.',G:true,S:false},
    {fixture:'DAVID',ids:['E2','E4'],headline:'You create a rhythm for the sales team by aligning forecasts with structured reviews.',G:false,S:true},
    {fixture:'MARIE',ids:['E5','E8'],headline:"Vous travaillez à l’intersection de l’analyse des problèmes et de la réorganisation des processus.",G:true,S:false},
  ],
  recall_policy:'Record all proposals, axes, licenses, vetoes and questions. Previous Nancy B, David rhythm and Marie diagnosis-change quotas are retired. Zero threads is not automatically a failure. No relabelling after output.',
} as const;
export function scoreDevelopmentControl(expected:{G:boolean;S:boolean},actual:GSDecision) {
  return {G_matches:expected.G===actual.G.supported,S_matches:expected.S===actual.S.supported,expected_accept:expected.G&&expected.S,actual_accept:actual.accepted};
}
export function assessDevelopmentEngine(result:D15BVerificationResult) {
  return {mode:'DEVELOPMENT_ONLY',completion_state:result.completion_state,accepted_count:result.accepted.length,rejected_count:result.rejected.length,
    protocol_errors:result.accepted.flatMap(t=>!t.gs_decision?.accepted||!t.gs_decision.G.supported||!t.gs_decision.S.supported||t.gs_decision.vetoes.length?['Accepted thread lacks independent G AND S without veto: '+t.id]:[]),
    qualification_verdict:null};
}
