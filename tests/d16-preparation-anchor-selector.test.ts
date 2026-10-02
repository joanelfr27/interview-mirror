import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { selectD16PreparationAnchors, validateD16AnchorChoices, D16_SELECTOR_MODEL, type D16AnchorSelectorInput } from "@/lib/d16-preparation-anchor-selector";
import { buildD16PreparationActions, buildD16DependencySnapshot, type D16PreparationInputs } from "@/lib/d16-personalized-interview-strategy";
const saved=JSON.parse(readFileSync("tests/fixtures/d16-assembled-gold-inputs.json","utf8")) as {case_inputs:Array<{input:D16PreparationInputs}>};
function fixture():D16AnchorSelectorInput {const f=structuredClone(saved.case_inputs[0].input);return {canonical:f.canonical,accepted_relationships:[],language:"en"};}
function choice(input:D16AnchorSelectorInput,ids:string[]=[]){return {decisions:[{requirement_id:input.canonical.canonical_requirements[0].id,evidence:ids.map(id=>({id,reason:"Accounting preparation context; no standard is established."})),relationships:[],reason:ids.length?"Use documented accounting tasks as preparation context.":"No usable relevant context."}]};}
describe("D16 constrained contextual-anchor selector",()=>{
 it("chooses canonical context without adding role proof or mutating inputs",async()=>{
  const input=fixture(),before=JSON.stringify(input);
  const ids=saved.case_inputs[0].input.selections[0].preparation_evidence_ids;
  const result=await selectD16PreparationAnchors(input,async()=>({model:D16_SELECTOR_MODEL,content:JSON.stringify(choice(input,ids))}));
  const actions=buildD16PreparationActions(result.preparation);
  assert.equal(actions[0].personalization,"AUTOMATIC_CONTEXTUAL_ANCHORS");
  assert.equal(actions[0].requirement_proof_refs.length,0);
  assert.equal(actions[0].canonical_status,"UNRESOLVED");
  assert.equal(JSON.stringify(input),before);
  assert.equal(result.record.semantic_relevance,"PENDING_CONTENT_REVIEW");
 });
 it("accepts an explicit no-anchor decision without making a personalization claim",async()=>{
  const input=fixture();
  const r=await selectD16PreparationAnchors(input,async()=>({model:D16_SELECTOR_MODEL,content:JSON.stringify(choice(input))}));
  assert.equal(buildD16PreparationActions(r.preparation)[0].personalization,"NO_RELEVANT_ANCHOR");
 });
 it("rejects forged IDs, duplicate choices, extra proof fields, and invented tensions",()=>{
  const input=fixture();
  assert.throws(()=>validateD16AnchorChoices(choice(input,["FORGED"]),input),/Forged/);
  const id=input.canonical.ledger.evidence[0].id;
  assert.throws(()=>validateD16AnchorChoices(choice(input,[id,id]),input),/duplicate/);
  const extra=choice(input);Object.assign(extra.decisions[0],{support_status:"DIRECT"});
  assert.throws(()=>validateD16AnchorChoices(extra,input),/Unknown/);
  const invented=choice(input);invented.decisions[0].requirement_id="NEW";
  assert.throws(()=>validateD16AnchorChoices(invented,input),/Unknown/);
  assert.throws(()=>validateD16AnchorChoices({decisions:[]},input),/Missing/);
 });
 it("refuses wrong models and mid-call input mutation",async()=>{
  const input=fixture();
  await assert.rejects(()=>selectD16PreparationAnchors(input,async()=>({model:"gpt-4o-mini",content:JSON.stringify(choice(input))})),/model/);
  await assert.rejects(()=>selectD16PreparationAnchors(input,async()=>{
   input.language="fr";return {model:D16_SELECTOR_MODEL,content:JSON.stringify(choice(input))};
  }),/changed during selection/);
 });
 it("fails before a call on forged canonical status or stale JD",async()=>{
  const input=fixture();let calls=0;
  input.canonical.bridge.requirements[0].status="SUPPORTED";
  await assert.rejects(()=>selectD16PreparationAnchors(input,async()=>{calls++;throw Error("Should not call");}),/stale or forged/);
  assert.equal(calls,0);
  const stale=fixture();stale.canonical.jd_fingerprint="changed";
  await assert.rejects(()=>selectD16PreparationAnchors(stale,async()=>{calls++;throw Error("Should not call");}),/stale/);
  assert.equal(calls,0);
 });
 it("retains zero-tension state without a model call",async()=>{
  const input=fixture();
  input.canonical.ledger.requirements=[];input.canonical.ledger.requirement_statuses=[];
  input.canonical.ledger.support_judgments=[];input.canonical.ledger.unresolved_items=[];
  input.canonical.ledger.candidate_elicitations=[];input.canonical.ledger.demonstration_objectives=[];
  const {projectD16CanonicalLedger}=await import("@/lib/d16-shadow-runtime-integration");
  const p=projectD16CanonicalLedger(input.canonical.ledger);
  input.canonical.bridge=p.d6;input.canonical.mirror=p.d15;
  input.canonical.canonical_requirements=[];input.canonical.role_capability_model.requirements=[];
  input.canonical.dependency_snapshot=buildD16DependencySnapshot(input.canonical);
  let calls=0;
  const r=await selectD16PreparationAnchors(input,async()=>{calls++;throw Error("Should not call");});
  assert.equal(calls,0);assert.deepEqual(buildD16PreparationActions(r.preparation),[]);
  assert.equal(r.record.semantic_relevance,"NOT_EVALUATED_ZERO_TENSIONS");
 });
});

import { attachD16DevelopmentRole } from "@/lib/d16-development-role-fixtures";
import { aggregateRequirementStatus, buildUnresolvedItems, type EvidenceLedger } from "@/lib/canonical-evidence-model";
import { sanitizeJudgments } from "@/lib/canonical-support-judge";
import { attachDemonstrationObjectives } from "@/lib/demonstration-objectives";
import { projectD16CanonicalLedger } from "@/lib/d16-shadow-runtime-integration";
import { buildD16Strategy } from "@/lib/d16-personalized-interview-strategy";
import type { D15BVerifiedThread } from "@/lib/d15-semantic-thread-engine";
const loops=JSON.parse(readFileSync("tests/fixtures/d16-d15-confirmed-loop.json","utf8")) as {cases:Array<{language:"en"|"fr";ledger:EvidenceLedger;accepted_relationships:D15BVerifiedThread[]}>};
function noJDFixture(index=0):D16AnchorSelectorInput {
 const c=structuredClone(loops.cases[index]);let ledger=attachD16DevelopmentRole(c.ledger,c.language);
 // Deliberately conservative synthetic NONE controls, never reported as a runtime model result.
 const raw=ledger.requirements.flatMap(r=>r.facets.map(f=>({id:"J-"+f.id,requirement_id:r.id,facet_id:f.id,status:"NONE" as const,supporting_evidence_ids:[],rationale:"Synthetic unresolved control; no role proof granted.",confidence:0,abstained:true,abstention_reason:"Development control",support_basis:"DOCUMENTED" as const})));
 const judged=sanitizeJudgments(raw,ledger);assert.deepEqual(judged.errors,[]);
 ledger={...ledger,support_judgments:judged.judgments,requirement_statuses:ledger.requirements.map(r=>({requirement_id:r.id,status:aggregateRequirementStatus(r,judged.judgments)}))};
 ledger.unresolved_items=buildUnresolvedItems(ledger);ledger=attachDemonstrationObjectives(ledger).ledger;
 const p=projectD16CanonicalLedger(ledger);
 const canonical={...fixture().canonical,ledger:p.ledger,mirror:p.d15,bridge:p.d6,canonical_requirements:ledger.requirements.map(r=>({id:r.id,normalized_requirement:r.normalized_requirement})),role_capability_model:{...fixture().canonical.role_capability_model,requirements:ledger.requirements.map(r=>({capability_id:"CAP-"+r.id,normalized_requirement:r.normalized_requirement,canonical_requirement_id:r.id,baseline_criticality:(["ROLE-FORECAST","ROLE-LAUNCH"].includes(r.id)?"CRITICAL":"IMPORTANT") as "CRITICAL"|"IMPORTANT",source:{source_type:"ADMIN_CURATED" as const,source_id:"synthetic-control",source_version:"1"}}))},jd_present:false,jd_fingerprint:null};
 canonical.dependency_snapshot=buildD16DependencySnapshot(canonical);
 return {canonical,language:c.language,accepted_relationships:c.accepted_relationships};
}
it("consumes the actual saved single-answer D15 relationship without granting any requirement proof, EN and FR",async()=>{
 for(const index of [0,1]){
  const input=noJDFixture(index),strategy=buildD16Strategy(input.canonical);
  assert.equal(strategy.tensions.length,3);assert.equal(input.canonical.bridge.requirements.length,5);
  assert.equal(strategy.tensions[0].role_criticality,"CRITICAL");
  const decisions=strategy.tensions.map(t=>({requirement_id:t.requirement_id,evidence:[],relationships:t.requirement_id==="ROLE-FORECAST"?[{id:input.accepted_relationships[0].id,reason:"Confirmed use of forecasts in review, scope still unproved."}]:[],reason:"Synthetic response exercising references and absence, not model selection quality."}));
  const r=await selectD16PreparationAnchors(input,async()=>({model:D16_SELECTOR_MODEL,content:JSON.stringify({decisions})}));
  const actions=buildD16PreparationActions(r.preparation),linked=actions.filter(a=>a.d15_thread_refs.length);
  assert.equal(linked.length,2);
  for(const a of linked){
   assert.equal(a.canonical_status,"UNRESOLVED");assert.deepEqual(a.requirement_proof_refs,[]);
   assert.equal(a.preparation_anchor_refs[0].source_type,"CANDIDATE_ELICITED");
   assert.equal(a.language,input.language);
   assert.match(a.instruction,input.language==="fr"?/Déclaration du candidat/:/Candidate self-report/);
   assert.doesNotMatch(a.instruction,/EMERGING_PATTERN/);
  }
 }
});
it("reused canonical evidence stays local to each requirement and never multiplies support units",async()=>{
 const input=noJDFixture();const id=input.accepted_relationships[0].evidence_ids[0];
 const decisions=buildD16Strategy(input.canonical).tensions.map(t=>({requirement_id:t.requirement_id,evidence:[{id,reason:"Synthetic reference-reuse control; relevance remains unevaluated."}],relationships:[],reason:"Structural reuse control."}));
 const r=await selectD16PreparationAnchors(input,async()=>({model:D16_SELECTOR_MODEL,content:JSON.stringify({decisions})}));
 for(const a of buildD16PreparationActions(r.preparation)){assert.equal(a.preparation_anchor_refs.length,1);assert.deepEqual(a.requirement_proof_refs,[]);}
 assert.equal(input.accepted_relationships[0].relationship_support_unit_count,1);
});
it("rejects stale D15 licenses, unresolved or denied relationship IDs before selection",async()=>{
 const input=noJDFixture();let calls=0;
 input.accepted_relationships[0].gs_decision!.G.licensing_spans[0].text="A changed source license";
 await assert.rejects(()=>selectD16PreparationAnchors(input,async()=>{calls++;throw Error("Unexpected call");}),/Unvalidated/);
 assert.equal(calls,0);
 const clean=noJDFixture(),decisions=buildD16Strategy(clean.canonical).tensions.map(t=>({requirement_id:t.requirement_id,evidence:[],relationships:[{id:"DENIED",reason:"Invalid reference"}],reason:"Control"}));
 assert.throws(()=>validateD16AnchorChoices({decisions},clean),/Forged/);
});
it("changed CV, role, context or language invalidates the saved automatic actions",async()=>{
 const input=fixture();const r=await selectD16PreparationAnchors(input,async()=>({model:D16_SELECTOR_MODEL,content:JSON.stringify(choice(input))}));
 for(const mutate of [
  (x:D16PreparationInputs)=>{x.canonical.ledger.source_spans[0].text+=" changed";},
  (x:D16PreparationInputs)=>{x.canonical.role_capability_model.requirements[0].source.source_version="2";},
  (x:D16PreparationInputs)=>{x.canonical.assessment_context={version:"assessment-context-v1",context_id:"NEW",requirement_relevance:{}};},
  (x:D16PreparationInputs)=>{x.language="fr";}
 ]){const copy=structuredClone(r.preparation);mutate(copy);assert.throws(()=>buildD16PreparationActions(copy),/Stale/);}
});

import { clarificationKey, clarificationSourceQuotes } from "@/lib/d15-clarification-state";
it("a later remembered denial vetoes an otherwise positive cached D15 relationship",async()=>{
 const input=noJDFixture(),t=input.accepted_relationships[0],p=t.gs_decision!.asserted_proposition;
 input.canonical.ledger.mirror_clarifications=[{key:clarificationKey(input.canonical.ledger,t.evidence_ids,p,input.language),headline:t.headline,asserted_proposition:p,language:input.language,source_quotes:clarificationSourceQuotes(input.canonical.ledger,t.evidence_ids),status:"DENIED",responses:[],follow_up_issued:false}];
 let calls=0;await assert.rejects(()=>selectD16PreparationAnchors(input,async()=>{calls++;throw Error("Unexpected call");}),/Unvalidated/);
 assert.equal(calls,0);
});
it("an emerging accepted thread is not relabeled as conversational confirmation",async()=>{
 const input=noJDFixture();input.accepted_relationships[0].maturity="EMERGING_PATTERN";
 const decisions=buildD16Strategy(input.canonical).tensions.map(t=>({requirement_id:t.requirement_id,evidence:[],relationships:t.requirement_id==="ROLE-FORECAST"?[{id:input.accepted_relationships[0].id,reason:"Synthetic maturity-label control"}]:[],reason:"Control"}));
 const r=await selectD16PreparationAnchors(input,async()=>({model:D16_SELECTOR_MODEL,content:JSON.stringify({decisions})}));
 const a=buildD16PreparationActions(r.preparation).find(a=>a.d15_thread_refs.length)!;
 assert.match(a.instruction,/Accepted relationship/);assert.doesNotMatch(a.instruction,/Confirmed relationship/);
});
it("agentless or negated citations are never eligible automatic anchors",()=>{
 const input=noJDFixture();const id=input.canonical.ledger.evidence[0].id;
 input.canonical.ledger.evidence[0].subject={actor:"unspecified",actor_basis:"UNSPECIFIED",ownership:"UNKNOWN"};
 const p=projectD16CanonicalLedger(input.canonical.ledger);input.canonical.mirror=p.d15;input.canonical.bridge=p.d6;input.canonical.dependency_snapshot=buildD16DependencySnapshot(input.canonical);
 const decisions=buildD16Strategy(input.canonical).tensions.map(t=>({requirement_id:t.requirement_id,evidence:[{id,reason:"Ineligible control"}],relationships:[],reason:"Control"}));
 assert.throws(()=>validateD16AnchorChoices({decisions},input),/Forged\/ineligible/);
});
it("a forged positive G flag cannot bypass the existing chronology-only licensing veto",async()=>{
 const input=noJDFixture(),t=input.accepted_relationships[0],id=t.evidence_ids[0];
 const atom=input.canonical.ledger.evidence.find(a=>a.id===id)!,span=input.canonical.ledger.source_spans.find(s=>s.id===atom.source_span_id)!;
 span.text+=" After that review.";span.end_offset=span.start_offset+span.text.length;
 const p=projectD16CanonicalLedger(input.canonical.ledger);input.canonical.mirror=p.d15;input.canonical.bridge=p.d6;input.canonical.dependency_snapshot=buildD16DependencySnapshot(input.canonical);
 t.gs_decision!.G.connector="causal response";t.gs_decision!.G.licensing_spans=[{evidence_id:id,text:"After that review."}];t.gs_decision!.vetoes=[];t.gs_decision!.accepted=true;
 let calls=0;await assert.rejects(()=>selectD16PreparationAnchors(input,async()=>{calls++;throw Error("Unexpected call");}),/Unvalidated/);assert.equal(calls,0);
});
it("an elicited source marked as a responsibility cannot bypass D15 eligibility",async()=>{
 const input=noJDFixture(),id=input.accepted_relationships[0].evidence_ids[0];
 input.canonical.ledger.evidence.find(a=>a.id===id)!.assertion.type="RESPONSIBILITY";
 const p=projectD16CanonicalLedger(input.canonical.ledger);input.canonical.mirror=p.d15;input.canonical.bridge=p.d6;input.canonical.dependency_snapshot=buildD16DependencySnapshot(input.canonical);
 let calls=0;await assert.rejects(()=>selectD16PreparationAnchors(input,async()=>{calls++;throw Error("Unexpected call");}),/Mirror provenance mismatch/);assert.equal(calls,0);
});
