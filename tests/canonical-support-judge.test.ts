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
    context_evidence_ids: [], relationship_connector: null, licensing_spans: [],
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


test("summary/profile evidence cannot independently establish DIRECT support", () => {
  const l = ledger();
  l.source_spans[0] = { ...l.source_spans[0], source_section: "SUMMARY_OR_PROFILE" };
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
  assert.ok(result.judgments[0].rationale.includes("Summary/profile assertions"));
});

test("generic MBA does not directly satisfy Finance/Accounting-specific Master's requirement", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "MBA in Global Business & Management Studies", start_offset: 0, end_offset: 43, language: "en" };
  l.evidence[0] = {
    ...l.evidence[0],
    source_span_id: "S-A1",
    action: { normalized_action: "MBA", object: "Global Business & Management Studies" },
    assertion: { type: "CREDENTIAL", polarity: "AFFIRMATIVE" },
  };
  l.requirements[0].facets = [{
    id: "F-1", type: "LEVEL",
    requirement: "Master's degree in Finance or Accounting is strongly preferred",
    source_span_id: "S-REQ",
  }];
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
  assert.ok(result.judgments[0].rationale.includes("required Finance or Accounting specialization"));
});


test("specificity freeze: EDF domain-specific tenure is not DIRECT from generic finance tenure", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Finance leader with over 13 years of multinational experience.", start_offset: 0, end_offset: 62, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "worked", object: "finance for over 13 years" } };
  l.requirements[0].facets = [{ id: "F-1", type: "LEVEL", requirement: "7 to 10 years of experience in Asset Management, Project Finance, Private Equity or M&A", source_span_id: "S-REQ" }];
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  assert.notEqual(result.judgments[0].status, "DIRECT");
  assert.notEqual(result.judgments[0].status, "NONE");
});

test("specificity freeze: genuine M&A tenure remains DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "8 years in M&A advisory.", start_offset: 0, end_offset: 24, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "worked", object: "M&A advisory for 8 years" } };
  l.requirements[0].facets = [{ id: "F-1", type: "LEVEL", requirement: "7 to 10 years of experience in Asset Management, Project Finance, Private Equity or M&A", source_span_id: "S-REQ" }];
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});

test("specificity freeze: English PE synonym remains DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "8 years in private equity.", start_offset: 0, end_offset: 26, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "worked", object: "private equity for 8 years" } };
  l.requirements[0].facets = [{ id: "F-1", type: "LEVEL", requirement: "7 to 10 years of experience in PE", source_span_id: "S-REQ" }];
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});

test("specificity freeze: French project-finance synonym remains DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "8 ans en financement de projet.", start_offset: 0, end_offset: 31, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", provenance: { ...l.evidence[0].provenance, language: "fr" }, action: { normalized_action: "worked", object: "financement de projet pendant 8 ans" } };
  l.requirements[0].facets = [{ id: "F-1", type: "LEVEL", requirement: "7 to 10 years of experience in Project Finance", source_span_id: "S-REQ" }];
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
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
  assert.ok(result.errors.some(error => error.includes("mixed documented and elicited evidence is not permitted")));
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
    relationship_connector: "input to",
    licensing_spans: ["Prepared forecasts", "Introduced pipeline reviews"],
  };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("relational DIRECT accepts an exact single-atom licensing span", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Used forecasts as input to pipeline reviews", start_offset: 0, end_offset: 43, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "used", object: "forecasts as input to pipeline reviews" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = {
    ...raw("DIRECT", ["A1"]),
    relationship_connector: "input to",
    licensing_spans: ["forecasts as input to pipeline reviews"],
  };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});

test("relational classifier independently requires licensing for DIRECT", () => {
  const l = ledger();
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.ok(result.errors.some(error => error.includes("relational DIRECT requires")));
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


test("relational DIRECT rejects extra support IDs even when one atom licenses the relationship", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Used forecasts as input to pipeline reviews", start_offset: 0, end_offset: 43, language: "en" };
  l.source_spans.push({ id: "S-A2", document_id: "CV", text: "Prepared monthly reports", start_offset: 44, end_offset: 68, language: "en" });
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "used", object: "forecasts as input to pipeline reviews" } };
  l.evidence.push({ ...structuredClone(l.evidence[0]), id: "A2", source_span_id: "S-A2", action: { normalized_action: "prepared", object: "monthly reports" } });
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = { ...raw("DIRECT", ["A1", "A2"]), relationship_connector: "input to", licensing_spans: ["forecasts as input to pipeline reviews"] };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("unknown context evidence fails closed", () => {
  const result = sanitizeJudgments([{ ...raw("PARTIAL", ["A1"]), context_evidence_ids: ["FORGED"] }], ledger());
  assert.ok(result.errors.some(error => error.includes("unknown evidence ID")));
});

test("abstention schema rejects context citations", () => {
  const l = ledger();
  const validate = new Ajv().compile(buildSupportJudgeSchema(l));
  assert.equal(validate({ judgments: [{ ...raw("NONE"), abstained: true, context_evidence_ids: ["A1"] }] }), false);
});


test("relational classifier covers sequence, dependency, recurrence and French response connectors", () => {
  for (const requirementText of [
    "Pipeline review depends on forecast quality",
    "Use a recurring forecast-to-review cadence",
    "Réviser le pipeline en réponse à la prévision",
    "Align forecasts with pipeline reviews",
    "Mettre les prévisions au service des revues du pipeline",
  ]) {
    const l = ledger();
    l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: requirementText, source_span_id: "S-REQ" };
    const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
    assert.ok(result.errors.some(error => error.includes("relational DIRECT requires")), requirementText);
  }
});


test("relational DIRECT rejects a licensing quote that does not contain the asserted connector", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared forecasts for the sales team", start_offset: 0, end_offset: 36, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "prepared", object: "forecasts" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = { ...raw("DIRECT", ["A1"]), relationship_connector: "input to", licensing_spans: ["Prepared forecasts for the sales team"] };
  const result = sanitizeJudgments([judgment], l);
  assert.ok(result.errors.some(error => error.includes("must explicitly contain the asserted relationship connector")));
});

test("relational DIRECT rejects a connector absent from the facet", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Used forecasts because of pipeline reviews", start_offset: 0, end_offset: 40, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "used", object: "forecasts because of pipeline reviews" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = { ...raw("DIRECT", ["A1"]), relationship_connector: "because of", licensing_spans: ["forecasts because of pipeline reviews"] };
  const result = sanitizeJudgments([judgment], l);
  assert.ok(result.errors.some(error => error.includes("connector must be explicitly present in the facet")));
});

test("accepted model rationale is replaced by a canonical minimal-subset rationale", () => {
  const l = ledger();
  const judgment = { ...raw("PARTIAL", ["A1"]), rationale: "Model-written interpretation that should not propagate." };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].rationale, "PARTIAL support from minimal evidence [A1].");
  assert.ok(!result.judgments[0].rationale.includes("Model-written"));
});


test("multi-span non-relational DIRECT is conservatively downgraded to PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Managed the annual budget", start_offset: 0, end_offset: 25, language: "en" };
  l.source_spans.push({ id: "S-A2", document_id: "CV", text: "Managed the annual budget for the region", start_offset: 26, end_offset: 66, language: "en" });
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "managed", object: "annual budget" } };
  l.evidence.push({ ...structuredClone(l.evidence[0]), id: "A2", source_span_id: "S-A2" });
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Manage the annual budget", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1", "A2"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("DIRECT may use multiple atoms only when they preserve the same source-span reference", () => {
  const l = ledger();
  l.evidence.push({ ...structuredClone(l.evidence[0]), id: "A2", action: { normalized_action: "managed", object: "finance operations" } });
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1", "A2"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});


test("ambiguous chronology and habitual wording are not automatic relational labels", () => {
  for (const requirementText of [
    "Review pipeline after forecast updates",
    "Réviser le pipeline après la prévision",
    "Used to manage budgets",
    "Analyses pour le directeur financier",
  ]) {
    const l = ledger();
    l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: requirementText, source_span_id: "S-REQ" };
    const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
    assert.ok(!result.errors.some(error => error.includes("relational DIRECT requires")), requirementText);
  }
});


test("connector substring alone cannot license a relationship when facet sides are not bound in one clause", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared forecasts. Input to pipeline reviews was discussed.", start_offset: 0, end_offset: 57, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "prepared", object: "forecasts" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = { ...raw("DIRECT", ["A1"]), relationship_connector: "input to", licensing_spans: ["Prepared forecasts. Input to pipeline reviews was discussed."] };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("French relational classifier normalizes decomposed Unicode and dépend des", () => {
  for (const requirementText of [
    "Le pipeline dépend des prévisions",
    "Réviser le pipeline en re\u0301ponse à la prévision",
  ]) {
    const l = ledger();
    l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: requirementText, source_span_id: "S-REQ" };
    const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
    assert.ok(result.errors.some(error => error.includes("relational DIRECT requires")), requirementText);
  }
});


test("same-span co-occurrence cannot satisfy use-X-in-Y relationship as DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared monthly sales forecasts and introduced a structured pipeline review.", start_offset: 0, end_offset: 75, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "prepared", object: "monthly sales forecasts and introduced a structured pipeline review" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("comma-joined independent relation cannot license DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Used forecasts as input to budgeting, and separately ran pipeline reviews.", start_offset: 0, end_offset: 70, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "used", object: "forecasts as input to budgeting and separately ran pipeline reviews" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts as input to pipeline reviews", source_span_id: "S-REQ" };
  const judgment = { ...raw("DIRECT", ["A1"]), relationship_connector: "input to", licensing_spans: ["Used forecasts as input to budgeting, and separately ran pipeline reviews."] };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("French plural and feminine based-on forms remain relational after normalization", () => {
  for (const requirementText of [
    "Revues du pipeline basées sur les prévisions",
    "Décisions fondées sur les prévisions",
    "Contrôles basés sur les prévisions",
  ]) {
    const l = ledger();
    l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: requirementText, source_span_id: "S-REQ" };
    const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
    assert.ok(result.errors.some(error => error.includes("relational DIRECT requires")), requirementText);
  }
});

test("apply integrate and translate relation-bearing constructions require licensing", () => {
  for (const requirementText of [
    "Apply forecasts to pipeline reviews",
    "Integrate forecasts into pipeline reviews",
    "Translate forecasts into pipeline actions",
    "Intégrer les prévisions dans les revues du pipeline",
  ]) {
    const l = ledger();
    l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: requirementText, source_span_id: "S-REQ" };
    const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
    assert.ok(result.errors.some(error => error.includes("relational DIRECT requires")), requirementText);
  }
});


test("generic preposition cannot license a relation without the facet relation verb", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared forecasts in June for pipeline reviews.", start_offset: 0, end_offset: 48, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "prepared", object: "forecasts in June for pipeline reviews" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const judgment = { ...raw("DIRECT", ["A1"]), relationship_connector: "in", licensing_spans: ["Prepared forecasts in June for pipeline reviews."] };
  const result = sanitizeJudgments([judgment], l);
  assert.ok(result.errors.some(error => error.includes("bind content from both sides")));
});

test("generic preposition licenses a relation when the facet relation verb is preserved", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Used forecasts in pipeline reviews.", start_offset: 0, end_offset: 35, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "used", object: "forecasts in pipeline reviews" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const judgment = { ...raw("DIRECT", ["A1"]), relationship_connector: "in", licensing_spans: ["Used forecasts in pipeline reviews."] };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});


test("lexicon-free clause guard rejects relational synonym co-occurrence in English", () => {
  for (const requirementText of [
    "Incorporate forecasts into pipeline reviews",
    "Leverage forecasts in pipeline reviews",
    "Forecasts inform pipeline reviews",
    "Rely on forecasts for pipeline reviews",
    "Embed forecasts in pipeline reviews",
    "Pipeline reviews draw on forecasts",
    "Run pipeline reviews from forecasts",
  ]) {
    const l = ledger();
    l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared monthly sales forecasts and introduced a structured pipeline review.", start_offset: 0, end_offset: 75, language: "en" };
    l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "prepared", object: "monthly sales forecasts and introduced a structured pipeline review" } };
    l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: requirementText, source_span_id: "S-REQ" };
    const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
    assert.equal(result.errors.length, 0, requirementText);
    assert.equal(result.judgments[0]?.status, "PARTIAL", requirementText);
  }
});

test("lexicon-free clause guard rejects relational synonym co-occurrence in French", () => {
  for (const requirementText of [
    "S'appuyer sur les prévisions pour les revues du pipeline",
    "Exploiter les prévisions dans les revues du pipeline",
    "Intégrer les prévisions dans les revues du pipeline",
  ]) {
    const l = ledger();
    l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Préparé les prévisions mensuelles et introduit une revue structurée du pipeline.", start_offset: 0, end_offset: 78, language: "fr" };
    l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "prepare", object: "prévisions mensuelles et revue structurée du pipeline" } };
    l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: requirementText, source_span_id: "S-REQ" };
    const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
    assert.equal(result.errors.length, 0, requirementText);
    assert.equal(result.judgments[0]?.status, "PARTIAL", requirementText);
  }
});

test("lexicon-free clause guard does not penalize a single-group facet", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Experience with SAP and prepared monthly reporting.", start_offset: 0, end_offset: 48, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "experience", object: "SAP" } };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Experience with SAP", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});


test("clause guard folds EN inflections for R1 X1", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared forecasts and introduced a structured pipeline review.", start_offset: 0, end_offset: 61, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Leverage forecasting in reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("clause guard folds FR number inflections for R1 X2", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Préparé les prévisions et introduit les revues du pipeline.", start_offset: 0, end_offset: 57, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Exploiter la prévision dans la revue du pipeline", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("chronology then is an evidence clause boundary for R1 X5", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared monthly forecasts then introduced pipeline reviews.", start_offset: 0, end_offset: 57, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Leverage forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("chronology puis is an evidence clause boundary for R1 X6", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Préparé les prévisions puis introduit les revues du pipeline.", start_offset: 0, end_offset: 61, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Exploiter les prévisions dans les revues du pipeline", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("conjunctive budgeting and forecasting facet remains DIRECT FN2", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Led budgeting and forecasting for the region.", start_offset: 0, end_offset: 45, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Budgeting and forecasting", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});

test("conjunctive payroll and accounts payable facet remains DIRECT FN3", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Managed payroll and supervised accounts payable.", start_offset: 0, end_offset: 47, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Manage payroll and accounts payable", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});


test("deterministic validator caps English elicited-only DIRECT at PARTIAL", () => {
  const l = ledger();
  l.evidence[0] = {
    ...l.evidence[0],
    provenance: { ...l.evidence[0].provenance, source_type: "CANDIDATE_ELICITED", language: "en" },
  };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]), support_basis: "CANDIDATE_SELF_REPORTED" }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
  assert.equal(result.judgments[0].support_basis, "CANDIDATE_SELF_REPORTED");
  assert.ok(result.judgments[0].rationale.includes("self-reported evidence cannot establish DIRECT"));
});

test("deterministic validator caps French elicited-only DIRECT at PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { ...l.source_spans[0], text: "J'ai géré la finance", language: "fr" };
  l.evidence[0] = {
    ...l.evidence[0],
    provenance: { ...l.evidence[0].provenance, source_type: "CANDIDATE_ELICITED", language: "fr" },
  };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]), support_basis: "CANDIDATE_SELF_REPORTED" }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
  assert.equal(result.judgments[0].support_basis, "CANDIDATE_SELF_REPORTED");
});


test("X3 prepositional association without facet relation verb is PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared forecasts in June for pipeline reviews.", start_offset: 0, end_offset: 48, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Leverage forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("X4 prepositional team association without facet relation verb is PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Prepared forecasts with the pipeline review team.", start_offset: 0, end_offset: 49, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Leverage forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("true synonym understatement remains PARTIAL rather than unsupported DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Applied forecasts in pipeline reviews.", start_offset: 0, end_offset: 38, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Leverage forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("licensed use relation remains DIRECT under prepositional guard", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Used forecasts in pipeline reviews.", start_offset: 0, end_offset: 35, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Use forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]), relationship_connector: "in", licensing_spans: ["Used forecasts in pipeline reviews."] }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});

test("FR X3 association without exploiter relation is PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Préparé les prévisions en juin pour les revues du pipeline.", start_offset: 0, end_offset: 59, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Exploiter les prévisions dans les revues du pipeline", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("FR X4 team association without exploiter relation is PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Préparé les prévisions avec l'équipe des revues du pipeline.", start_offset: 0, end_offset: 60, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Exploiter les prévisions dans les revues du pipeline", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("FR true synonym understatement is PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Appliqué les prévisions dans les revues du pipeline.", start_offset: 0, end_offset: 52, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Exploiter les prévisions dans les revues du pipeline", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});


test("A1 roles reversed cannot survive as DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Leveraged pipeline reviews in forecasts.", start_offset: 0, end_offset: 40, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Leverage forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("A2 preposition bound to different object cannot survive as DIRECT", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Leveraged forecasts in budgeting for pipeline reviews.", start_offset: 0, end_offset: 53, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Leverage forecasts in pipeline reviews", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("FR own verb participle exploité licenses ordered relation", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Exploité les prévisions dans les revues du pipeline.", start_offset: 0, end_offset: 52, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Exploiter les prévisions dans les revues du pipeline", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});

test("FR own verb imperfect exploitait licenses ordered relation", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Exploitait les prévisions dans les revues du pipeline.", start_offset: 0, end_offset: 54, language: "fr" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1" };
  l.requirements[0].facets[0] = { id: "F-1", type: "FUNCTION", requirement: "Exploiter les prévisions dans les revues du pipeline", source_span_id: "S-REQ" };
  const result = sanitizeJudgments([{ ...raw("DIRECT", ["A1"]) }], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
});


test("exact positive Leveraged forecasts in pipeline reviews remains DIRECT", () => {
  const l=ledger(); l.source_spans[0]={id:"S-A1",document_id:"CV",text:"Leveraged forecasts in pipeline reviews.",start_offset:0,end_offset:41,language:"en"}; l.evidence[0]={...l.evidence[0],source_span_id:"S-A1"}; l.requirements[0].facets[0]={id:"F-1",type:"FUNCTION",requirement:"Leverage forecasts in pipeline reviews",source_span_id:"S-REQ"};
  const r=sanitizeJudgments([{...raw("DIRECT",["A1"])}],l); assert.equal(r.errors.length,0); assert.equal(r.judgments[0].status,"DIRECT");
});
test("exact FR A2 local-binding hole downgrades to PARTIAL", () => {
  const l=ledger(); l.source_spans[0]={id:"S-A1",document_id:"CV",text:"Exploité les prévisions dans le budget pour les revues du pipeline.",start_offset:0,end_offset:68,language:"fr"}; l.evidence[0]={...l.evidence[0],source_span_id:"S-A1"}; l.requirements[0].facets[0]={id:"F-1",type:"FUNCTION",requirement:"Exploiter les prévisions dans les revues du pipeline",source_span_id:"S-REQ"};
  const r=sanitizeJudgments([{...raw("DIRECT",["A1"])}],l); assert.equal(r.errors.length,0); assert.equal(r.judgments[0].status,"PARTIAL");
});
test("monthly reporting in SAP remains verb-less DIRECT", () => {
  const l=ledger(); l.source_spans[0]={id:"S-A1",document_id:"CV",text:"Prepared monthly reporting in SAP.",start_offset:0,end_offset:34,language:"en"}; l.evidence[0]={...l.evidence[0],source_span_id:"S-A1"}; l.requirements[0].facets[0]={id:"F-1",type:"FUNCTION",requirement:"Monthly reporting in SAP",source_span_id:"S-REQ"};
  const r=sanitizeJudgments([{...raw("DIRECT",["A1"])}],l); assert.equal(r.errors.length,0); assert.equal(r.judgments[0].status,"DIRECT");
});
test("EN A2 budgeting interruption remains PARTIAL", () => {
  const l=ledger(); l.source_spans[0]={id:"S-A1",document_id:"CV",text:"Leveraged forecasts in budgeting for pipeline reviews.",start_offset:0,end_offset:53,language:"en"}; l.evidence[0]={...l.evidence[0],source_span_id:"S-A1"}; l.requirements[0].facets[0]={id:"F-1",type:"FUNCTION",requirement:"Leverage forecasts in pipeline reviews",source_span_id:"S-REQ"};
  const r=sanitizeJudgments([{...raw("DIRECT",["A1"])}],l); assert.equal(r.errors.length,0); assert.equal(r.judgments[0].status,"PARTIAL");
});
test("positive determiner and adjective local binding remains DIRECT", () => {
  const l=ledger(); l.source_spans[0]={id:"S-A1",document_id:"CV",text:"Leveraged the forecasts in the weekly pipeline reviews.",start_offset:0,end_offset:55,language:"en"}; l.evidence[0]={...l.evidence[0],source_span_id:"S-A1"}; l.requirements[0].facets[0]={id:"F-1",type:"FUNCTION",requirement:"Leverage forecasts in pipeline reviews",source_span_id:"S-REQ"};
  const r=sanitizeJudgments([{...raw("DIRECT",["A1"])}],l); assert.equal(r.errors.length,0); assert.equal(r.judgments[0].status,"DIRECT");
});
test("financial reporting in SAP remains modifier-led DIRECT", () => {
  const l=ledger(); l.source_spans[0]={id:"S-A1",document_id:"CV",text:"Prepared financial reporting in SAP.",start_offset:0,end_offset:36,language:"en"}; l.evidence[0]={...l.evidence[0],source_span_id:"S-A1"}; l.requirements[0].facets[0]={id:"F-1",type:"FUNCTION",requirement:"Financial reporting in SAP",source_span_id:"S-REQ"};
  const r=sanitizeJudgments([{...raw("DIRECT",["A1"])}],l); assert.equal(r.errors.length,0); assert.equal(r.judgments[0].status,"DIRECT");
});



test("verb-less reversed-order residual stays PARTIAL", () => {
  const l = ledger();
  l.source_spans[0] = { id: "S-A1", document_id: "CV", text: "Configured SAP in the reporting team.", start_offset: 0, end_offset: 37, language: "en" };
  l.evidence[0] = { ...l.evidence[0], source_span_id: "S-A1", action: { normalized_action: "configured", object: "SAP in the reporting team" } };
  l.requirements[0].facets = [{ id: "F-1", type: "FUNCTION", requirement: "Reporting in SAP", source_span_id: "S-REQ" }];
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "PARTIAL");
});

test("numeric prose does not masquerade as an out-of-subset evidence ID", () => {
  const l = ledger();
  l.source_spans.push({ id: "S-A2", document_id: "CV", text: "Managed statutory audits.", start_offset: 0, end_offset: 25, language: "en" });
  l.evidence.push({ ...l.evidence[0], id: "2", source_span_id: "S-A2" });
  const judgment = { ...raw("DIRECT", ["A1"]), rationale: "The candidate has over 13 years of finance experience." };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.some(error => error.includes("evidence ID outside")), false);
});

test("ordinary numeric quantities do not masquerade as evidence IDs", () => {
  const l = ledger();
  for (const id of ["13", "14", "50", "50000"]) {
    l.source_spans.push({ id: "S-N-" + id, document_id: "CV", text: "Background evidence " + id, start_offset: 0, end_offset: 20, language: "en" });
    l.evidence.push({ ...l.evidence[0], id, source_span_id: "S-N-" + id });
  }
  const judgment = {
    ...raw("DIRECT", ["A1"]),
    rationale: "The candidate has 13+ years across 14 countries and handled USD 50,000 in restricted funds.",
  };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.some(error => error.includes("outside the minimal supporting subset")), false);
});

test("explicit out-of-subset evidence ID reference remains rejected", () => {
  const l = ledger();
  l.source_spans.push({ id: "S-A2", document_id: "CV", text: "Managed statutory audits.", start_offset: 0, end_offset: 25, language: "en" });
  l.evidence.push({ ...l.evidence[0], id: "2", source_span_id: "S-A2" });
  const judgment = { ...raw("DIRECT", ["A1"]), rationale: "Evidence ID: 2 also supports this judgment." };
  const result = sanitizeJudgments([judgment], l);
  assert.equal(result.errors.some(error => error.includes("evidence ID outside")), true);
});
