import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";
import { buildFitGapProjection } from "@/lib/fit-gap-reasoning";
import { buildFitGapConsumerProjection } from "@/lib/fit-gap-consumer";
import { buildDemonstrationObjectiveConsumerProjection } from "@/lib/demonstration-objective-consumer";
import {
  buildCanonicalStrategyBridgeProjection,
  validateCanonicalStrategyBridgeProjection,\n  strategyActionFor,
} from "@/lib/canonical-strategy-bridge";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";
import { buildCanonicalReasoningProjection } from "@/lib/canonical-reasoning-adapter";

const span=(id:string,document_id:string,text:string)=>({id,document_id,text,start_offset:0,end_offset:text.length,language:"en"});
const atom=(id:string,source_span_id:string,action:string,object:string,polarity:"AFFIRMATIVE"|"NEGATED"="AFFIRMATIVE")=>({
 id,source_span_id,provenance:{source_type:"CV" as const,language:"en",extraction_method:"LLM" as const},
 subject:{actor:"candidate",ownership:"INDIVIDUAL" as const},action:{normalized_action:action,object},
 context:{},scale:{},time:{},outcome:null,assertion:{type:"RESPONSIBILITY" as const,polarity},
 verifiability:{has_quantifiable_metric:false,has_third_party_entity:false,has_time_anchor:false},extraction_confidence:1
});
function ledger(): EvidenceLedger {
 return {
  source_spans:[span("CV-1","CV","Managed regional finance."),span("CV-2","CV","Worked with adjacent systems."),span("CV-3","CV","Did not manage mining operations."),span("JD-1","JD","Manage regional finance."),span("JD-2","JD","Use target systems."),span("JD-3","JD","Mining operations experience."),span("EL-1","ELICIT-session-1","I have done the reporting work.")],
  evidence:[atom("A-DIRECT","CV-1","managed","regional finance"),atom("A-TRANSFER","CV-2","worked","adjacent systems"),atom("A-CONTRA","CV-3","manage","mining operations","NEGATED"),{...atom("ELICIT-ATOM-EL-GAP","EL-1","did not have","mining operations","NEGATED"),provenance:{source_type:"CANDIDATE_ELICITED" as const,language:"en",extraction_method:"LLM" as const},assertion:{type:"ELICITED" as const,polarity:"NEGATED" as const}}],
  requirements:[
   {id:"R-DIRECT",source_span_id:"JD-1",normalized_requirement:"Manage regional finance",category:"RESPONSIBILITY",salience:"CORE",facets:[{id:"F-DIRECT",type:"FUNCTION",requirement:"Manage regional finance",source_span_id:"JD-1"}],extraction_confidence:1},
   {id:"R-TRANSFER",source_span_id:"JD-2",normalized_requirement:"Use target systems",category:"RESPONSIBILITY",salience:"CORE",facets:[{id:"F-TRANSFER",type:"TOOL_METHOD",requirement:"Use target systems",source_span_id:"JD-2"}],extraction_confidence:1},
   {id:"R-GAP",source_span_id:"JD-3",normalized_requirement:"Mining operations experience",category:"RESPONSIBILITY",salience:"CORE",facets:[{id:"F-GAP",type:"CONTEXT",requirement:"Mining operations experience",source_span_id:"JD-3"}],extraction_confidence:1}
  ],
  support_judgments:[
   {id:"SJ-DIRECT",requirement_id:"R-DIRECT",facet_id:"F-DIRECT",status:"DIRECT",supporting_evidence_ids:["A-DIRECT"],rationale:"Direct.",confidence:1,abstained:false,support_basis:"DOCUMENTED"},
   {id:"SJ-TRANSFER",requirement_id:"R-TRANSFER",facet_id:"F-TRANSFER",status:"ANALOGICAL_TRANSFER",supporting_evidence_ids:["A-TRANSFER"],rationale:"Adjacent.",confidence:.7,abstained:false,support_basis:"DOCUMENTED",analogical_mapping:{shared_dimensions:["systems"],unshared_dimensions:["target"]}},
   {id:"SJ-GAP",requirement_id:"R-GAP",facet_id:"F-GAP",status:"CONTRADICTORY",supporting_evidence_ids:["A-CONTRA"],rationale:"Negated.",confidence:.9,abstained:false,support_basis:"DOCUMENTED"}
  ],
  requirement_statuses:[{requirement_id:"R-DIRECT",status:"SUPPORTED"},{requirement_id:"R-TRANSFER",status:"PARTIAL"},{requirement_id:"R-GAP",status:"CONTRADICTED"}],
  unresolved_items:[{id:"U-GAP",requirement_id:"R-GAP",facet_ids:["F-GAP"],type:"CONFLICTING",supporting_evidence_ids:[],contradiction_evidence_ids:["A-CONTRA"],absence_basis:"EXPLICIT_CONTRADICTION",negation_evidence_ids:["A-CONTRA"]}],
  candidate_elicitations:[],
  demonstration_objectives:[]
 };
}
function full(l:EvidenceLedger) {
 l.demonstration_objectives=[{
  id:"OBJ-GAP",target_unresolved_item_id:"U-GAP",observable_cue:"State the boundary honestly.",supporting_true_atom_ids:[],
  truthfulness_boundary:{permitted_claims:["State source facts."],prohibited_claims:["Do not claim mining experience."]},
  candidate_gap_classification:"EXPERIENCE_GAP",probe_family:"CONTEXT"
 }];
 l.candidate_elicitations=[{id:"EL-GAP",unresolved_item_id:"U-GAP",question:"Clarify experience.",answer:"I have done the reporting work.",answer_source_span_id:"EL-1",answer_assertion_type:"ELICITED",classification:"EXPERIENCE_GAP",classification_rationale:"Not the target experience."}];
 const reasoning=buildCanonicalReasoningProjection(l);
 const d2=buildFitGapProjection(reasoning); const d3=buildCanonicalEvidenceRoute(l); const d4=buildFitGapConsumerProjection(d2,d3,l);
 const d5=buildDemonstrationObjectiveConsumerProjection(d4,d2,d3,l);
 return {d2,d3,d4,d5};
}
test("D6 builds a deterministic bridge",()=>{const l=ledger();const {d2,d3,d4,d5}=full(l);const a=buildCanonicalStrategyBridgeProjection(d4,d2,d3,d5,l);const b=buildCanonicalStrategyBridgeProjection(d4,d2,d3,d5,l);assert.deepEqual(a,b);assert.equal(a.version,"d6-v1");assert.equal(a.requirements.length,3);});
test("D6 preserves exact provenance and truthfulness boundaries",()=>{const l=ledger();const {d2,d3,d4,d5}=full(l);const p=buildCanonicalStrategyBridgeProjection(d4,d2,d3,d5,l);const x=p.requirements.find(r=>r.requirement_id==="R-GAP")!;assert.equal(x.route_mode,"VERIFY_GAP");assert.equal(x.fit_state,"EXPERIENCE_GAP");assert.deepEqual(x.boundaries[0]?.prohibited_claims,["Do not claim mining experience."]);assert.equal(x.evidence[0]?.source_quote,"Did not manage mining operations.");});
test("D6 rejects cross-requirement evidence",()=>{const l=ledger();const {d2,d3,d4,d5}=full(l);const p=buildCanonicalStrategyBridgeProjection(d4,d2,d3,d5,l);p.requirements.find(r=>r.requirement_id==="R-GAP")!.evidence.push({evidence_id:"A-DIRECT",source_span_id:"CV-1",source_quote:"Managed regional finance.",support_status:"DIRECT"});const v=validateCanonicalStrategyBridgeProjection(p,d4,d2,d3,d5,l);assert.equal(v.valid,false);assert.match(v.errors.join(" | "),/requirement-local/i);});
test("D6 rejects tampered source quote",()=>{const l=ledger();const {d2,d3,d4,d5}=full(l);const p=buildCanonicalStrategyBridgeProjection(d4,d2,d3,d5,l);p.requirements[0]!.evidence[0]!.source_quote="Fabricated";const v=validateCanonicalStrategyBridgeProjection(p,d4,d2,d3,d5,l);assert.equal(v.valid,false);assert.match(v.errors.join(" | "),/source quote/i);});
test("D6 rejects invalid upstream D5",()=>{const l=ledger();const {d2,d3,d4,d5}=full(l);const bad=structuredClone(d5);bad.objectives[0]!.truthfulness_boundary.prohibited_claims=["Claim mining expertise."];assert.throws(()=>buildCanonicalStrategyBridgeProjection(d4,d2,d3,bad,l),/D5|boundaries|invalid/i);});
test("D6 keeps fit state separate from route mode",()=>{const l=ledger();const {d2,d3,d4,d5}=full(l);const p=buildCanonicalStrategyBridgeProjection(d4,d2,d3,d5,l);const x=p.requirements.find(r=>r.requirement_id==="R-TRANSFER")!;assert.equal(x.route_mode,"VERIFY_GAP");assert.equal(x.fit_state,"PARTIAL");});
\n\ntest("D6 maps every preparation state to exactly one strategy action",()=>{\n assert.equal(strategyActionFor("READY_TO_DEMONSTRATE"),"DEMONSTRATE");\n assert.equal(strategyActionFor("PREPARE_TRANSFER"),"POSITION_TRANSFER");\n assert.equal(strategyActionFor("VERIFY_BEFORE_INTERVIEW"),"VERIFY_GAP");\n assert.equal(strategyActionFor("PREPARE_PARTIAL"),"DEMONSTRATE_PARTIAL");\n assert.equal(strategyActionFor("DEFEND_BOUNDARY"),"DEFEND_BOUNDARY");\n assert.equal(strategyActionFor("ELICIT_AND_CLARIFY"),"ELICIT_AND_CLARIFY");\n});\n