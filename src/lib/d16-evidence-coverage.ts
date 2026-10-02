/** Evidence-required denominator must be separate from explicitly exempt actions. */
export function d16EvidenceCoverage(actions: ReadonlyArray<{evidence_reference_mode:string; evidence_ids:readonly string[]}>) {
  const required=actions.filter(a=>a.evidence_reference_mode!=='NO_CANDIDATE_EVIDENCE');
  const linked=required.filter(a=>a.evidence_ids.length>0);
  return {total_actions:actions.length,evidence_required_actions:required.length,evidence_linked_required_actions:linked.length,evidence_exempt_actions:actions.length-required.length,coverage_rate:required.length?linked.length/required.length:null,status:required.length===0?'NOT_EVALUATED':linked.length===required.length?'PASS':'FAIL'};
}
