import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runD16ShadowRuntimeIntegration } from "../src/lib/d16-shadow-runtime-integration.ts";
import { buildExplicitNoEvidence } from "../src/lib/candidate-elicitation.ts";
import { reconcileCandidateElicitations, validateRequirementGraph, type AtomicEvidence, type CandidateElicitation, type EvidenceLedger } from "../src/lib/canonical-evidence-model.ts";
import { buildSupportJudgeEvidence } from "../src/lib/canonical-support-judge.ts";
import { attachDemonstrationObjectives } from "../src/lib/demonstration-objectives.ts";
import { verifyRuntimeCommit } from "../src/lib/runtime-provenance.ts";

const valuationQuestion = "Have you personally performed the following professional activities: valuation, financial modelling, due diligence, deal analysis, investment appraisal, IRR/NPV analysis, or transaction execution?";

test("explicit No creates NEGATED elicited atoms only for questioned professional activities", () => {
  const elicitation: CandidateElicitation = {
    id: "SEALED-EDF-4",
    unresolved_item_id: "UNRESOLVED-R1",
    question: valuationQuestion,
  };
  const evidence = buildExplicitNoEvidence(
    elicitation,
    "No. My work ended at the report and recommendation. I do know from studies how to perform NPV and IRR analysis.",
  );

  assert.ok(evidence);
  assert.equal(evidence.quote, "No");
  assert.equal(evidence.classification, "EXPERIENCE_GAP");
  assert.deepEqual(evidence.atoms.map(atom => atom.action.object), [
    "valuation",
    "financial modelling",
    "due diligence",
    "deal analysis",
    "investment appraisal",
    "IRR/NPV analysis",
    "transaction execution",
  ]);
  assert.ok(evidence.atoms.every(atom => atom.assertion.polarity === "NEGATED"));
});

test("answer-only No and unrelated questions do not manufacture activity negations", () => {
  assert.equal(buildExplicitNoEvidence({
    id: "EL-1", unresolved_item_id: "UNRESOLVED-R1", question: "Describe your experience.",
  }, "No. I do know how NPV works."), null);
  assert.equal(buildExplicitNoEvidence({
    id: "EL-2", unresolved_item_id: "UNRESOLVED-R1", question: "Have you worked with investors?",
  }, "No."), null);
});

test("qualified No does not negate activities the answer explicitly says were performed", () => {
  const evidence = buildExplicitNoEvidence({
    id: "EL-3", unresolved_item_id: "UNRESOLVED-R1", question: valuationQuestion,
  }, "No. I performed valuation and due diligence, but not the other activities.");

  assert.ok(evidence);
  assert.ok(!evidence.atoms.some(atom => atom.action.object === "valuation"));
  assert.ok(!evidence.atoms.some(atom => atom.action.object === "due diligence"));
  assert.ok(evidence.atoms.every(atom => atom.assertion.polarity === "NEGATED"));

  assert.equal(buildExplicitNoEvidence({
    id: "EL-4", unresolved_item_id: "UNRESOLVED-R1", question: valuationQuestion,
  }, "No. I performed valuation and due diligence."), null);
  const partial = buildExplicitNoEvidence({
    id: "EL-5", unresolved_item_id: "UNRESOLVED-R1", question: valuationQuestion,
  }, "No, not all. I performed valuation, but I did not perform due diligence.");
  assert.deepEqual(partial?.atoms.map(atom => atom.action.object), ["due diligence"]);
});

test("question-context negative elicitation remains CANDIDATE_ELICITED and cannot be DIRECT", () => {
  const negative = buildExplicitNoEvidence({
    id: "EL-NEG", unresolved_item_id: "UNRESOLVED-R1", question: valuationQuestion,
  }, "No.");
  assert.ok(negative);
  const atom: AtomicEvidence = {
    id: negative.atoms[0].id, source_span_id: "EL-ANSWER",
    provenance: { source_type: "CANDIDATE_ELICITED", language: "en", extraction_method: "LLM" },
    subject: { actor: "candidate", ownership: "INDIVIDUAL" },
    action: negative.atoms[0].action,
    context: {}, scale: {}, time: {}, outcome: null,
    assertion: negative.atoms[0].assertion,
    verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false },
    extraction_confidence: 1,
  };
  const requirement = {
    id: "R1", source_span_id: "JD-R1", normalized_requirement: "Professional valuation experience",
    category: "EXPERIENCE", salience: "CORE" as const, extraction_confidence: 1,
    facets: [{ id: "F-R1", type: "FUNCTION" as const, requirement: "Perform valuation", source_span_id: "JD-R1" }],
  };
  const ledger: EvidenceLedger = {
    source_spans: [
      { id: "JD-R1", document_id: "JD", text: "Perform valuation", start_offset: 0, end_offset: 17, language: "en" },
      { id: "EL-ANSWER", document_id: "ELICIT-SESSION", text: negative.quote, start_offset: 0, end_offset: 2, language: "en" },
    ],
    evidence: [atom], requirements: [requirement],
    support_judgments: [{
      id: "SJ-R1-F-R1", requirement_id: "R1", facet_id: "F-R1", status: "DIRECT",
      supporting_evidence_ids: [atom.id], rationale: "Self-report.", confidence: 1,
      abstained: false, support_basis: "CANDIDATE_SELF_REPORTED",
    }],
    requirement_statuses: [{ requirement_id: "R1", status: "SUPPORTED" }],
    unresolved_items: [unresolved("UNRESOLVED-R1", "R1")],
    candidate_elicitations: [{
      id: "EL-NEG", unresolved_item_id: "UNRESOLVED-R1", question: valuationQuestion,
      answer: "No.", answer_source_span_id: "EL-ANSWER", answer_assertion_type: "ELICITED",
      classification: "EXPERIENCE_GAP", classification_rationale: negative.rationale,
    }],
    demonstration_objectives: [],
  };
  assert.equal(buildSupportJudgeEvidence(ledger)[0]?.source_quote, "No");
  assert.equal(buildSupportJudgeEvidence(ledger)[0]?.question_context, valuationQuestion);
  assert.ok(validateRequirementGraph(ledger).some(error => error.includes("self-reported undocumented evidence cannot be DIRECT")));
});

function unresolved(id: string, requirementId: string) {
  return {
    id, requirement_id: requirementId, facet_ids: ["F-" + requirementId],
    type: "ABSENT" as const, supporting_evidence_ids: [],
    contradiction_evidence_ids: [], absence_basis: "UNMENTIONED" as const,
    negation_evidence_ids: [],
  };
}

function elicitation(id: string, unresolvedId: string): CandidateElicitation {
  return {
    id, unresolved_item_id: unresolvedId, question: "Clarify this requirement.",
    answer: "No.", answer_assertion_type: "ELICITED",
    classification: "EXPERIENCE_GAP", classification_rationale: "Explicitly denied.",
  };
}

function graphLedger(
  unresolvedItems: EvidenceLedger["unresolved_items"],
  candidateElicitations: EvidenceLedger["candidate_elicitations"] = [],
  demonstrationObjectives: EvidenceLedger["demonstration_objectives"] = [],
): EvidenceLedger {
  const requirements = ["R1", "R2"].map(id => ({
    id, source_span_id: "JD-" + id, normalized_requirement: "Requirement " + id,
    category: "CAPABILITY", salience: "CORE" as const, extraction_confidence: 1,
    facets: [{ id: "F-" + id, type: "FUNCTION" as const, requirement: "Activity " + id, source_span_id: "JD-" + id }],
  }));
  return {
    source_spans: requirements.map(requirement => ({
      id: requirement.source_span_id, document_id: "JD", text: requirement.normalized_requirement,
      start_offset: 0, end_offset: requirement.normalized_requirement.length, language: "en",
    })),
    evidence: [], requirements, support_judgments: [], requirement_statuses: [],
    unresolved_items: unresolvedItems, candidate_elicitations: candidateElicitations,
    demonstration_objectives: demonstrationObjectives,
  };
}

test("two sequential elicitation answers leave only current unresolved and objective bindings after rebuilds", () => {
  const firstId = "UNRESOLVED-R1";
  const secondId = "UNRESOLVED-R2";
  const initial = graphLedger([unresolved(firstId, "R1"), unresolved(secondId, "R2")]);

  const afterFirstRebuild = reconcileCandidateElicitations(initial, graphLedger(
    [unresolved(secondId, "R2")],
    [elicitation("EL-FIRST", firstId)],
  ));
  const firstCurrent = attachDemonstrationObjectives(afterFirstRebuild).ledger;
  assert.deepEqual(firstCurrent.candidate_elicitations, []);
  assert.ok(firstCurrent.demonstration_objectives.every(objective =>
    firstCurrent.unresolved_items.some(item => item.id === objective.target_unresolved_item_id)));

  const afterSecondRebuild = reconcileCandidateElicitations(firstCurrent, graphLedger(
    [unresolved(secondId, "R2")],
    [elicitation("EL-SECOND", secondId)],
    firstCurrent.demonstration_objectives,
  ));
  const finalLedger = attachDemonstrationObjectives(afterSecondRebuild).ledger;
  const currentIds = new Set(finalLedger.unresolved_items.map(item => item.id));
  assert.ok(finalLedger.candidate_elicitations.every(answer => currentIds.has(answer.unresolved_item_id)));
  assert.ok(finalLedger.demonstration_objectives.every(objective => currentIds.has(objective.target_unresolved_item_id)));
  assert.ok(!finalLedger.candidate_elicitations.some(answer => answer.unresolved_item_id === firstId));
  assert.deepEqual(finalLedger.candidate_elicitations.map(answer => answer.id), ["EL-SECOND"]);
});

test("runtime report provenance uses the checked-out trusted SHA, not the dispatch SHA", async () => {
  const checkedOutSha = "a".repeat(40);
  const dispatchSha = "b".repeat(40);
  assert.equal(verifyRuntimeCommit(checkedOutSha, checkedOutSha), checkedOutSha);
  assert.notEqual(verifyRuntimeCommit(checkedOutSha, checkedOutSha), dispatchSha);
  assert.throws(() => verifyRuntimeCommit(checkedOutSha, dispatchSha), /trusted runtime SHA/i);

  const script = await readFile("scripts/d15-real-session-shadow.ts", "utf8");
  const workflow = await readFile(".github/workflows/e1-privileged-runtime.yml", "utf8");
  assert.match(script, /execFileSync\("git",\s*\["rev-parse",\s*"HEAD"\]/);
  assert.match(script, /verifyRuntimeCommit\(checkedOutRuntimeSha,\s*process\.env\.E1_TRUSTED_RUNTIME_SHA\)/);
  assert.match(script, /commit:\s*runtimeCommit/);
  assert.doesNotMatch(script, /commit:\s*process\.env\.GITHUB_SHA/);
  assert.match(workflow, /E1_TRUSTED_RUNTIME_SHA=\$\(git rev-parse HEAD\)/);
});

test("D16 full chain preserves fail-closed support-judge completion for omitted facets", async () => {
  const previousIncompleteFlag = process.env.SUPPORT_JUDGE_INCOMPLETE_TEST;
  const previousOpenAIKey = process.env.OPENAI_API_KEY;
  process.env.SUPPORT_JUDGE_INCOMPLETE_TEST = "1";
  process.env.OPENAI_API_KEY = "test-key";
  const session = {
    id: "CHAIN-TEST",
    user_id: "USER-TEST",
    title: "Finance Manager",
    cv_text: "I managed finance",
    job_description: "Manage finance",
    cv_analysis: null,
    interview_strategy: null,
    preparation_language: "en",
    preparation_purpose: "INTERVIEW",
    interview_date: null,
    coaching_focus: null,
    job_description_url: null,
    status: "ACTIVE",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as any;

  try {
    const result = await runD16ShadowRuntimeIntegration(session);
    const judgments = result.ledger.support_judgments;
    assert.equal(judgments.length, 1);
    assert.equal(judgments[0]?.facet_id, "F-1");
    assert.equal(judgments[0]?.status, "NONE");
    assert.equal(judgments[0]?.abstained, true);
    assert.deepEqual(judgments[0]?.supporting_evidence_ids, []);
    assert.equal(judgments[0]?.confidence, 0);
  } finally {
    if (previousIncompleteFlag === undefined) delete process.env.SUPPORT_JUDGE_INCOMPLETE_TEST;
    else process.env.SUPPORT_JUDGE_INCOMPLETE_TEST = previousIncompleteFlag;
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAIKey;
  }
});
