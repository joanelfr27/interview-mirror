import {validateRequirementGraph,type EvidenceLedger} from '@/lib/canonical-evidence-model';
import {extractCanonicalElicitedAnswer} from '@/lib/canonical-shadow-extractor';
import {runD15BSemanticThreadEngine} from '@/lib/d15-semantic-thread-engine';
/** In-memory integration only. Answers remain candidate self-reports, never CV facts.
 * The E1 extractor receives only the answer; hypotheses/questions cannot become evidence.
 */
export async function applyD15ClarificationAnswer(ledger:EvidenceLedger,response:{id:string;question:string;answer:string}) {
 if(ledger.source_spans.some(s=>s.document_id==='ELICIT-'+response.id)) throw new Error('Clarification response id already exists');
 const extraction=await extractCanonicalElicitedAnswer(response.answer,response.id);
 const next={...ledger,source_spans:[...ledger.source_spans,...extraction.source_spans],evidence:[...ledger.evidence,...extraction.evidence]};
 if(!extraction.evidence.length) return {ledger:next,response,extraction,mirror:null,status:'NEEDS_MORE_DETAIL' as const};
 const graphErrors=validateRequirementGraph(next);
 if(graphErrors.length) throw new Error('Elicited graph validation failed: '+graphErrors.join(' | '));
 const mirror=await runD15BSemanticThreadEngine(next);
 return {ledger:next,response,extraction,mirror,status:'REJUDGED' as const};
}
