import assert from "node:assert/strict";
import test from "node:test";
import { downgradeUngroundedOutcomeClaim } from "@/lib/canonical-shadow-extractor";

const base = {
  id: "A1",
  source_quote: "I improved reporting.",
  actor: "candidate",
  ownership: "UNKNOWN" as const,
  normalized_action: "improved",
  object: "reporting",
  domain: null,
  jurisdiction: null,
  situation: null,
  tools_or_systems: [],
  standards: [],
  quantity: null,
  currency: null,
  team_size: null,
  scope: null,
  start: null,
  end: null,
  recency: null,
  outcome: null,
  assertion_type: "OUTCOME_CLAIM" as const,
  polarity: "AFFIRMATIVE" as const,
  has_quantifiable_metric: false,
  has_third_party_entity: false,
  has_time_anchor: false,
  extraction_confidence: 1,
};

test("ungrounded OUTCOME_CLAIM is conservatively downgraded to STATED", () => {
  const result = downgradeUngroundedOutcomeClaim(
    { ...base, outcome: "20% faster" },
    base.source_quote,
  );
  assert.equal(result.assertion_type, "STATED");
  assert.equal(result.outcome, null);
});

test("grounded OUTCOME_CLAIM remains an OUTCOME_CLAIM", () => {
  const result = downgradeUngroundedOutcomeClaim(
    { ...base, outcome: "improved reporting" },
    base.source_quote,
  );
  assert.equal(result.assertion_type, "OUTCOME_CLAIM");
  assert.equal(result.outcome, "improved reporting");
});
