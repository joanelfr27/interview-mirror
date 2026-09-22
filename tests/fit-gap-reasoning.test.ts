import test from "node:test";
import assert from "node:assert/strict";
import type { CanonicalReasoningProjection } from "@/lib/canonical-reasoning-adapter";
import { buildFitGapProjection, validateFitGapProjection } from "@/lib/fit-gap-reasoning";

function projection(): CanonicalReasoningProjection {
  return {
    version: "d1-v1",
    requirements: [
      {
        requirement_id: "REQ-1",
        normalized_requirement: "Manage a regional finance function",
        category: "EXPERIENCE",
        salience: "CORE",
        status: "SUPPORTED",
        facets: [
          {
            facet_id: "FACET-1",
            type: "FUNCTION",
            requirement: "Manage regional finance",
            status: "DIRECT",
            evidence: [
              {
                evidence_id: "EV-1",
                source_span_id: "SPAN-1",
                source_quote: "Managed regional finance operations.",
              },
            ],
            rationale: "Directly documented.",
            confidence: 0.95,
          },
        ],
      },
      {
        requirement_id: "REQ-2",
        normalized_requirement: "Lead a transformation",
        category: "LEADERSHIP",
        salience: "IMPORTANT",
        status: "PARTIAL",
        facets: [
          {
            facet_id: "FACET-2",
            type: "OUTCOME",
            requirement: "Lead transformation outcomes",
            status: "PARTIAL",
            evidence: [],
            rationale: "Some evidence exists but outcome is incomplete.",
            confidence: 0.7,
          },
        ],
      },
      {
        requirement_id: "REQ-3",
        normalized_requirement: "Operate in a regulated environment",
        category: "DOMAIN",
        salience: "SUPPORTING",
        status: "UNRESOLVED",
        facets: [
          {
            facet_id: "FACET-3",
            type: "CONTEXT",
            requirement: "Regulated environment",
            status: "NONE",
            evidence: [],
            rationale: null,
            confidence: 0.4,
          },
        ],
      },
      {
        requirement_id: "REQ-4",
        normalized_requirement: "Own a missing capability",
        category: "CAPABILITY",
        salience: "CORE",
        status: "PARTIAL",
        facets: [
          {
            facet_id: "FACET-4",
            type: "FUNCTION",
            requirement: "Own capability",
            status: "PARTIAL",
            evidence: [],
            rationale: null,
            confidence: 0.5,
          },
        ],
      },
    ],
    unresolved_items: [
      {
        unresolved_item_id: "U-3",
        requirement_id: "REQ-3",
        facet_ids: ["FACET-3"],
        type: "ABSENT",
        supporting_evidence: [],
        contradiction_evidence: [],
        elicitation: null,
      },
      {
        unresolved_item_id: "U-4",
        requirement_id: "REQ-4",
        facet_ids: ["FACET-4"],
        type: "AMBIGUOUS",
        supporting_evidence: [],
        contradiction_evidence: [],
        elicitation: {
          id: "EL-4",
          unresolved_item_id: "U-4",
          question: "Have you directly owned this capability?",
          answer: "I have not directly owned it.",
          answer_assertion_type: "ELICITED",
          classification: "EXPERIENCE_GAP",
          classification_rationale: "The candidate explicitly states they have not owned it.",
        },
      },
    ],
    demonstration_objectives: [
      {
        id: "OBJ-3",
        target_unresolved_item_id: "U-3",
        observable_cue: "Explain transferable experience relevant to regulated environments.",
        supporting_true_atom_ids: [],
        truthfulness_boundary: {
          permitted_claims: ["State transferable experience only."],
          prohibited_claims: ["Do not claim direct regulated-environment ownership."],
        },
      },
    ],
  };
}

test("D2 maps requirement-level support into candidate-facing fit states", () => {
  const result = buildFitGapProjection(projection());

  assert.deepEqual(
    result.requirements.map((item) => item.fit_state),
    ["ESTABLISHED", "PARTIAL", "UNRESOLVED", "EXPERIENCE_GAP"],
  );
  assert.equal(result.requirements[0].gap_classification, null);
  assert.equal(result.requirements[2].demonstration_objective_ids[0], "OBJ-3");
  assert.equal(result.requirements[3].gap_classification, "EXPERIENCE_GAP");
});

test("D2 preserves transferable classification without upgrading it to established", () => {
  const source = projection();
  source.requirements[2].status = "UNRESOLVED";
  source.unresolved_items[0].elicitation = {
    id: "EL-3",
    unresolved_item_id: "U-3",
    question: "Can your prior experience transfer?",
    answer: "Yes, in a different domain.",
    answer_assertion_type: "ELICITED",
    classification: "TRANSFERABLE",
    classification_rationale: "The candidate described relevant but non-identical experience.",
  };

  const result = buildFitGapProjection(source);
  assert.equal(result.requirements[2].fit_state, "TRANSFERABLE");
  assert.equal(result.requirements[2].gap_classification, "TRANSFERABLE");
});

test("D2 preserves evidence-gap classification", () => {
  const source = projection();
  source.requirements[2].status = "UNRESOLVED";
  source.unresolved_items[0].elicitation = {
    id: "EL-3",
    unresolved_item_id: "U-3",
    question: "Can you provide evidence?",
    answer: "I did the work but it is not represented in the CV.",
    answer_assertion_type: "ELICITED",
    classification: "EVIDENCE_GAP",
    classification_rationale: "Relevant experience was elicited but was absent from the source material.",
  };

  const result = buildFitGapProjection(source);
  assert.equal(result.requirements[2].fit_state, "EVIDENCE_GAP");
});

test("D2 fail-closes on invalid D1 projections", () => {
  const source = projection();
  source.unresolved_items[0].requirement_id = "UNKNOWN";
  assert.throws(() => buildFitGapProjection(source), /unknown requirement/i);
});

test("D2 validates its own output", () => {
  const result = buildFitGapProjection(projection());
  assert.deepEqual(validateFitGapProjection(result), { valid: true, errors: [] });
});

test("D2 rejects conflicting classifications across multiple unresolved items for one requirement", () => {
  const source = projection();
  source.requirements[2].status = "UNRESOLVED";
  source.unresolved_items[0].elicitation = {
    id: "EL-3",
    unresolved_item_id: "U-3",
    question: "Can you provide evidence?",
    answer: "The experience is not represented in the source material.",
    answer_assertion_type: "ELICITED",
    classification: "EVIDENCE_GAP",
    classification_rationale: "The source material does not contain the evidence.",
  };
  source.unresolved_items.push({
    unresolved_item_id: "U-3B",
    requirement_id: "REQ-3",
    facet_ids: ["FACET-3"],
    type: "AMBIGUOUS",
    supporting_evidence: [],
    contradiction_evidence: [],
    elicitation: {
      id: "EL-3B",
      unresolved_item_id: "U-3B",
      question: "Can your prior experience transfer?",
      answer: "Yes, in a different domain.",
      answer_assertion_type: "ELICITED",
      classification: "TRANSFERABLE",
      classification_rationale: "The candidate described relevant but non-identical experience.",
    },
  });

  assert.throws(
    () => buildFitGapProjection(source),
    /conflicting unresolved-item classifications/i,
  );
});

test("D2 rejects reversed conflicting classification order rather than changing the result", () => {
  const source = projection();
  source.requirements[2].status = "UNRESOLVED";
  source.unresolved_items[0].elicitation = {
    id: "EL-3",
    unresolved_item_id: "U-3",
    question: "Can your prior experience transfer?",
    answer: "Yes, in a different domain.",
    answer_assertion_type: "ELICITED",
    classification: "TRANSFERABLE",
    classification_rationale: "The candidate described relevant but non-identical experience.",
  };
  source.unresolved_items.push({
    unresolved_item_id: "U-3B",
    requirement_id: "REQ-3",
    facet_ids: ["FACET-3"],
    type: "AMBIGUOUS",
    supporting_evidence: [],
    contradiction_evidence: [],
    elicitation: {
      id: "EL-3B",
      unresolved_item_id: "U-3B",
      question: "Have you directly owned this?",
      answer: "No.",
      answer_assertion_type: "ELICITED",
      classification: "EXPERIENCE_GAP",
      classification_rationale: "The candidate explicitly states they have not owned it.",
    },
  });

  const reversed = {
    ...source,
    unresolved_items: [...source.unresolved_items].reverse(),
  };

  assert.throws(
    () => buildFitGapProjection(reversed),
    /conflicting unresolved-item classifications/i,
  );
});

test("D2 validator rejects requirement status and fit-state mismatches", () => {
  const result = buildFitGapProjection(projection());
  result.requirements[0].fit_state = "UNRESOLVED";

  const validation = validateFitGapProjection(result);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" | "), /expected ESTABLISHED/i);
});

test("D2 validator rejects an invalid projection version", () => {
  const result = buildFitGapProjection(projection());
  const invalid = { ...result, version: "not-d2-v1" as "d2-v1" };

  const validation = validateFitGapProjection(invalid);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" | "), /version/i);
});

test("D2 validator rejects empty demonstration objective IDs", () => {
  const result = buildFitGapProjection(projection());
  result.requirements[2].demonstration_objective_ids = [""];

  const validation = validateFitGapProjection(result);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" | "), /demonstration objective ID/i);
});


test("D2 rejects SUPPORTED requirements with an EXPERIENCE_GAP classification", () => {
  const result = buildFitGapProjection(projection());
  result.requirements[0].gap_classification = "EXPERIENCE_GAP";
  result.requirements[0].fit_state = "EXPERIENCE_GAP";

  const validation = validateFitGapProjection(result);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" | "), /SUPPORTED.*gap classification EXPERIENCE_GAP/i);
});

test("D2 rejects SUPPORTED requirements with an EVIDENCE_GAP classification", () => {
  const result = buildFitGapProjection(projection());
  result.requirements[0].gap_classification = "EVIDENCE_GAP";
  result.requirements[0].fit_state = "EVIDENCE_GAP";

  const validation = validateFitGapProjection(result);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" | "), /SUPPORTED.*gap classification EVIDENCE_GAP/i);
});

test("D2 rejects SUPPORTED requirements with a TRANSFERABLE classification", () => {
  const result = buildFitGapProjection(projection());
  result.requirements[0].gap_classification = "TRANSFERABLE";
  result.requirements[0].fit_state = "TRANSFERABLE";

  const validation = validateFitGapProjection(result);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" | "), /SUPPORTED.*gap classification TRANSFERABLE/i);
});

test("D2 allows PARTIAL requirements with an EXPERIENCE_GAP classification", () => {
  const result = buildFitGapProjection(projection());
  result.requirements[1].gap_classification = "EXPERIENCE_GAP";
  result.requirements[1].fit_state = "EXPERIENCE_GAP";

  const validation = validateFitGapProjection(result);
  assert.deepEqual(validation, { valid: true, errors: [] });
});

test("D2 accepts a normal SUPPORTED requirement with no gap classification", () => {
  const result = buildFitGapProjection(projection());
  assert.equal(result.requirements[0].requirement_status, "SUPPORTED");
  assert.equal(result.requirements[0].gap_classification, null);
  assert.equal(result.requirements[0].fit_state, "ESTABLISHED");
  assert.deepEqual(validateFitGapProjection(result), { valid: true, errors: [] });
});
