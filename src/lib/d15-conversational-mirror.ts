import {validateRequirementGraph,type EvidenceLedger} from '@/lib/canonical-evidence-model';
import {extractCanonicalElicitedAnswer} from '@/lib/canonical-shadow-extractor';
import {verifyD15BSemanticThreadProposals,type D15BVerificationResult} from '@/lib/d15-semantic-thread-engine';
import {judgeD15GS,attributionVetoDetails,type GSDecision} from '@/lib/d15-gs-judges';
import {d15ThreadEligibleAtoms} from '@/lib/d15-evidence-eligibility';

export type D15ClarificationTarget={proposal_id:string;question:string;evidence_ids:string[];gs_decision:GSDecision};
/** Conservative short-answer handling, not a general semantic classifier.
 * Other answers still require E1 evidence and both judges. No bare yes grants support.
 */
export function shortAnswerDisposition(answer:string):'DENIED'|'PARTIAL'|'DETAIL' {
 const text=answer.trim();
 const short=text.split(/\s+/u).length<=8;
 if(short && /^(?:no|non)\b/iu.test(text) &&
  /(?:\b(?:no connection|not connected|weren['’]t connected|no link|not linked)\b|n['’]étaient pas lié(?:e)?s|aucun lien|pas de lien)/iu.test(text)) return 'DENIED';
 if(short && /\b(?:sometimes|occasionally|parfois|occasionnellement)\b/iu.test(text) &&
  /\b(?:informally|informal|informelle|informellement)\b/iu.test(text)) return 'PARTIAL';
 return 'DETAIL';
}

/** Re-judge the stored proposition/reading; never call the proposer on this path.
 * Questions and hypotheses are never sent to E1. Only source-backed eligible atoms
 * can license acceptance, and accepted citations use G's validated minimal subset.
 */
export async function applyD15ClarificationAnswer(
 ledger:EvidenceLedger,
 response:{id:string;answer:string;target:D15ClarificationTarget},
 services:{extract?:typeof extractCanonicalElicitedAnswer;judge?:typeof judgeD15GS}={},
) {
 const {target}=response;
 if(!target.gs_decision.semantic_reading) throw new Error('Clarification requires its stored semantic reading');
 if(target.gs_decision.accepted||target.gs_decision.G.supported||!target.gs_decision.S.supported||target.gs_decision.vetoes.length) throw new Error('Target is not an eligible clarification');
 if(ledger.source_spans.some(s=>s.document_id==='ELICIT-'+response.id)) throw new Error('Clarification response id already exists');
 const disposition=shortAnswerDisposition(response.answer);
 // Negative/underspecified short answers cannot be promoted to affirmative atoms.
 const extraction=disposition==='DETAIL'
  ? await (services.extract??extractCanonicalElicitedAnswer)(response.answer,response.id)
  : {source_spans:[],evidence:[],rejected:[],answer:response.answer};
 const next={...ledger,source_spans:[...ledger.source_spans,...extraction.source_spans],evidence:[...ledger.evidence,...extraction.evidence]};
 const mirror:D15BVerificationResult={accepted:[],rejected:[],clarification_questions:[],cv_question_back:null,completion_state:'COMPLETED_NO_QUALIFYING_RELATIONSHIP'};
 if(disposition!=='DETAIL'||!extraction.evidence.length) return {ledger:next,response,extraction,mirror,status:disposition==='DENIED'?'DENIED' as const:'NEEDS_MORE_DETAIL' as const,repeat_question:false,decision:null,excluded_evidence:[]};
 const graphErrors=validateRequirementGraph(next);
 if(graphErrors.length) throw new Error('Elicited graph validation failed: '+graphErrors.join(' | '));
 const eligible=new Set(d15ThreadEligibleAtoms(next).map(a=>a.id));
 const candidateIds=[...new Set([...target.evidence_ids,...extraction.evidence.map(a=>a.id)])];
 const excluded_evidence=attributionVetoDetails(next,candidateIds);
 const excluded=new Set(excluded_evidence.map(d=>d.evidence_id));
 const ids=candidateIds.filter(id=>eligible.has(id)&&!excluded.has(id));
 const decision=await (services.judge??judgeD15GS)(next,ids,target.gs_decision.headline,{reading:target.gs_decision.semantic_reading});
 const newIds=new Set(extraction.evidence.map(a=>a.id));
 if(decision.accepted&&decision.G.minimal_atom_subset.some(id=>newIds.has(id))) {
  const verified=verifyD15BSemanticThreadProposals(next,[{id:target.proposal_id,headline:target.gs_decision.headline,evidence_ids:decision.G.minimal_atom_subset,question_back:null}]);
  mirror.accepted=verified.accepted.map(t=>({...t,gs_decision:decision}));mirror.rejected=verified.rejected;mirror.completion_state=verified.completion_state;
 } else {
  mirror.rejected=[{proposal_id:target.proposal_id,diagnostic_headline:target.gs_decision.headline,gs_decision:decision,reasons:[decision.accepted?'No new answer evidence licensed this claim':`G=${decision.G.supported}; S=${decision.S.supported}; vetoes=${decision.vetoes.join(',')}`]}];
  mirror.completion_state='ALL_REJECTED';
 }
 return {ledger:next,response,extraction,mirror,status:'REJUDGED' as const,repeat_question:false,decision,excluded_evidence};
}
