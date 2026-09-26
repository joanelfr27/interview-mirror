import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CANDIDATE_EXTRACTION_SYSTEM_PROMPT } from "@/lib/canonical-shadow-extractor";

describe("E1 candidate extractor prompt contract", () => {
  it("requires verbatim source quotes and omission when exact grounding is unavailable", () => {
    assert.ok(CANDIDATE_EXTRACTION_SYSTEM_PROMPT.includes(
      "source_quote MUST be copied verbatim from the CV",
    ));
    assert.ok(CANDIDATE_EXTRACTION_SYSTEM_PROMPT.includes(
      "If you cannot produce an exact source quote, DO NOT return the atom.",
    ));
    assert.ok(CANDIDATE_EXTRACTION_SYSTEM_PROMPT.includes(
      "Every atom must have a source_quote that appears exactly in the supplied CV.",
    ));
  });

  it("requires grounded outcomes for OUTCOME_CLAIM atoms", () => {
    assert.ok(CANDIDATE_EXTRACTION_SYSTEM_PROMPT.includes(
      "If assertion_type is OUTCOME_CLAIM, outcome MUST be non-null",
    ));
    assert.ok(CANDIDATE_EXTRACTION_SYSTEM_PROMPT.includes(
      "outcome MUST be non-null and MUST be an exact contiguous phrase from that same source_quote.",
    ));
    assert.ok(CANDIDATE_EXTRACTION_SYSTEM_PROMPT.includes(
      "Never label an atom OUTCOME_CLAIM when no explicit outcome is stated.",
    ));
    assert.ok(CANDIDATE_EXTRACTION_SYSTEM_PROMPT.includes(
      "If there is no explicit outcome phrase in the source_quote, use another assertion_type or omit the atom.",
    ));
  });
});
