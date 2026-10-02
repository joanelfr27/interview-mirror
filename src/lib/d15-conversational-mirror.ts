import {validateRequirementGraph,type EvidenceLedger} from '@/lib/canonical-evidence-model';
import {extractCanonicalElicitedAnswer} from '@/lib/canonical-shadow-extractor';
import {verifyD15BSemanticThreadProposals,type D15BVerificationResult} from '@/lib/d15-semantic-thread-engine';
import {judgeD15GS,attributionVetoDetails,type GSDecision} from '@/lib/d15-gs-judges';
import {d15ThreadEligibleAtoms} from '@/lib/d15-evidence-eligibility';
import {clarificationKey,clarificationSourceQuotes,rememberedClarification} from '@/lib/d15-clarification-state';

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
 const reading=target.gs_decision.semantic_reading;
 const remembered=rememberedClarification(ledger,target.evidence_ids,reading.asserted_proposition,reading.language);
 if(ledger.mirror_clarifications?.some(r=>r.responses.some(a=>a.id===response.id))) throw new Error('Clarification response id already exists');
 if(ledger.source_spans.some(s=>s.document_id==='ELICIT-'+response.id)) throw new Error('Clarification response id already exists');
 const disposition=remembered?.status==='DENIED'||remembered?.status==='CLOSED_OTHER_ACTOR'?'DENIED':shortAnswerDisposition(response.answer);
 // Negative/underspecified short answers cannot be promoted to affirmative atoms.
 const extraction=disposition==='DETAIL'
  ? await (services.extract??extractCanonicalElicitedAnswer)(response.answer,response.id)
  : {source_spans:[],evidence:[],rejected:[],answer:response.answer};
 const next={...ledger,source_spans:[...ledger.source_spans,...extraction.source_spans],evidence:[...ledger.evidence,...extraction.evidence]};
 const mirror:D15BVerificationResult={accepted:[],rejected:[],clarification_questions:[],cv_question_back:null,completion_state:'COMPLETED_NO_QUALIFYING_RELATIONSHIP'};
 const finish=(status:'DENIED'|'CLOSED_OTHER_ACTOR'|'NEEDS_MORE_DETAIL'|'REJUDGED',decision:GSDecision|null,excluded_evidence:ReturnType<typeof attributionVetoDetails>)=>{
  const confirmed=mirror.accepted.length>0;
  const unresolved=status!=='DENIED'&&status!=='CLOSED_OTHER_ACTOR'&&!confirmed;
  const follow_up=unresolved&&!remembered?.follow_up_issued
   ? reading.language==='fr'?'Pouvez-vous donner un exemple concret et préciser votre contribution personnelle, s’il y en avait une ?':'Could you give a concrete example and describe your own contribution, if any?'
   : null;
  const record={key:clarificationKey(ledger,target.evidence_ids,reading.asserted_proposition,reading.language),headline:target.gs_decision.headline,asserted_proposition:reading.asserted_proposition,language:reading.language,source_quotes:clarificationSourceQuotes(ledger,target.evidence_ids),status:status==='DENIED'?'DENIED' as const:status==='CLOSED_OTHER_ACTOR'?'CLOSED_OTHER_ACTOR' as const:confirmed?'CONFIRMED' as const:'NEEDS_MORE_DETAIL' as const,responses:[...(remembered?.responses??[]),{id:response.id,answer:response.answer}],follow_up_issued:Boolean(remembered?.follow_up_issued||follow_up)};
  next.mirror_clarifications=[...(ledger.mirror_clarifications??[]).filter(r=>r.key!==record.key),record];
  return {ledger:next,response,extraction,mirror,status,repeat_question:false,follow_up,unresolved:unresolved?record:null,decision,excluded_evidence};
 };
 if(remembered?.status==='CLOSED_OTHER_ACTOR') return finish('CLOSED_OTHER_ACTOR',null,[]);
 if(disposition!=='DETAIL'||!extraction.evidence.length) return finish(disposition==='DENIED'?'DENIED':'NEEDS_MORE_DETAIL',null,[]);
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
  mirror.accepted=verified.accepted.map(t=>{
   // CV atoms establish the activities, not additional support for the newly
   // confirmed link. Multiple atoms from this response are still one unit.
   const licensedAnswer=next.evidence.filter(a=>decision.G.minimal_atom_subset.includes(a.id)&&newIds.has(a.id));
   const units=new Set(licensedAnswer.map(a=>next.source_spans.find(s=>s.id===a.source_span_id)?.document_id));
   return {...t,gs_decision:decision,maturity:'CONFIRMED_RELATIONSHIP' as const,relationship_support_unit_count:units.size};
  });mirror.rejected=verified.rejected;mirror.completion_state=verified.completion_state;
 } else {
  mirror.rejected=[{proposal_id:target.proposal_id,diagnostic_headline:target.gs_decision.headline,gs_decision:decision,reasons:[decision.accepted?'No new answer evidence licensed this claim':`G=${decision.G.supported}; S=${decision.S.supported}; vetoes=${decision.vetoes.join(',')}`]}];
  mirror.completion_state='ALL_REJECTED';
 }
 // A named other actor explains the link; retain the candidate's stated role
 // without asking them to repeat it or converting that actor's work to theirs.
 const otherCredit=extraction.evidence.some(a=>a.subject.actor_basis==='EXPLICIT_OTHER'||(
  a.subject.actor_basis==='UNSPECIFIED'&&next.source_spans.some(s=>s.id===a.source_span_id&&
   /^(?:my manager|my supervisor|mon responsable|ma responsable|mon manager)\b/iu.test(s.text.trim()))
 ));
 return finish(!decision.G.supported&&otherCredit?'CLOSED_OTHER_ACTOR':'REJUDGED',decision,excluded_evidence);
}
