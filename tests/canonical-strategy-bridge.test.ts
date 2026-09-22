import test from "node:test";
import assert from "node:assert/strict";
import { buildStrategyEvidenceMapFromCanonicalLedger, validateStrategyEvidenceMapBoundary } from "@/lib/canonical-strategy-bridge";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";

const ledger: EvidenceLedger = {
 source_spans:[
  {id:"CV-1",document_id:"CV",text:"Managed regional finance.",start_offset:0,end_offset:25,language:"en"},
  {id:"JD-1",document_id:"JD",text:"Manage regional finance.",start_offset:0,end_offset:25,language:"en"},
 ],
 evidence:[{
  id:"A1",source_span_id:"CV-1",provenance:{source_type:"CV",language:"en",extraction_method:"LLM"},
  subject:{actor:"candidate",ownership:"INDIVIDUAL"},action:{normalized_action:"managed",object:"regional finance"},
  context:{},scale:{},time:{},outcome:null,assertion:{type:"RESPONSIBILITY",polarity:"AFFIRMATIVE"},
  verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1
 }],
 requirements:[{
  id:"R1",source_span_id:"JD-1",normalized_requirement:"Manage regional finance",category:"RESPONSIBILITY",salience:"CORE",
  facets:[{id:"F1",type:"FUNCTION",requirement:"Manage regional finance",source_span_id:"JD-1"}],extraction_confidence:1
 }],
 support_judgments:[{
  id:"S1",requirement_id:"R1",facet_id:"F1",status:"DIRECT",supporting_evidence_ids:["A1"],rationale:"Direct",confidence:1,
  abstained:false,support_basis:"DOCUMENTED"
 }],
 requirement_statuses:[{requirement_id:"R1",status:"SUPPORTED"}],
 unresolved_items:[],candidate_elicitations:[],demonstration_objectives:[]
};

test("D3 strategy bridge preserves canonical provenance",()=>{
 const map=buildStrategyEvidenceMapFromCanonicalLedger(ledger);
 assert.deepEqual(validateStrategyEvidenceMapBoundary(ledger,map),[]);
 assert.equal(map.length,1);
 assert.equal(map[0]?.node_id,"CE01");
 assert.equal(map[0]?.supporting_facts[0]?.fact_id,"A1");
 assert.equal(map[0]?.supporting_facts[0]?.exact_source_text,"Managed regional finance.");
 assert.equal(map[0]?.supporting_facts[0]?.requirement_relations?.[0]?.relation,"DIRECT");
 assert.equal(map[0]?.canonical_jd_requirements?.[0]?.requirement_id,"R1");
});

test("D3 strategy bridge does not manufacture a relation for unsupported evidence",()=>{
 const copy=structuredClone(ledger);
 copy.support_judgments[0]!.status="NONE";
 const map=buildStrategyEvidenceMapFromCanonicalLedger(copy);
 assert.equal(map[0]?.supporting_facts.length,0);
 assert.deepEqual(validateStrategyEvidenceMapBoundary(copy,map),[]);
});
