import type { GSDecision } from '@/lib/d15-gs-judges';
import type { D15BVerificationResult } from '@/lib/d15-semantic-thread-engine';
export const DEVELOPMENT_EXPECTATIONS = {
  codebook_blob:'56f753c50e50aeb8532d7e7a70eeea04f0e69255',
  status:'DEVELOPMENT_ONLY_NOT_QUALIFICATION',
  label_revision:'Erratum 2026-10-02: generic packaging retains a strong G reading but S4=NO; prior labels preserved at c0a52bd commit. Revised before comparison.',
  label_author:'AI_ASSISTANT_DEVELOPMENT_EXPECTATIONS_NOT_HUMAN_GOLD',
  // Expected labels apply to these exact propositions and cited legacy evidence,
  // not every possible headline from a CV. No minimum thread-count quota.
  controls:[
    {fixture:'NANCY',ids:['E4','E5','E6'],headline:'You work at the intersection of financial systems and business changes.',G:false,S:false},
    {fixture:'NANCY',ids:['E8','E10'],headline:'You bridge the gap between financial data and decision-making for your team.',G:false,S:false},
    {fixture:'DAVID',ids:['E2','E4'],headline:'You create a rhythm for the sales team by aligning forecasts with structured reviews.',G:false,S:true},
    {fixture:'MARIE',ids:['E5','E8'],headline:"Vous travaillez à l’intersection de l’analyse des problèmes et de la réorganisation des processus.",G:false,S:false},
  ],
  recall_policy:'Record all proposals, axes, licenses, vetoes and questions. Previous Nancy B, David rhythm and Marie diagnosis-change quotas are retired. Zero threads is not automatically a failure. No relabelling after output.',
} as const;
export function scoreDevelopmentControl(expected:{G:boolean;S:boolean},actual:GSDecision) {
  return {validation_failure:actual.G.connector==='INVALID'||actual.S.reason==='invalid S response',G_matches:actual.G.connector==='INVALID'?null:expected.G===actual.G.supported,S_matches:actual.S.reason==='invalid S response'?null:expected.S===actual.S.supported,expected_accept:expected.G&&expected.S,actual_accept:actual.accepted};
}
export function assessDevelopmentEngine(result:D15BVerificationResult) {
  return {mode:'DEVELOPMENT_ONLY',completion_state:result.completion_state,accepted_count:result.accepted.length,rejected_count:result.rejected.length,
    protocol_errors:result.accepted.flatMap(t=>!t.gs_decision?.accepted||!t.gs_decision.G.supported||!t.gs_decision.S.supported||t.gs_decision.vetoes.length?['Accepted thread lacks independent G AND S without veto: '+t.id]:[]),
    qualification_verdict:null};
}

// Explicit synthetic relationships: development controls, never candidate evidence.
export const POSITIVE_DEVELOPMENT_CONTROLS = [
 {id:'SYNTHETIC_EN_FEEDBACK',language:'en' as const,lines:['Collected feedback from users during the portal rollout.','Used that user feedback to revise the portal training guide.'],headline:'You use feedback collected during the portal rollout to revise the training guide.',G:true,S:true},
 {id:'SYNTHETIC_EN_RESPONSE',language:'en' as const,lines:['Reviewed recurring invoice exceptions.','Based on that review, revised the invoice intake checklist.'],headline:'You use reviews of recurring invoice exceptions to revise the intake checklist.',G:true,S:true},
 {id:'SYNTHETIC_FR_RESPONSE',language:'fr' as const,lines:['Analysait les incidents récurrents de traitement des commandes.','À partir de cette analyse, modifiait la procédure de traitement des commandes.'],headline:'Vous utilisez l’analyse des incidents récurrents pour modifier la procédure de traitement des commandes.',G:true,S:true},
] as const;

export const ENUMERATION_DEVELOPMENT_CONTROLS = [
 {fixture:'DAVID',ids:['E2','E4'],headline:'You prepared monthly sales forecasts and introduced a structured pipeline review for the sales team.',G:true,S:false},
 {fixture:'DAVID',ids:['E3','E6'],headline:'You visited key accounts to understand customer priorities and presented customer and market observations to senior management.',G:true,S:false},
 {fixture:'MARIE',ids:['E5','E8'],headline:'Vous avez analysé les retards de livraison et participé à la réorganisation du processus de traitement des commandes.',G:true,S:false},
 {fixture:'MARIE',ids:['E2','E6'],headline:'Vous avez suivi les incidents clients et coordonné le suivi des fournisseurs et des équipes internes lors des périodes de forte activité.',G:true,S:false},
 {fixture:'THOMAS',ids:['E4','E5'],headline:'You supported the rollout of a new customer portal and collected user feedback during the portal rollout.',G:true,S:false},
] as const;
