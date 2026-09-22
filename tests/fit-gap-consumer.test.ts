import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalReasoningProjection } from "@/lib/canonical-reasoning-adapter";
import { buildCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";
import { buildFitGapProjection } from "@/lib/fit-gap-reasoning";
import {
  buildFitGapConsumerProjection,
  validateFitGapConsumerProjection,
} from "@/lib/fit-gap-consumer";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";

const span=(id:string,document_id:string,text:string)=>({id,document_id,text,start_offset:0,end_offset:text.length,language:"en"});
const atom=(id:string,source_span_id:string,action:string,object:string,polarity:"AFFIRMATIVE"|"NEGATED"="AFFIRMATIVE")=>({
 id,source_span_id,provenance:{source_type:"CV" as const,language:"en",extraction_method:"LLM" as const},
 subject:{actor:"candidate",ownership:"INDIVIDUAL" as const},action:{normalized_action:action,object},context:{},scale:{},time:{},outcome:null,
 assertion:{type:"RESPONSIBILITY" as const,polarity},verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1
});
function fixture():EvidenceLedger{
 const req=(id:string,sp:string,text:string,facetType:"FUNCTION"|"TOOL_METHOD"|"CONTEXT")=>({id,source_span_id:sp,normalized_requirement:text,category:"RESPONSIBILITY",salience:"CORE" as const,facets:[{id:"F-"+id,type:facetType,requirement:text,source_span_id:sp}],extraction_confidence:1});
 return {
  source_spans:[span("CV-1","CV","Managed regional finance."),span("CV-2","CV","Worked on adjacent reporting systems."),span("CV-3","CV","Did not manage mining operations."),span("JD-1","JD","Manage regional finance."),span("JD-2","JD","Use target reporting systems."),span("JD-3","JD","Mining operations experience.")],
  evidence:[atom("A-DIRECT","CV-1","managed","regional finance"),atom("A-TRANSFER","CV-2","worked","adjacent reporting systems"),atom("A-CONTRADICT","CV-3","manage","mining operations","NEGATED")],
  requirements:[req("R-DIRECT","JD-1","Manage regional finance","FUNCTION"),req("R-TRANSFER","JD-2","Use target reporting systems","TOOL_METHOD"),req("R-GAP","JD-3","Mining operations experience","CONTEXT")],
  support_judgments:[
   {id:"SJ-DIRECT",requirement_id:"R-DIRECT",facet_id:"F-R-DIRECT",status:"DIRECT",supporting_evidence_ids:["A-DIRECT"],rationale:"Direct.",confidence:1,abstained:false,support_basis:"DOCUMENTED"},
   {id:"SJ-TRANSFER",requirement_id:"R-TRANSFER",facet_id:"F-R-TRANSFER",status:"ANALOGICAL_TRANSFER",supporting_evidence_ids:["A-TRANSFER"],rationale:"Adjacent.",confidence:.7,abstained:false,support_basis:"DOCUMENTED",analogical_mapping:{shared_dimensions:["systems"],unshared_dimensions:["target environment"]}},
   {id:"SJ-GAP",requirement_id:"R-GAP",facet_id:"F-R-GAP",status:"CONTRADICTORY",supporting_evidence_ids:["A-CONTRADICT"],rationale:"Negated.",confidence:.95,abstained:false,support_basis:"DOCUMENTED"}
  ],
  requirement_statuses:[{requirement_id:"R-DIRECT",status:"SUPPORTED"},{requirement_id:"R-TRANSFER",status:"PARTIAL"},{requirement_id:"R-GAP",status:"CONTRADICTED"}],
  unresolved_items:[{id:"U-GAP",requirement_id:"R-GAP",facet_ids:["F-R-GAP"],type:"CONFLICTING",supporting_evidence_ids:[],contradiction_evidence_ids:["A-CONTRADICT"],absence_basis:"EXPLICIT_CONTRADICTION",negation_evidence_ids:["A-CONTRADICT"]}],
  candidate_elicitations:[],
  demonstration_objectives:[]
 };
}
function buildAll(l=fixture()){
 const reasoning=buildCanonicalReasoningProjection(l);
 const fit=buildFitGapProjection(reasoning);
 const route=buildCanonicalEvidenceRoute(l);
 return {l,fit,route};
}
test("D4 preserves direct, transferable and verify-gap route boundaries",()=>{
 const {l,fit,route}=buildAll();
 const out=buildFitGapConsumerProjection(fit,route,l);
 assert.equal(out.requirements.find(r=>r.requirement_id==="R-DIRECT")?.fit_state,"ESTABLISHED");
 assert.equal(out.requirements.find(r=>r.requirement_id==="R-DIRECT")?.route_mode,"DIRECT");
 assert.equal(out.requirements.find(r=>r.requirement_id==="R-TRANSFER")?.fit_state,"PARTIAL");
 assert.equal(out.requirements.find(r=>r.requirement_id==="R-TRANSFER")?.route_mode,"TRANSFERABLE");
 assert.equal(out.requirements.find(r=>r.requirement_id==="R-GAP")?.fit_state,"CONTRADICTED");
 assert.equal(out.requirements.find(r=>r.requirement_id==="R-GAP")?.route_mode,"VERIFY_GAP");
});
test("D4 is deterministic and preserves exact D3 evidence provenance",()=>{
 const a=buildAll(),b=buildAll();
 const oa=buildFitGapConsumerProjection(a.fit,a.route,a.l);
 const ob=buildFitGapConsumerProjection(b.fit,b.route,b.l);
 assert.deepEqual(oa,ob);
 const direct=oa.requirements.find(r=>r.requirement_id==="R-DIRECT")!;
 assert.deepEqual(direct.candidates,[{evidence_id:"A-DIRECT",source_span_id:"CV-1",source_quote:"Managed regional finance.",support_status:"DIRECT"}]);
});
test("D4 fail-closes on mismatched requirement sets",()=>{
 const {l,fit,route}=buildAll();
 fit.requirements=fit.requirements.filter(r=>r.requirement_id!=="R-GAP");
 assert.throws(()=>buildFitGapConsumerProjection(fit,route,l),/requirement sets|missing requirement/i);
});
test("D4 fail-closes on tampered D3 evidence and mode",()=>{
 const {l,fit,route}=buildAll();
 const direct=route.requirements.find(r=>r.requirement_id==="R-DIRECT")!;
 direct.candidates[0]!.source_quote="Fabricated.";
 assert.throws(()=>buildFitGapConsumerProjection(fit,route,l),/canonical evidence route is invalid|source quote/i);
 const second=buildAll();
 const direct2=second.route.requirements.find(r=>r.requirement_id==="R-DIRECT")!;
 direct2.mode="VERIFY_GAP";
 assert.throws(()=>buildFitGapConsumerProjection(second.fit,second.route,second.l),/canonical evidence route is invalid|mode/i);
});
test("D4 cannot accept injected evidence not supplied by D3",()=>{
 const {l,fit,route}=buildAll();
 const direct=route.requirements.find(r=>r.requirement_id==="R-DIRECT")!;
 direct.candidates.push({evidence_id:"A-TRANSFER",source_span_id:"CV-2",source_quote:"Worked on adjacent reporting systems.",support_status:"DIRECT"});
 assert.throws(()=>buildFitGapConsumerProjection(fit,route,l),/canonical evidence route is invalid|not owned/i);
});
test("D4 preserves partial, evidence-gap, experience-gap and contradicted states",()=>{
 const {l,fit,route}=buildAll();
 const direct=fit.requirements.find(r=>r.requirement_id==="R-DIRECT")!;
 direct.requirement_status="PARTIAL"; direct.fit_state="PARTIAL";
 const transfer=fit.requirements.find(r=>r.requirement_id==="R-TRANSFER")!;
 transfer.gap_classification="EVIDENCE_GAP"; transfer.fit_state="EVIDENCE_GAP";
 const gap=fit.requirements.find(r=>r.requirement_id==="R-GAP")!;
 gap.gap_classification=null; gap.fit_state="CONTRADICTED";
 assert.throws(()=>buildFitGapConsumerProjection(fit,route,l),/D4 Fit & Gap projection is invalid/);
 const valid=buildAll();
 const t=valid.fit.requirements.find(r=>r.requirement_id==="R-TRANSFER")!;
 t.requirement_status="UNJUDGED"; t.gap_classification="EVIDENCE_GAP"; t.fit_state="EVIDENCE_GAP";
 assert.throws(()=>buildFitGapConsumerProjection(valid.fit,valid.route,valid.l),/requirement reasoning is inconsistent/);
});
test("D4 validator rejects consumer evidence injection and state tampering",()=>{
 const {l,fit,route}=buildAll();
 const out=buildFitGapConsumerProjection(fit,route,l);
 const direct=out.requirements.find(r=>r.requirement_id==="R-DIRECT")!;
 direct.candidates[0]!.source_quote="Injected.";
 let validation=validateFitGapConsumerProjection(out,fit,route,l);
 assert.equal(validation.valid,false);
 const fresh=buildAll(); const out2=buildFitGapConsumerProjection(fresh.fit,fresh.route,fresh.l);
 out2.requirements.find(r=>r.requirement_id==="R-DIRECT")!.preparation_state="VERIFY_BEFORE_INTERVIEW";
 validation=validateFitGapConsumerProjection(out2,fresh.fit,fresh.route,fresh.l);
 assert.equal(validation.valid,false);
});
