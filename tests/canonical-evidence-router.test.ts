import test from "node:test";
import assert from "node:assert/strict";
import { buildCanonicalEvidenceRoute, validateCanonicalEvidenceRoute } from "@/lib/canonical-evidence-router";
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
  source_spans:[
   span("CV-1","CV","Managed regional finance."),span("CV-2","CV","Worked on adjacent reporting systems."),span("CV-3","CV","Did not manage mining operations."),
   span("JD-1","JD","Manage regional finance."),span("JD-2","JD","Use target reporting systems."),span("JD-3","JD","Mining operations experience."),span("EL-1","ELICIT-SESSION","I can explain the boundary.")
  ],
  evidence:[atom("A-DIRECT","CV-1","managed","regional finance"),atom("A-TRANSFER","CV-2","worked","adjacent reporting systems"),atom("A-CONTRADICT","CV-3","manage","mining operations","NEGATED")],
  requirements:[
   req("R-DIRECT","JD-1","Manage regional finance","FUNCTION"),req("R-TRANSFER","JD-2","Use target reporting systems","TOOL_METHOD"),req("R-GAP","JD-3","Mining operations experience","CONTEXT")
  ],
  support_judgments:[
   {id:"SJ-DIRECT",requirement_id:"R-DIRECT",facet_id:"F-R-DIRECT",status:"DIRECT",supporting_evidence_ids:["A-DIRECT"],rationale:"Direct.",confidence:1,abstained:false,support_basis:"DOCUMENTED"},
   {id:"SJ-TRANSFER",requirement_id:"R-TRANSFER",facet_id:"F-R-TRANSFER",status:"ANALOGICAL_TRANSFER",supporting_evidence_ids:["A-TRANSFER"],rationale:"Adjacent.",confidence:.7,abstained:false,support_basis:"DOCUMENTED",analogical_mapping:{shared_dimensions:["systems"],unshared_dimensions:["target environment"]}},
   {id:"SJ-GAP",requirement_id:"R-GAP",facet_id:"F-R-GAP",status:"CONTRADICTORY",supporting_evidence_ids:["A-CONTRADICT"],rationale:"Negated.",confidence:.95,abstained:false,support_basis:"DOCUMENTED"}
  ],
  requirement_statuses:[{requirement_id:"R-DIRECT",status:"SUPPORTED"},{requirement_id:"R-TRANSFER",status:"PARTIAL"},{requirement_id:"R-GAP",status:"CONTRADICTED"}],
  unresolved_items:[{id:"U-GAP",requirement_id:"R-GAP",facet_ids:["F-R-GAP"],type:"CONFLICTING",supporting_evidence_ids:[],contradiction_evidence_ids:["A-CONTRADICT"],absence_basis:"EXPLICIT_CONTRADICTION",negation_evidence_ids:["A-CONTRADICT"]}],
  candidate_elicitations:[{id:"EL-GAP",unresolved_item_id:"U-GAP",question:"Clarify the boundary.",answer:"I can explain the boundary.",answer_source_span_id:"EL-1",answer_assertion_type:"ELICITED"}],
  demonstration_objectives:[]
 };
}
test("D3 is deterministic and preserves mode boundaries",()=>{
 const a=buildCanonicalEvidenceRoute(fixture()),b=buildCanonicalEvidenceRoute(fixture());
 assert.deepEqual(a,b); assert.deepEqual(validateCanonicalEvidenceRoute(a, fixture()),{valid:true,errors:[]});
 assert.equal(a.requirements.find(x=>x.requirement_id==="R-DIRECT")?.mode,"DIRECT");
 assert.equal(a.requirements.find(x=>x.requirement_id==="R-TRANSFER")?.mode,"TRANSFERABLE");
 assert.equal(a.requirements.find(x=>x.requirement_id==="R-GAP")?.mode,"VERIFY_GAP");
});
test("D3 preserves exact provenance and cannot see an absent fact",()=>{
 const r=buildCanonicalEvidenceRoute(fixture()),x=r.requirements.find(x=>x.requirement_id==="R-DIRECT")!;
 assert.deepEqual(x.candidates.map(c=>c.evidence_id),["A-DIRECT"]);
 assert.equal(x.candidates[0]?.source_quote,"Managed regional finance.");
 assert.equal(x.candidates.some(c=>c.evidence_id==="INJECTED-FACT"),false);
});
test("D3 fail-closes partial support instead of upgrading to DIRECT",()=>{
 const l=fixture(); l.support_judgments[0]!.status="PARTIAL"; l.requirement_statuses[0]!.status="PARTIAL";
 const x=buildCanonicalEvidenceRoute(l).requirements.find(x=>x.requirement_id==="R-DIRECT")!;
 assert.equal(x.mode,"VERIFY_GAP");
});
test("D3 preserves contradiction, elicitation and demonstration references",()=>{
 const l=fixture(); l.demonstration_objectives=[{id:"OBJ-GAP",target_unresolved_item_id:"U-GAP",observable_cue:"State boundary.",supporting_true_atom_ids:[],truthfulness_boundary:{permitted_claims:["State source facts."],prohibited_claims:["Do not claim mining experience."]}}];
 const r=buildCanonicalEvidenceRoute(l),u=r.unresolved_items[0]!;
 assert.equal(u.type,"CONFLICTING"); assert.deepEqual(u.contradiction_evidence.map(x=>x.evidence_id),["A-CONTRADICT"]);
 assert.equal(u.elicitation?.id,"EL-GAP"); assert.equal(r.demonstration_objectives[0]?.target_unresolved_item_id,"U-GAP");
});
test("D3 rejects dangling canonical evidence references",()=>{
 const l=fixture(); l.support_judgments[0]!.supporting_evidence_ids=["MISSING"];
 assert.throws(()=>buildCanonicalEvidenceRoute(l),/unknown evidence|invalid/i);
});


test("D3 keeps mixed direct and transferable facets in VERIFY_GAP",()=>{ const l=fixture(); l.requirements[0]!.facets.push({id:"F-R-DIRECT-2",type:"FUNCTION",requirement:"Another facet",source_span_id:"JD-1"}); l.support_judgments.push({id:"SJ-MIX",requirement_id:"R-DIRECT",facet_id:"F-R-DIRECT-2",status:"ANALOGICAL_TRANSFER",supporting_evidence_ids:["A-TRANSFER"],rationale:"Adjacent.",confidence:.6,abstained:false,support_basis:"DOCUMENTED",analogical_mapping:{shared_dimensions:["x"],unshared_dimensions:["y"]}}); l.requirement_statuses[0]!.status="PARTIAL"; const x=buildCanonicalEvidenceRoute(l).requirements.find(x=>x.requirement_id==="R-DIRECT")!; assert.equal(x.mode,"VERIFY_GAP"); });


test("D3 validator rejects TRANSFERABLE routes with mixed facet statuses", () => {
 const route = buildCanonicalEvidenceRoute(fixture());
 const transferable = route.requirements.find(x => x.requirement_id === "R-TRANSFER")!;
 const direct = route.requirements.find(x => x.requirement_id === "R-DIRECT")!.facets[0]!;
 transferable.mode = "TRANSFERABLE";
 transferable.facets.push({ ...direct, facet_id: "F-CROSS-MIXED" });
 const validation = validateCanonicalEvidenceRoute(route, fixture());
 assert.equal(validation.valid, false);
 assert.match(validation.errors.join(" | "), /TRANSFERABLE mode requires every facet to be ANALOGICAL_TRANSFER/);
});

test("D3 validator rejects cross-requirement candidate evidence references", () => {
 const route = buildCanonicalEvidenceRoute(fixture());
 const direct = route.requirements.find(x => x.requirement_id === "R-DIRECT")!;
 const transferable = route.requirements.find(x => x.requirement_id === "R-TRANSFER")!;
 transferable.candidates = [...direct.candidates];
 const validation = validateCanonicalEvidenceRoute(route, fixture());
 assert.equal(validation.valid, false);
 assert.match(validation.errors.join(" | "), /not owned by requirement: R-TRANSFER -> A-DIRECT/);
});

test("D3 builder output is accepted by its ledger-backed route validator", () => {
 const ledger = fixture();
 const route = buildCanonicalEvidenceRoute(ledger);
 const validation = validateCanonicalEvidenceRoute(route, ledger);
 assert.deepEqual(validation, { valid: true, errors: [] });
});

test("D3 validator rejects tampered source span and source quote", () => {
 const ledger = fixture();
 const route = buildCanonicalEvidenceRoute(ledger);
 const candidate = route.requirements.find(x => x.requirement_id === "R-DIRECT")!.candidates[0]!;
 candidate.source_span_id = "CV-2";
 let validation = validateCanonicalEvidenceRoute(route, ledger);
 assert.equal(validation.valid, false);
 assert.match(validation.errors.join(" | "), /source span does not match evidence/);

 const freshLedger = fixture();
 const fresh = buildCanonicalEvidenceRoute(freshLedger);
 const freshCandidate = fresh.requirements.find(x => x.requirement_id === "R-DIRECT")!.candidates[0]!;
 freshCandidate.source_quote = "Fabricated quote.";
 validation = validateCanonicalEvidenceRoute(fresh, freshLedger);
 assert.equal(validation.valid, false);
 assert.match(validation.errors.join(" | "), /source quote does not match source span/);
});

test("D3 validator rejects cross-requirement unresolved, elicitation and objective summary IDs", () => {
 const ledger = fixture();
 ledger.candidate_elicitations.push({
   id:"EL-GAP-2",
   unresolved_item_id:"U-GAP",
   question:"Provide one more boundary example.",
   answer:"A second elicited answer.",
   answer_source_span_id:"EL-1",
   answer_assertion_type:"ELICITED"
 });
 ledger.demonstration_objectives = [{
   id:"OBJ-GAP",
   target_unresolved_item_id:"U-GAP",
   observable_cue:"State boundary.",
   supporting_true_atom_ids:[],
   truthfulness_boundary:{permitted_claims:["State source facts."], prohibited_claims:["Do not claim mining experience."]}
 }];
 const route = buildCanonicalEvidenceRoute(ledger);
 const direct = route.requirements.find(x => x.requirement_id === "R-DIRECT")!;
 const gap = route.requirements.find(x => x.requirement_id === "R-GAP")!;
 direct.unresolved_item_ids = [...gap.unresolved_item_ids];
 direct.elicitation_ids = [...gap.elicitation_ids];
 direct.demonstration_objective_ids = ["OBJ-GAP"];
 const validation = validateCanonicalEvidenceRoute(route, ledger);
 assert.equal(validation.valid, false);
 assert.match(validation.errors.join(" | "), /another requirement|not owned|unresolved item|objective/i);
});

test("D3 validator rejects VERIFY_GAP when the underlying route is fully DIRECT", () => {
 const ledger = fixture();
 const route = buildCanonicalEvidenceRoute(ledger);
 const direct = route.requirements.find(x => x.requirement_id === "R-DIRECT")!;
 direct.mode = "VERIFY_GAP";
 const validation = validateCanonicalEvidenceRoute(route, ledger);
 assert.equal(validation.valid, false);
 assert.match(validation.errors.join(" | "), /mode does not match/);
});

test("D3 candidate set preserves contradiction evidence from unresolved items", () => {
 const route = buildCanonicalEvidenceRoute(fixture());
 const gap = route.requirements.find(x => x.requirement_id === "R-GAP")!;
 assert.ok(gap.candidates.some(c => c.evidence_id === "A-CONTRADICT" && c.support_status === "CONTRADICTORY"));
});


test("D3 validator rejects incomplete per-requirement summary arrays", () => {
 const ledger = fixture();
 ledger.demonstration_objectives = [{
   id:"OBJ-GAP",
   target_unresolved_item_id:"U-GAP",
   observable_cue:"State boundary.",
   supporting_true_atom_ids:[],
   truthfulness_boundary:{permitted_claims:["State source facts."], prohibited_claims:["Do not claim mining experience."]}
 }];
 const route = buildCanonicalEvidenceRoute(ledger);
 const gap = route.requirements.find(x => x.requirement_id === "R-GAP")!;

 for (const field of ["unresolved_item_ids", "elicitation_ids", "demonstration_objective_ids"] as const) {
   const tampered = structuredClone(route);
   const target = tampered.requirements.find(x => x.requirement_id === "R-GAP")!;
   target[field] = [];
   const validation = validateCanonicalEvidenceRoute(tampered, ledger);
   assert.equal(validation.valid, false, field);
   assert.match(validation.errors.join(" | "), new RegExp(field));
 }
 assert.deepEqual(gap.unresolved_item_ids, ["U-GAP"]);
 assert.deepEqual(gap.elicitation_ids, ["EL-GAP"]);
 assert.deepEqual(gap.demonstration_objective_ids, ["OBJ-GAP"]);
});

test("D3 candidate routing preserves both direct and contradictory classifications for one evidence atom", () => {
 const ledger = fixture();
 ledger.requirement_statuses[0]!.status = "PARTIAL";
 ledger.unresolved_items.push({
   id:"U-DIRECT-CONTRADICTION",
   requirement_id:"R-DIRECT",
   facet_ids:["F-R-DIRECT"],
   type:"CONFLICTING",
   supporting_evidence_ids:[],
   contradiction_evidence_ids:["A-DIRECT"],
   absence_basis:"CONFLICTING_SOURCES",
   negation_evidence_ids:[]
 });
 const route = buildCanonicalEvidenceRoute(ledger);
 const direct = route.requirements.find(x => x.requirement_id === "R-DIRECT")!;
 const statuses = direct.candidates
   .filter(candidate => candidate.evidence_id === "A-DIRECT")
   .map(candidate => candidate.support_status)
   .sort();
 assert.deepEqual(statuses, ["CONTRADICTORY", "DIRECT"]);
});


test("D3 builder preserves all elicitations for a requirement-local unresolved item", () => {
 const ledger = fixture();
 ledger.candidate_elicitations.push({
   id:"EL-GAP-2",
   unresolved_item_id:"U-GAP",
   question:"Provide one more boundary example.",
   answer:"A second elicited answer.",
   answer_source_span_id:"EL-1",
   answer_assertion_type:"ELICITED"
 });
 const route = buildCanonicalEvidenceRoute(ledger);
 const gap = route.requirements.find(x => x.requirement_id === "R-GAP")!;
 assert.deepEqual(gap.elicitation_ids, ["EL-GAP", "EL-GAP-2"]);
 assert.deepEqual(validateCanonicalEvidenceRoute(route, ledger), { valid:true, errors:[] });
});
