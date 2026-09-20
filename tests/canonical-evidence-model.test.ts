import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRequirementStatus,
  validateAtomicEvidence,
  validateRequirementGraph,
  type AtomicEvidence,
  type EvidenceLedger,
  type Requirement,
  type SupportJudgment,
} from "../src/lib/canonical-evidence-model";

function atom(id: string, polarity: "AFFIRMATIVE" | "NEGATED" = "AFFIRMATIVE"): AtomicEvidence {
  return {
    id,
    source_span_id: `span-${id}`,
    provenance: { source_type: "CV", language: "en", extraction_method: "LLM" },
    subject: { actor: "candidate", ownership: "INDIVIDUAL" },
    action: { normalized_action: "managed", object: "finance" },
    context: {},
    scale: {},
    time: {},
    outcome: null,
    assertion: { type: "STATED", polarity },
    verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false },
    extraction_confidence: 1,
  };
}

function requirement(): Requirement {
  return {
    id: "REQ-1",
    source_span_id: "span-req",
    normalized_requirement: "Manage finance",
    category: "CAPABILITY",
    salience: "CORE",
    facets: [
      { id: "F-1", type: "FUNCTION", requirement: "Manage finance", source_span_id: "span-req" },
      { id: "F-2", type: "SCALE", requirement: "At scale", source_span_id: "span-req" },
    ],
    extraction_confidence: 1,
  };
}

function judgment(facet_id: string, status: SupportJudgment["status"], ids: string[] = []): SupportJudgment {
  return {
    id: `SJ-${facet_id}`,
    requirement_id: "REQ-1",
    facet_id,
    status,
    supporting_evidence_ids: ids,
    rationale: "test",
    confidence: 1,
    abstained: status === "NONE",
    abstention_reason: status === "NONE" ? "Insufficient explicit evidence." : undefined,
    support_basis: "DOCUMENTED",
  };
}

test("requirement aggregation is deterministic", () => {
  const req = requirement();
  const direct = judgment("F-1", "DIRECT", ["A1"]);
  const partial = judgment("F-2", "PARTIAL", ["A1"]);
  assert.equal(aggregateRequirementStatus(req, [direct, partial]), "PARTIAL");
  assert.equal(aggregateRequirementStatus(req, [direct, judgment("F-2", "DIRECT", ["A1"])]), "SUPPORTED");
  assert.equal(aggregateRequirementStatus(req, [judgment("F-1", "NONE"), judgment("F-2", "NONE")]), "UNRESOLVED");
  assert.equal(aggregateRequirementStatus(req, [judgment("F-1", "CONTRADICTORY", ["A2"]), direct]), "CONTRADICTED");
});

test("negated evidence remains structurally distinct from unmentioned evidence", () => {
  const negated = atom("A2", "NEGATED");
  assert.deepEqual(validateAtomicEvidence(negated), []);
  assert.equal(negated.assertion.polarity, "NEGATED");
});

test("source-traceability does not imply semantic validity", () => {
  const a = atom("A1");
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [a],
    requirements: [requirement()],
    support_judgments: [
      judgment("F-1", "DIRECT", ["A1"]),
      judgment("F-2", "NONE"),
    ],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  assert.equal(validateRequirementGraph(ledger).length, 0);
  assert.equal(aggregateRequirementStatus(ledger.requirements[0], ledger.support_judgments), "PARTIAL");
});
