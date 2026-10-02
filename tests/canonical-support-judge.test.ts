import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeJudgments, buildSupportJudgeEvidence, buildSupportJudgeSchema } from "../src/lib/canonical-support-judge.ts";
import type { EvidenceLedger, Requirement, SupportJudgment } from "../src/lib/canonical-evidence-model.ts";

const requirement: Requirement = {
  id: "REQ-1", source_span_id: "S-REQ", normalized_requirement: "Manage finance", category: "CAPABILITY", salience: "CORE",
  facets: [{ id: "F-1", type: "FUNCTION", requirement: "Manage finance", source_span_id: "S-REQ" }], extraction_confidence: 1,
};

function ledger(): EvidenceLedger {
  return {
    source_spans: [
      { id: "S-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "S-REQ", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [{
      id: "A1", source_span_id: "S-A1",
      provenance: { source_type: "CV", language: "en", extraction_method: "LLM" },
      subject: { actor: "candidate", ownership: "INDIVIDUAL" },
      action: { normalized_action: "managed", object: "finance" },
      context: {}, scale: {}, time: {}, outcome: null,
      assertion: { type: "STATED", polarity: "AFFIRMATIVE" },
      verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false },
      extraction_confidence: 1,
    }],
    requirements: [requirement], support_judgments: [],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "UNRESOLVED" }],
    unresolved_items: [], candidate_elicitations: [], demonstration_objectives: [],
  };
}

function raw(status: SupportJudgment["status"], ids: string[] = []): any {
  return {
    id: "SJ-1", requirement_id: "REQ-1", facet_id: "F-1", status, supporting_evidence_ids: ids,
    rationale: "test", confidence: 1, abstained: false, support_basis: "DOCUMENTED",
    context_evidence_ids: [], relational: false, relationship_connector: null, licensing_spans: [],
    analogical_mapping: null, abstention_reason: null,
  };
}

test("judge sanitizer reports positive judgment without evidence as a hard error", () => {
  const result = sanitizeJudgments([raw("DIRECT")], ledger());
  assert.ok(result.errors.some(error => error.includes("positive status without cited evidence")));
});

test("judge sanitizer preserves valid documented direct support", () => {
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], ledger());
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
  assert.equal(result.judgments[0].support_basis, "DOCUMENTED");
});


test("judge sanitizer fills a missing facet with fail-closed abstained NONE", () => {
  const l = ledger();
  l.requirements[0].facets.push({
    id: "F-2", type: "SCOPE", requirement: "Regional scope", source_span_id: "S-REQ",
  });
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  const missing = result.judgments.find((judgment) => judgment.facet_id === "F-2");
  assert.ok(missing);
  assert.equal(missing.status, "NONE");
  assert.equal(missing.abstained, true);
  assert.deepEqual(missing.supporting_evidence_ids, []);
  assert.equal(missing.confidence, 0);
});


test("support judge input labels documented and elicited atoms without rewriting quotes", () => {
  const l = ledger();
  l.evidence.push({ ...l.evidence[0], id: "A2", provenance: {
    ...l.evidence[0].provenance, source_type: "CANDIDATE_ELICITED",
  } });
  const atoms = buildSupportJudgeEvidence(l);
  assert.equal(atoms[0].source_type, "CV");
  assert.equal(atoms[0].support_basis, "DOCUMENTED");
  assert.equal(atoms[1].source_type, "CANDIDATE_ELICITED");
  assert.equal(atoms[1].support_basis, "CANDIDATE_SELF_REPORTED");
  assert.equal(atoms[1].source_quote, l.source_spans[0].text);
});

test("mixed-basis support still fails closed rather than gaining documented support", () => {
  const l = ledger();
  l.evidence.push({ ...l.evidence[0], id: "A2", provenance: {
    ...l.evidence[0].provenance, source_type: "CANDIDATE_ELICITED",
  } });
  const result = sanitizeJudgments([raw("PARTIAL", ["A1", "A2"])], l);
  assert.ok(result.errors.some(error => error.includes("mixed documented and elicited")));
  assert.equal(result.judgments[0].status, "NONE");
  assert.deepEqual(result.judgments[0].supporting_evidence_ids, []);
});


import Ajv from "ajv";

test("support response grammar admits single-basis support and abstention, rejects mixed and forged citations", () => {
  const l=ledger();
  l.evidence.push({...structuredClone(l.evidence[0]),id:"A2",provenance:{...l.evidence[0].provenance,source_type:"CANDIDATE_ELICITED"}});
  const validate=new Ajv().compile(buildSupportJudgeSchema(l));
  const check=(j:any)=>validate({judgments:[j]});
  assert.equal(check(raw("DIRECT",["A1"])),true);
  assert.equal(check({...raw("PARTIAL",["A2"]),support_basis:"CANDIDATE_SELF_REPORTED"}),true);
  assert.equal(check({...raw("NONE"),abstained:true}),true);
  for(const basis of ["DOCUMENTED","CANDIDATE_SELF_REPORTED"]){
    assert.equal(check({...raw("PARTIAL",["A1","A2"]),support_basis:basis}),false);
  }
  assert.equal(check({...raw("DIRECT",["A2"]),support_basis:"CANDIDATE_SELF_REPORTED"}),false);
  assert.equal(check(raw("PARTIAL",["FORGED"])),false);
  assert.equal(check(raw("PARTIAL",[])),false);
  assert.equal(check({...raw("NONE",["A1"]),abstained:true}),false);
});

test("response grammar handles documented-only, elicited-only and empty ledgers without invented IDs",()=>{
 for(const mode of ["documented","elicited","empty"]){
  const l=ledger();
  if(mode==="elicited")l.evidence[0].provenance.source_type="CANDIDATE_ELICITED";
  if(mode==="empty")l.evidence=[];
  const validate=new Ajv().compile(buildSupportJudgeSchema(l));
  assert.equal(validate({judgments:[{...raw("NONE"),abstained:true}]}),true);
  assert.equal(validate({judgments:[raw("DIRECT",["A1"])]}),mode==="documented");
  assert.equal(validate({judgments:[{...raw("PARTIAL",["A1"]),support_basis:"CANDIDATE_SELF_REPORTED"}]}),mode==="elicited");
 }
});


test("relational DIRECT rejects composition of separately documented activities", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared forecasts", start_offset: 0, end_offset: 18, language: "en" };
  l.source_spans.push({ id: "S-A2", document_id: "CV", text: "Introduced pipeline reviews", start_offset: 19, end_offset: 46, language: "en" });
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "prepared", object: "forecasts" } };
  l.evidence.push({ ...structuredClone(l.evidence[0]), id: "A2", source_span_id: "S-A2", action: { normalized_action: "introduced", object: "pipeline reviews" } });
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = {
    ...raw("DIRECT", ["A1", "A2"]),
    relational: true,
    relationship_connector: "input to",
    licensing_spans: ["Prepared forecasts", "Introduced pipeline reviews"],
  };
  const result = sanitizeJudgments([judgment], l);
  assert.ok(result.errors.some(error => error.includes("independent activities cannot be composed")));
});

test("relational DIRECT accepts an exact single-atom licensing span", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Used forecasts as input to pipeline reviews", start_offset: 0, end_offset: 43, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "used", object: "forecasts as input to pipeline reviews" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = {
    ...raw("DIRECT", ["A1"]),
    relational: true,
    relationship_connector: "input to",
    licensing_spans: ["forecasts as input to pipeline reviews"],
  };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});

test("relational classifier is enforced independently of the model declaration", () => {
  const l = ledger();
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([raw("PARTIAL", ["A1"])], l);
  assert.ok(result.errors.some(error => error.includes("relational classification")));
});

test("rationale cannot explicitly invoke an uncited evidence ID", () => {
  const l = ledger();
  l.evidence.push({ ...structuredClone(l.evidence[0]), id: "A2" });
  const judgment = { ...raw("PARTIAL", ["A1"]), rationale: "A2 establishes the missing relationship." };
  const result = sanitizeJudgments([judgment], l);
  assert.ok(result.errors.some(error => error.includes("outside the minimal supporting subset")));
});

test("rationale cannot borrow a distinctive phrase from uncited evidence", () => {
  const l = ledger();
  l.source_spans.push({ id: "S-A2", document_id: "CV", text: "Forecasts directly shaped quarterly pipeline review decisions", start_offset: 18, end_offset: 75, language: "en" });
  l.evidence.push({ ...structuredClone(l.evidence[0]), id: "A2", source_span_id: "S-A2" });
  const judgment = { ...raw("PARTIAL", ["A1"]), rationale: "Forecasts directly shaped quarterly pipeline review decisions." };
  const result = sanitizeJudgments([judgment], l);
  assert.ok(result.errors.some(error => error.includes("distinctive phrase")));
});

test("minimal support and optional context IDs must remain disjoint", () => {
  const l = ledger();
  const judgment = { ...raw("PARTIAL", ["A1"]), context_evidence_ids: ["A1"] };
  const result = sanitizeJudgments([judgment], l);
  assert.ok(result.errors.some(error => error.includes("must be disjoint")));
});
