import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diagnosticConnectionReason,
  diagnosticSignalOverlap,
} from "@/lib/professional-mirror";
import type { AtomicEvidence } from "@/lib/canonical-evidence-model";

function atom(overrides: Partial<AtomicEvidence> = {}): AtomicEvidence {
  return {
    id: "A",
    source_span_id: "S",
    provenance: {
      source_type: "CV",
      language: "en",
      extraction_method: "PARSER",
    },
    subject: { actor: "candidate", ownership: "INDIVIDUAL" },
    action: { normalized_action: "managed", object: "financial reporting" },
    context: {},
    scale: {},
    time: {},
    outcome: null,
    assertion: { type: "RESPONSIBILITY", polarity: "AFFIRMATIVE" },
    verifiability: {
      has_quantifiable_metric: false,
      has_third_party_entity: false,
      has_time_anchor: false,
    },
    extraction_confidence: 1,
    ...overrides,
  } as AtomicEvidence;
}

describe("D15 diagnostic connection oracle", () => {
  it("uses production first-match ordering and reports SHARED_OBJECT before SHARED_DOMAIN", () => {
    const left = atom({
      action: { normalized_action: "managed", object: "regional liquidity reporting" },
      context: { domain: "financial reporting" },
    });
    const right = atom({
      id: "B",
      action: { normalized_action: "managed", object: "weekly liquidity dashboard" },
      context: { domain: "financial reporting" },
    });

    assert.equal(diagnosticConnectionReason(left, right), "SHARED_OBJECT");
  });

  it("enforces the production ownership gate", () => {
    const left = atom({ subject: { actor: "candidate", ownership: "INDIVIDUAL" } });
    const right = atom({ id: "B", subject: { actor: "candidate", ownership: "TEAM" } });

    assert.equal(diagnosticConnectionReason(left, right), null);
  });

  it("exposes the production overlap primitive without reimplementing matching", () => {
    assert.equal(diagnosticSignalOverlap("regional financial reporting", "financial reporting"), true);
    assert.equal(diagnosticSignalOverlap("team", "team"), false);
  });
});
