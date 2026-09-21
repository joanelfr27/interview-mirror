import assert from "node:assert/strict";
import test from "node:test";
import { spanWithinParent } from "../src/lib/canonical-shadow-extractor.ts";
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
  validateAtomicEvidenceAgainstSource,
  validateCandidateElicitation,
  deriveDeterministicVerifiability
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


test("quantifiable metric detection does not treat employment years as metrics", () => {
  const evidence = atom("A1");
  evidence.action.normalized_action = "Finance Manager";
  evidence.action.object = "Manager";
  evidence.subject.ownership = "UNKNOWN";
  evidence.verifiability.has_quantifiable_metric = false;
  evidence.verifiability.has_time_anchor = true;
  const span = {
    id: "span-A1",
    document_id: "CV",
    text: "Finance Manager | Aug 2024–Present",
    start_offset: 0,
    end_offset: 34,
    language: "en",
  };
  assert.deepEqual(validateAtomicEvidenceAgainstSource(evidence, span), []);
});

test("Unicode-safe language detection recognizes accented French and English", () => {
  assert.equal(detectSourceLanguage("J'ai piloté la trésorerie et préparé les clôtures.", ""), "fr");
  assert.equal(detectSourceLanguage("I led treasury and prepared the close.", ""), "en");
  assert.equal(detectSourceLanguage("xdirigé", ""), "mixed");
  assert.equal(detectSourceLanguage("xmanaged", ""), "mixed");
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



test("all DIRECT dimension guards reject missing evidence", () => {
  const base = atom("A1");
  const toolErrors = validateSupportJudgmentAgainstFacet(
    judgment("F-1", "DIRECT", ["A1"]),
    { id: "F-TOOL", type: "TOOL_METHOD", requirement: "Use SAP", source_span_id: "span-req" },
    [base],
  );
  const ownershipAtom = atom("A2");
  ownershipAtom.subject.ownership = "UNKNOWN";
  const ownershipErrors = validateSupportJudgmentAgainstFacet(
    judgment("F-1", "DIRECT", ["A2"]),
    { id: "F-OWN", type: "OWNERSHIP", requirement: "Own the process", source_span_id: "span-req" },
    [ownershipAtom],
  );
  const outcomeErrors = validateSupportJudgmentAgainstFacet(
    judgment("F-1", "DIRECT", ["A1"]),
    { id: "F-OUT", type: "OUTCOME", requirement: "Deliver results", source_span_id: "span-req" },
    [base],
  );
  const governanceErrors = validateSupportJudgmentAgainstFacet(
    judgment("F-1", "DIRECT", ["A1"]),
    { id: "F-GOV", type: "GOVERNANCE", requirement: "Operate under controls", source_span_id: "span-req" },
    [base],
  );
  assert.ok(toolErrors.some(e => e.includes("TOOL_METHOD requires explicit")));
  assert.ok(ownershipErrors.some(e => e.includes("OWNERSHIP requires explicit")));
  assert.ok(outcomeErrors.some(e => e.includes("OUTCOME requires an explicit")));
  assert.ok(governanceErrors.some(e => e.includes("GOVERNANCE requires explicit")));
});


test("ANALOGICAL_TRANSFER requires explicit shared and unshared dimensions", () => {
  const a = atom("A1");
  const req = requirement();
  const base: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [a],
    requirements: [req],
    support_judgments: [
      { ...judgment("F-1", "ANALOGICAL_TRANSFER", ["A1"]), analogical_mapping: undefined },
      judgment("F-2", "NONE"),
    ],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateRequirementGraph(base);
  assert.ok(errors.some(e => e.includes("ANALOGICAL_TRANSFER requires shared and unshared dimensions")));
});

test("mixed documented and elicited evidence cannot be represented as a single basis", () => {
  const elicited = atom("A2");
  elicited.provenance.source_type = "CANDIDATE_ELICITED";
  elicited.assertion.type = "ELICITED";
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-A2", document_id: "ELICIT", text: "I also managed finance", start_offset: 0, end_offset: 21, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [atom("A1"), elicited],
    requirements: [requirement()],
    support_judgments: [
      judgment("F-1", "PARTIAL", ["A1", "A2"]),
      judgment("F-2", "NONE"),
    ],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateRequirementGraph(ledger);
  assert.ok(errors.some(e => e.includes("mixed evidence basis requires an explicit model state")));
});


test("final requirement graph rejects incomplete facet judgments", () => {
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "span-A1", document_id: "CV", text: "I managed finance", start_offset: 0, end_offset: 17, language: "en" },
      { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" },
    ],
    evidence: [atom("A1")],
    requirements: [requirement()],
    support_judgments: [judgment("F-1", "DIRECT", ["A1"])],
    requirement_statuses: [{ requirement_id: "REQ-1", status: "PARTIAL" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateRequirementGraph(ledger);
  assert.ok(errors.some(e => e.includes("Missing judgment for facet F-2")));
  assert.equal(validateRequirementGraph(ledger, { allowUnjudgedFacets: true }).length, 0);
});


test("field-level grounding rejects an invented structured outcome despite an exact source quote", () => {
  const evidence = atom("A1");
  evidence.outcome = "€2M savings";
  const span = {
    id: "span-A1",
    document_id: "CV",
    text: "I managed finance",
    start_offset: 0,
    end_offset: 17,
    language: "en",
  };
  const errors = validateAtomicEvidenceAgainstSource(evidence, span);
  assert.ok(errors.some(e => e.includes("outcome is not grounded")));
});

test("field-level grounding rejects an invented tool while preserving exact quoted evidence", () => {
  const evidence = atom("A1");
  evidence.context.tools_or_systems = ["SAP"];
  const span = {
    id: "span-A1",
    document_id: "CV",
    text: "I managed finance",
    start_offset: 0,
    end_offset: 17,
    language: "en",
  };
  const errors = validateAtomicEvidenceAgainstSource(evidence, span);
  assert.ok(errors.some(e => e.includes("tools_or_systems is not grounded")));
});

test("field-level grounding accepts structured fields explicitly present in the quote", () => {
  const evidence = atom("A1");
  evidence.scale.quantity = "20";
  evidence.outcome = "reduced costs";
  evidence.verifiability.has_quantifiable_metric = true;
  const span = {
    id: "span-A1",
    document_id: "CV",
    text: "I managed 20 finance processes and reduced costs",
    start_offset: 0,
    end_offset: 47,
    language: "en",
  };
  evidence.action.normalized_action = "managed";
  evidence.action.object = "finance processes";
  const errors = validateAtomicEvidenceAgainstSource(evidence, span);
  assert.deepEqual(errors, []);
});

test("candidate elicitation classification must agree with elicited atom polarity", () => {
  const answer = "I have managed finance.";
  const answerSpan = {
    id: "SPAN-ELICIT-ELICIT-U-1",
    document_id: "ELICIT-SESSION",
    text: answer,
    start_offset: 0,
    end_offset: answer.length,
    language: "en",
  };
  const elicited = atom("ELICIT-ATOM-ELICIT-U-1");
  elicited.source_span_id = answerSpan.id;
  elicited.provenance.source_type = "CANDIDATE_ELICITED";
  elicited.assertion.type = "ELICITED";
  const ledger: EvidenceLedger = {
    source_spans: [answerSpan],
    evidence: [elicited],
    requirements: [],
    support_judgments: [],
    requirement_statuses: [],
    unresolved_items: [{
      id: "ELICIT-U-1",
      requirement_id: "REQ-1",
      facet_ids: [],
      type: "ABSENT",
      supporting_evidence_ids: [],
      contradiction_evidence_ids: [],
      absence_basis: "UNMENTIONED",
      negation_evidence_ids: [],
    }],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateCandidateElicitation({
    id: "ELICIT-U-1",
    unresolved_item_id: "ELICIT-U-1",
    question: "Describe your experience.",
    answer,
    answer_source_span_id: answerSpan.id,
    answer_assertion_type: "ELICITED",
    classification: "EXPERIENCE_GAP",
    classification_rationale: "test",
  }, ledger);
  assert.ok(errors.some(e => e.includes("EXPERIENCE_GAP classification requires a NEGATED")));
});

test("candidate elicitation answer spans must exactly match the submitted answer", () => {
  const answerSpan = {
    id: "SPAN-ELICIT-ELICIT-U-2",
    document_id: "ELICIT-SESSION",
    text: "I managed",
    start_offset: 0,
    end_offset: 8,
    language: "en",
  };
  const ledger: EvidenceLedger = {
    source_spans: [answerSpan],
    evidence: [],
    requirements: [],
    support_judgments: [],
    requirement_statuses: [],
    unresolved_items: [{
      id: "ELICIT-U-2",
      requirement_id: "REQ-1",
      facet_ids: [],
      type: "ABSENT",
      supporting_evidence_ids: [],
      contradiction_evidence_ids: [],
      absence_basis: "UNMENTIONED",
      negation_evidence_ids: [],
    }],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
  const errors = validateCandidateElicitation({
    id: "ELICIT-U-2",
    unresolved_item_id: "ELICIT-U-2",
    question: "Describe your experience.",
    answer: "I managed finance.",
    answer_source_span_id: answerSpan.id,
  }, ledger);
  assert.ok(errors.some(e => e.includes("does not exactly match")));
});


test("facet source mapping fails closed when the same phrase occurs more than once", () => {
  const parent = {
    id: "SPAN-JD-REQUIREMENT-0-39",
    document_id: "JD",
    text: "manage finance and manage finance",
    start_offset: 0,
    end_offset: 33,
    language: "en",
  };
  assert.equal(spanWithinParent(parent, "manage finance"), null);
});

test("facet source mapping preserves a unique phrase occurrence", () => {
  const parent = {
    id: "SPAN-JD-REQUIREMENT-0-20",
    document_id: "JD",
    text: "Manage finance now",
    start_offset: 0,
    end_offset: 18,
    language: "en",
  };
  const span = spanWithinParent(parent, "Manage finance");
  assert.equal(span?.start_offset, 0);
  assert.equal(span?.end_offset, 14);
});


test("field-level grounding rejects an invented actor while allowing the canonical candidate placeholder", () => {
  const evidence = atom("A1");
  evidence.subject.actor = "John Doe";
  const span = {
    id: "span-A1",
    document_id: "CV",
    text: "I managed finance",
    start_offset: 0,
    end_offset: 17,
    language: "en",
  };
  const errors = validateAtomicEvidenceAgainstSource(evidence, span);
  assert.ok(errors.some(e => e.includes("subject.actor is not grounded")));

  evidence.subject.actor = "candidate";
  assert.deepEqual(validateAtomicEvidenceAgainstSource(evidence, span), []);
});

test("third-party verification cannot be asserted without a deterministic source marker", () => {
  const evidence = atom("A1");
  evidence.verifiability.has_third_party_entity = true;
  const span = {
    id: "span-A1",
    document_id: "CV",
    text: "I managed finance",
    start_offset: 0,
    end_offset: 17,
    language: "en",
  };
  const errors = validateAtomicEvidenceAgainstSource(evidence, span);
  assert.ok(errors.some(e => e.includes("has_third_party_entity")));
});


test("elicitation classification cannot be overturned by an inconsistent support status", () => {
  const makeLedger = (classification: "EXPERIENCE_GAP" | "TRANSFERABLE" | "EVIDENCE_GAP", status: SupportJudgment["status"]) => {
    const elicited = atom("ELICIT-ATOM-E1");
    elicited.provenance.source_type = "CANDIDATE_ELICITED";
    elicited.assertion.type = "ELICITED";
    elicited.assertion.polarity = classification === "EXPERIENCE_GAP" ? "NEGATED" : "AFFIRMATIVE";
    const span = {
      id: "SPAN-ELICIT-E1",
      document_id: "ELICIT-SESSION",
      text: classification === "EXPERIENCE_GAP" ? "I have never managed finance" : "I managed a related process",
      start_offset: 0,
      end_offset: classification === "EXPERIENCE_GAP" ? 27 : 26,
      language: "en",
    };
    elicited.source_span_id = span.id;
    return {
      source_spans: [span, { id: "span-req", document_id: "JD", text: "Manage finance", start_offset: 0, end_offset: 14, language: "en" }],
      evidence: [elicited],
      requirements: [requirement()],
      support_judgments: [judgment("F-1", status, [elicited.id]), judgment("F-2", "NONE")],
      requirement_statuses: [{ requirement_id: "REQ-1", status: status === "CONTRADICTORY" ? "CONTRADICTED" : status === "DIRECT" ? "PARTIAL" : "UNRESOLVED" }],
      unresolved_items: [{
        id: "U-E1",
        requirement_id: "REQ-1",
        facet_ids: ["F-1"],
        type: "ABSENT",
        supporting_evidence_ids: [],
        contradiction_evidence_ids: [],
        absence_basis: "UNMENTIONED",
        negation_evidence_ids: [],
      }],
      candidate_elicitations: [{
        id: "E1",
        unresolved_item_id: "U-E1",
        question: "Describe your experience.",
        answer: span.text,
        answer_source_span_id: span.id,
        answer_assertion_type: "ELICITED",
        classification,
        classification_rationale: "test",
      }],
      demonstration_objectives: [],
    } as EvidenceLedger;
  };

  const experienceErrors = validateRequirementGraph(makeLedger("EXPERIENCE_GAP", "DIRECT"));
  assert.ok(experienceErrors.some(e => e.includes("EXPERIENCE_GAP elicited evidence cannot produce positive support")));

  const transferableErrors = validateRequirementGraph(makeLedger("TRANSFERABLE", "DIRECT"));
  assert.ok(transferableErrors.some(e => e.includes("TRANSFERABLE elicited evidence cannot be DIRECT")));

  const evidenceGapErrors = validateRequirementGraph(makeLedger("EVIDENCE_GAP", "CONTRADICTORY"));
  assert.ok(evidenceGapErrors.some(e => e.includes("EVIDENCE_GAP elicited evidence cannot be CONTRADICTORY")));
});


test("deterministic verifiability ignores employment years as metrics and geography as third-party entity", () => {
  const signals = deriveDeterministicVerifiability(
    "Finance Manager | Aug 2024–Present | Côte d’Ivoire et au Nigeria."
  );
  assert.equal(signals.has_quantifiable_metric, false);
  assert.equal(signals.has_time_anchor, true);
  assert.equal(signals.has_third_party_entity, false);
});

test("deterministic verifiability recognizes explicit metric and organization markers", () => {
  const signals = deriveDeterministicVerifiability(
    "Led a €2M program with ABC Group in 2024."
  );
  assert.equal(signals.has_quantifiable_metric, true);
  assert.equal(signals.has_time_anchor, true);
  assert.equal(signals.has_third_party_entity, true);
});
