import { describe, expect, it } from "node:test";
import { CANDIDATE_EXTRACTION_SYSTEM_PROMPT } from "@/lib/canonical-shadow-extractor";

describe("E1 candidate extractor prompt contract", () => {
  it("requires verbatim source quotes and omission when exact grounding is unavailable", () => {
    expect(CANDIDATE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "source_quote MUST be copied verbatim from the CV",
    );
    expect(CANDIDATE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "If you cannot produce an exact source quote, DO NOT return the atom.",
    );
    expect(CANDIDATE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "Every atom must have a source_quote that appears exactly in the supplied CV.",
    );
  });

  it("requires grounded outcomes for OUTCOME_CLAIM atoms", () => {
    expect(CANDIDATE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "If assertion_type is OUTCOME_CLAIM, outcome MUST be non-null",
    );
    expect(CANDIDATE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "outcome MUST be an exact contiguous phrase from that same source_quote.",
    );
    expect(CANDIDATE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "Never label an atom OUTCOME_CLAIM when no explicit outcome is stated.",
    );
    expect(CANDIDATE_EXTRACTION_SYSTEM_PROMPT).toContain(
      "If there is no explicit outcome phrase in the source_quote, use another assertion_type or omit the atom.",
    );
  });
});
