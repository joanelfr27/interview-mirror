import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";
import { buildFitGapProjection } from "@/lib/fit-gap-reasoning";
import { buildFitGapConsumerProjection } from "@/lib/fit-gap-consumer";
import { buildDemonstrationObjectiveConsumerProjection } from "@/lib/demonstration-objective-consumer";
import { buildCanonicalStrategyBridgeProjection } from "@/lib/canonical-strategy-bridge";
import { buildCanonicalProbeRoutingProjection, validateCanonicalProbeRoutingProjection } from "@/lib/canonical-probe-router";
import { buildCanonicalReasoningProjection } from "@/lib/canonical-reasoning-adapter";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";

const span=(id:string,document_id:string,text:string)=>({id,document_id,text,start_offset:0,end_offset:text.length,language:"en"});
const atom=(id:string,source_span_id:string,action:string,object:string,polarity:"AFFIRMATIVE"|"NEGATED"="AFFIRMATIVE")=>({
 id,source_span_id,provenance:{source_type:"CV" as const,language:"en",extraction_method:"LLM" as const},
 subject:{actor:"candidate",ownership:"INDIVIDUAL" as const},action:{normalized_action:action,object},context:{},scale:{},time:{},outcome:null,
 assertion:{type:"RESPONSIBILITY" as const,polarity},verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1
});
function ledger():EvidenceLedger{return {
 source_spans:[span("CV-1","CV","Managed regional finance."),span("JD-1","JD","Manage regional finance."),span("JD-2","JD","Mining operations experience."),span("EL-1","ELICIT-session-1","I have done the reporting work.")],
 evidence:[atom("A-DIRECT","CV-1","managed","regional finance"),atom("A-CONTRA","CV-1","manage","mining operations","NEGATED"),{...atom("ELICIT-ATOM","EL-1","did not have","mining operations","NEGATED"),provenance:{source_type:"CANDIDATE_ELICITED" as const,language:"en",extraction_method:"LLM" as const},assertion:{type:"ELICITED" as const,polarity:"NEGATED" as const}}],
 requirements:[
 {id:"R-DIRECT",source_span_id:"JD-1",normalized_requirement:"Manage regional finance",category:"RESPONSIBILITY",salience:"CORE",facets:[{id:"F-DIRECT",type:"FUNCTION",requirement:"Manage regional finance",source_span_id:"JD-1"}],extraction_confidence:1},
 {id:"R-GAP",source_span_id:"JD-2",normalized_requirement:"Mining operations experience",category:"RESPONSIBILITY",salience:"CORE",facets:[{id:"F-GAP",type:"CONTEXT",requirement:"Mining operations experience",source_span_id:"JD-2"}],extraction_confidence:1}],
 support_judgments:[
 {id:"SJ-DIRECT",requirement_id:"R-DIRECT",facet_id:"F-DIRECT",status:"DIRECT",supporting_evidence_ids:["A-DIRECT"],rationale:"Direct.",confidence:1,abstained:false,support_basis:"DOCUMENTED"},
 {id:"SJ-GAP",requirement_id:"R-GAP",facet_id:"F-GAP",status:"CONTRADICTORY",supporting_evidence_ids:["A-CONTRA"],rationale:"Negated.",confidence:.9,abstained:false,support_basis:"DOCUMENTED"}],
 requirement_statuses:[{requirement_id:"R-DIRECT",status:"SUPPORTED"},{requirement_id:"R-GAP",status:"CONTRADICTED"}],
 unresolved_items:[{id:"U-GAP",requirement_id:"R-GAP",facet_ids:["F-GAP"],type:"CONFLICTING",supporting_evidence_ids:[],contradiction_evidence_ids:["A-CONTRA"],absence_basis:"EXPLICIT_CONTRADICTION",negation_evidence_ids:["A-CONTRA"]}],
 candidate_elicitations:[],
 demonstration_objectives:[{id:"OBJ-GAP",target_unresolved_item_id:"U-GAP",observable_cue:"State the boundary honestly.",supporting_true_atom_ids:[],truthfulness_boundary:{permitted_claims:["State source facts."],prohibited_claims:["Do not claim mining experience."]},candidate_gap_classification:"EXPERIENCE_GAP",probe_family:"CONTEXT"}]
};}
function full(l:EvidenceLedger){l.candidate_elicitations=[{id:"EL-GAP",unresolved_item_id:"U-GAP",question:"Clarify experience.",answer:"I have done the reporting work.",answer_source_span_id:"EL-1",answer_assertion_type:"ELICITED",classification:"EXPERIENCE_GAP",classification_rationale:"Not target."}];const reasoning=buildCanonicalReasoningProjection(l);const d2=buildFitGapProjection(reasoning);const d3=buildCanonicalEvidenceRoute(l);const d4=buildFitGapConsumerProjection(d2,d3,l);const d5=buildDemonstrationObjectiveConsumerProjection(d4,d2,d3,l);const d6=buildCanonicalStrategyBridgeProjection(d4,d2,d3,d5,l);return {d2,d3,d4,d5,d6};}
test("D7 routes canonical objectives deterministically",()=>{const l=ledger();const x=full(l);const a=buildCanonicalProbeRoutingProjection(x.d6,x.d4,x.d2,x.d3,x.d5,l);const b=buildCanonicalProbeRoutingProjection(x.d6,x.d4,x.d2,x.d3,x.d5,l);assert.deepEqual(a,b);assert.equal(a.routes.length,1);assert.equal(a.routes[0]?.probe_mode,"BOUNDARY");assert.equal(a.routes[0]?.probe_family,"CONTEXT");});
test("D7 preserves truthfulness and ownership",()=>{const l=ledger();const x=full(l);const p=buildCanonicalProbeRoutingProjection(x.d6,x.d4,x.d2,x.d3,x.d5,l);assert.deepEqual(p.routes[0]?.prohibited_claims,["Do not claim mining experience."]);assert.equal(p.routes[0]?.requirement_id,"R-GAP");});
test("D7 rejects route reassignment",()=>{const l=ledger();const x=full(l);const p=buildCanonicalProbeRoutingProjection(x.d6,x.d4,x.d2,x.d3,x.d5,l);p.routes[0]!.requirement_id="R-DIRECT";const v=validateCanonicalProbeRoutingProjection(p,x.d6,x.d4,x.d2,x.d3,x.d5,l);assert.equal(v.valid,false);assert.match(v.errors.join(" | "),/ownership|diverge|route set/i);});
test("D7 rejects missing objective route",()=>{const l=ledger();const x=full(l);const p=buildCanonicalProbeRoutingProjection(x.d6,x.d4,x.d2,x.d3,x.d5,l);p.routes=[];const v=validateCanonicalProbeRoutingProjection(p,x.d6,x.d4,x.d2,x.d3,x.d5,l);assert.equal(v.valid,false);});
