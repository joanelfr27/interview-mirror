import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeJudgments } from "../src/lib/canonical-support-judge.ts";
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
    analogical_mapping: null, abstention_reason: null,
  };
}

test("judge sanitizer reports positive judgment without evidence as a hard error", () => {
  const result = sanitizeJudgments([raw("DIRECT")], ledger());
  assert.ok(result.errors.some(error => error.includes("positive status without cited evidence")));
});

test("DIRECT FUNCTION support rejects atoms with UNKNOWN action or object", () => {
  const l = ledger();
  l.evidence[0].action.normalized_action = "UNKNOWN";
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], l);
  assert.equal(result.judgments[0].status, "NONE");
  assert.deepEqual(result.judgments[0].supporting_evidence_ids, []);
});

test("judge sanitizer preserves valid documented direct support", () => {
  const result = sanitizeJudgments([raw("DIRECT", ["A1"])], ledger());
  assert.equal(result.errors.length, 0);
  assert.equal(result.judgments[0].status, "DIRECT");
  assert.equal(result.judgments[0].support_basis, "DOCUMENTED");
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
});
