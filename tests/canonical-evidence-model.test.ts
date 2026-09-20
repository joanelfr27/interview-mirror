import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRequirementStatus,
  validateAtomicEvidence,
  validateRequirementGraph,
  buildUnresolvedItems,
  validateDemonstrationEvidenceBinding,
  type AtomicEvidence,
  type EvidenceLedger,
  type Requirement,
  type SupportJudgment,
  detectSourceLanguage,
  detectQuoteLanguage,
  validateSupportJudgmentAgainstFacet,
  assertCompleteFacetJudgments,
  buildCandidateElicitations,
} from "../src/lib/canonical-evidence-model.ts";

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


test("positive support must cite affirmative evidence", () => {
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [atom("A1")],
    requirements: [requirement()],
    support_judgments: [
      judgment("F-1", "DIRECT"),
      judgment("F-2", "NONE"),
    ],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "UNRESOLVED" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateRequirementGraph(ledger);
  assert.ok(errors.some(e => e.includes("Positive support statuses must cite at least one evidence atom")));
});

test("negated evidence cannot be used as positive support", () => {
  const negated = atom("A2", "NEGATED");
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A2", document_id: "CV", text: "I did not manage finance", start_offset: 0, end_offset: 23, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [negated],
    requirements: [requirement()],
    support_judgments: [judgment("F-1", "DIRECT", ["A2"]), judgment("F-2", "NONE")],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateRequirementGraph(ledger);
  assert.ok(errors.some(e => e.includes("NEGATED evidence as positive support")));
});

test("contradicted facets remain in unresolved inference queue", () => {
  const req = requirement();
  const negated = atom("A2", "NEGATED");
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A2", document_id: "CV", text: "I did not manage finance", start_offset: 0, end_offset: 23, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [negated],
    requirements: [req],
    support_judgments: [
      judgment("F-1", "CONTRADICTORY", ["A2"]),
      judgment("F-2", "NONE"),
    ],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "UNRESOLVED" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const unresolved = buildUnresolvedItems(ledger);
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].type, "CONFLICTING");
  assert.deepEqual(unresolved[0].contradiction_evidence_ids, ["A2"]);
});

test("duplicate facet IDs are rejected", () => {
  const req = requirement();
  req.facets.push({ ...req.facets[0], id: "F-1" });
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [atom("A1")],
    requirements: [req],
    support_judgments: [],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "UNRESOLVED" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  assert.ok(validateRequirementGraph(ledger).some(e => e.includes("Requirement facet F-1 is duplicated")));
});

test("support basis must match cited evidence provenance", () => {
  const elicited = atom("A2");
  elicited.provenance.source_type = "CANDIDATE_ELICITED";
  elicited.assertion.type = "ELICITED";
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A2", document_id: "ELICIT", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [elicited],
    requirements: [requirement()],
    support_judgments: [judgment("F-1", "PARTIAL", ["A2"]), judgment("F-2", "NONE")],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  assert.ok(validateRequirementGraph(ledger).some(e => e.includes("DOCUMENTED basis cannot cite elicited evidence")));
});

test("duplicate judgments for one facet are rejected", () => {
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [atom("A1")],
    requirements: [requirement()],
    support_judgments: [
      judgment("F-1", "DIRECT", ["A1"]),
      { ...judgment("F-1", "PARTIAL", ["A1"]), id: "SJ-F-1-DUP" },
      judgment("F-2", "NONE"),
    ],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  assert.ok(validateRequirementGraph(ledger).some(e => e.includes("duplicates another judgment")));
});

test("negated evidence cannot be bound as a demonstration true atom", () => {
  const errors = validateDemonstrationEvidenceBinding(
    {
      id: "DEMO-1",
      target_unresolved_item_id: "U-1",
      observable_cue: "Show evidence",
      supporting_true_atom_ids: ["A2"],
      truthfulness_boundary: { permitted_claims: [], prohibited_claims: ["Do not invent facts."] },
    },
    [atom("A2", "NEGATED")],
  );
  assert.ok(errors.some(e => e.includes("cannot treat NEGATED evidence")));
});


test("Unicode-safe language detection recognizes accented French and English", () => {
  assert.equal(detectSourceLanguage("J'ai piloté la trésorerie et préparé les clôtures.", ""), "fr");
  assert.equal(detectSourceLanguage("I led treasury and prepared the close.", ""), "en");
});

test("source language detection preserves mixed-language document context but quote-level detection identifies each quote", () => {
  const document = "I managed finance and reporting.\nJ'ai dirigé l'équipe finance.";
  assert.equal(detectSourceLanguage(document, ""), "mixed");
  assert.equal(detectQuoteLanguage("I managed finance and reporting.", "mixed"), "en");
  assert.equal(detectQuoteLanguage("J'ai dirigé l'équipe finance.", "mixed"), "fr");
});

test("requirement graph rejects incomplete requirement status coverage", () => {
  const req2 = { ...requirement(), id: "REQ-2", source_span_id: "span-req-2", normalized_requirement: "Lead teams" };
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
      { id: "span-req-2", document_id: "JD", text: "Lead teams", start_offset: 15, end_offset: 25, language: "en" },
    ],
    evidence: [atom("A1")],
    requirements: [requirement(), req2],
    support_judgments: [
      judgment("F-1", "DIRECT", ["A1"]),
      judgment("F-2", "NONE"),
    ],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateRequirementGraph(ledger);
  assert.ok(errors.some(e => e.includes("Requirement REQ-2 has no requirement status.")));
});


test("DIRECT support is blocked when affirmative and negated atoms conflict", () => {
  const positive = atom("A1", "AFFIRMATIVE");
  const negative = atom("A2", "NEGATED");
  const errors = validateSupportJudgmentAgainstFacet(judgment("F-1", "DIRECT", ["A1"]), requirement().facets[0], [positive, negative]);
  assert.ok(errors.some(e => e.includes("conflicting NEGATED atom")));
});

test("DIRECT SCALE support requires explicit scale evidence", () => {
  const errors = validateSupportJudgmentAgainstFacet(judgment("F-2", "DIRECT", ["A1"]), requirement().facets[1], [atom("A1")]);
  assert.ok(errors.some(e => e.includes("SCALE requires explicit")));
});

test("support judge completeness fails closed on missing or duplicate facets", () => {
  const req = requirement();
  const missing = assertCompleteFacetJudgments([{ requirement_id: "REQ-1", facet_id: "F-1" }], req.facets);
  assert.ok(missing.some(e => e.includes("Missing judgment for facet F-2")));
  const duplicate = assertCompleteFacetJudgments([{ requirement_id: "REQ-1", facet_id: "F-1" }, { requirement_id: "REQ-1", facet_id: "F-1" }, { requirement_id: "REQ-1", facet_id: "F-2" }], req.facets);
  assert.ok(duplicate.some(e => e.includes("Duplicate judgment returned for facet F-1")));
});

