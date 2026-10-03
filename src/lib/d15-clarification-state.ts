import type {EvidenceLedger,MirrorClarificationRecord} from '@/lib/canonical-evidence-model';
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase().replace(/[.!?]+$/u,'').replace(/\s+/gu,' ').trim();
export function clarificationSourceQuotes(ledger:EvidenceLedger,ids:string[]) {
 return [...new Set(ids.map(id=>ledger.source_spans.find(s=>s.id===ledger.evidence.find(a=>a.id===id)?.source_span_id)?.text).filter((s):s is string=>Boolean(s)))].sort();
}
export function clarificationKey(ledger:EvidenceLedger,ids:string[],proposition:string,language:'en'|'fr') {
 return JSON.stringify([language,clarificationSourceQuotes(ledger,ids).map(normalize),normalize(proposition)]);
}
export function rememberedClarification(ledger:EvidenceLedger,ids:string[],proposition:string,language:'en'|'fr'):MirrorClarificationRecord|undefined {
 const key=clarificationKey(ledger,ids,proposition,language);
 return ledger.mirror_clarifications?.find(r=>r.key===key);
}
/** Exact proposition + source context suppression survives atom-ID changes and JSON reloads.
 * Semantic paraphrases additionally depend on the proposer respecting denied context.
 */
export function deniedClarification(ledger:EvidenceLedger,ids:string[],proposition:string,language:'en'|'fr'):boolean {
 return rememberedClarification(ledger,ids,proposition,language)?.status==='DENIED';
}

export function closedClarification(ledger:EvidenceLedger,ids:string[],proposition:string,language:'en'|'fr'):boolean {
 const status=rememberedClarification(ledger,ids,proposition,language)?.status;
 return status==='DENIED'||status==='CLOSED_OTHER_ACTOR';
}
