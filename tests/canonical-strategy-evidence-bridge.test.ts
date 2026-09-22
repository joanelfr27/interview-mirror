import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalStrategyEvidenceContext, assertCanonicalStrategyMode } from "@/lib/canonical-strategy-evidence-bridge";
import { buildCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";

const span=(id:string,document_id:string,text:string)=>({id,document_id,text,start_offset:0,end_offset:text.length,language:"en"});
const atom=(id:string,source_span_id:string,action:string,object:string)=>({
 id,source_span_id,provenance:{source_type:"CV" as const,language:"en",extraction_method:"LLM" as const},
 subject:{actor:"candidate",ownership:"INDIVIDUAL" as const},action:{normalized_action:action,object},
 context:{},scale:{},time:{},outcome:null,assertion:{type:"RESPONSIBILITY" as const,polarity:"AFFIRMATIVE" as const},
 verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1
});
function ledger(): EvidenceLedger {
 const req=(id:string,sp:string,text:string,facetType:"FUNCTION")=>({id,source_span_id:sp,normalized_requirement:text,category:"RESPONSIBILITY",salience:"CORE" as const,facets:[{id:"F-"+id,type:facetType,requirement:text,source_span_id:sp}],extraction_confidence:1});
 return {
  source_spans:[span("CV-1","CV","Managed regional finance."),span("JD-1","JD","Manage regional finance.")],
  evidence:[atom("A-1","CV-1","managed","regional finance")],
  requirements:[req("R-1","JD-1","Manage regional finance.","FUNCTION")],
  support_judgments:[{id:"SJ-1",requirement_id:"R-1",facet_id:"F-R-1",status:"DIRECT",supporting_evidence_ids:["A-1"],rationale:"Direct.",confidence:1,abstained:false,support_basis:"DOCUMENTED"}],
  requirement_statuses:[{requirement_id:"R-1",status:"SUPPORTED"}],
  unresolved_items:[],candidate_elicitations:[],demonstration_objectives:[]
 };
}
test("D3 Strategy bridge is deterministic and preserves canonical provenance",()=>{
 const context=buildCanonicalStrategyEvidenceContext(buildCanonicalEvidenceRoute(ledger()));
 assert.equal(context.version,"d3-strategy-v1");
 assert.equal(context.authoritative,true);
 assert.equal(context.requirements[0]?.mode,"DIRECT");
 assert.deepEqual(context.requirements[0]?.evidence,[{evidence_id:"A-1",source_span_id:"CV-1",source_quote:"Managed regional finance."}]);
});
test("canonical mode is authoritative when legacy agrees",()=>{
 const context=buildCanonicalStrategyEvidenceContext(buildCanonicalEvidenceRoute(ledger()));
 assert.equal(assertCanonicalStrategyMode(context,"R-1","DIRECT"),"DIRECT");
});
test("canonical-vs-legacy disagreement fails closed",()=>{
 const context=buildCanonicalStrategyEvidenceContext(buildCanonicalEvidenceRoute(ledger()));
 assert.throws(()=>assertCanonicalStrategyMode(context,"R-1","VERIFY_GAP"),/mode conflict/);
});
test("unknown requirement fails closed",()=>{
 const context=buildCanonicalStrategyEvidenceContext(buildCanonicalEvidenceRoute(ledger()));
 assert.throws(()=>assertCanonicalStrategyMode(context,"R-MISSING"),/cannot resolve requirement/);
});
