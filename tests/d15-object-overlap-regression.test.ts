import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProfessionalMirror } from "@/lib/professional-mirror";

function ledgerFor(objectA: string, objectB: string) {
  const atoms = [
    {
      id: "EV-A",
      source_span_id: "SPAN-A",
      source_quote: `Worked on ${objectA}.`,
      object: objectA,
    },
    {
      id: "EV-B",
      source_span_id: "SPAN-B",
      source_quote: `Supported ${objectB}.`,
      object: objectB,
    },
  ];

  return {
    source_spans: atoms.map((atom) => ({
      id: atom.source_span_id,
      document_id: "CV-1",
      text: atom.source_quote,
      start_offset: 0,
      end_offset: atom.source_quote.length,
      language: "en",
    })),
    evidence: atoms.map((atom) => ({
      id: atom.id,
      source_span_id: atom.source_span_id,
      provenance: {
        source_type: "CV" as const,
        language: "en" as const,
        extraction_method: "PARSER" as const,
      },
      subject: { actor: "candidate", ownership: "INDIVIDUAL" as const },
      action: {
        normalized_action: atom.id === "EV-A" ? "worked" : "supported",
        object: atom.object,
      },
      context: {},
      scale: {},
      time: {},
      outcome: null,
      assertion: {
        type: "RESPONSIBILITY" as const,
        polarity: "AFFIRMATIVE" as const,
      },
      verifiability: {
        has_quantifiable_metric: false,
        has_third_party_entity: false,
        has_time_anchor: false,
      },
      extraction_confidence: 1,
    })),
    requirements: [],
    support_judgments: [],
    requirement_statuses: [],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
}

describe("D15 object-overlap regression guardrail", () => {
  const weakModifierPairs: Array<[string, string]> = [
    ["financial reporting", "financial controls"],
    ["regional finance", "regional sales"],
    ["strategic planning", "strategic controls"],
    ["operational management", "operational reporting"],
    ["global finance", "global sales"],
    ["commercial strategy", "commercial operations"],
    ["customer success", "customer strategy"],
    ["enterprise architecture", "enterprise sales"],
    ["technical support", "technical reporting"],
    ["performance management", "performance reporting"],
    ["digital transformation", "digital marketing"],
    ["international finance", "international sales"],
    ["risk reporting", "risk controls"],
    ["market analysis", "market strategy"],
    ["product strategy", "product marketing"],
    ["service management", "service reporting"],
  ];

  for (const [left, right] of weakModifierPairs) {
    it(`does not connect broad modifier overlap: ${left} ↔ ${right}`, () => {
      const mirror = buildProfessionalMirror(
        ledgerFor(left, right) as never,
      );

      assert.equal(
        mirror.threads.length,
        0,
        `Expected no thread for weak object overlap: ${left} ↔ ${right}`,
      );
    });
  }

  const alreadyExcludedGenericPairs: Array<[string, string]> = [
    ["project management", "project reporting"],
    ["process improvement", "process controls"],
    ["team leadership", "team reporting"],
  ];

  for (const [left, right] of alreadyExcludedGenericPairs) {
    it(`keeps generic-only overlap excluded: ${left} ↔ ${right}`, () => {
      const mirror = buildProfessionalMirror(
        ledgerFor(left, right) as never,
      );

      assert.equal(mirror.threads.length, 0);
    });
  }

  const legitimateSingleTokenPairs: Array<[string, string]> = [
    ["finance reporting", "finance controls"],
    ["treasury forecasting", "treasury reporting"],
    ["SAP implementation", "SAP implementation"],
    ["financial reporting", "financial reporting"],
    ["regulatory compliance", "regulatory reporting"],
    ["payroll administration", "payroll reporting"],
    ["audit planning", "audit execution"],
    ["supply chain", "supply chain"],
  ];

  for (const [left, right] of legitimateSingleTokenPairs) {
    it(`preserves substantive single-token overlap: ${left} ↔ ${right}`, () => {
      const mirror = buildProfessionalMirror(
        ledgerFor(left, right) as never,
      );

      assert.equal(
        mirror.threads.length,
        1,
        `Expected a legitimate thread for: ${left} ↔ ${right}`,
      );
      assert.equal(mirror.threads[0].connection_reason, "SHARED_OBJECT");
    });
  }
  it("allows substantive thread connections across different ownership scopes", () => {
    const base = ledgerFor("finance reporting", "finance controls") as any;
    base.evidence[0].subject.ownership = "INDIVIDUAL";
    base.evidence[1].subject.ownership = "TEAM";

    const mirror = buildProfessionalMirror(base);

    assert.equal(mirror.threads.length, 1);
    assert.equal(mirror.threads[0].connection_reason, "SHARED_OBJECT");
    assert.match(mirror.threads[0].label, /Personally/);
  });

  it("allows shared-tool connections across individual and supervised evidence", () => {
    const base = ledgerFor("SAP implementation", "SAP reporting") as any;
    base.evidence[0].subject.ownership = "INDIVIDUAL";
    base.evidence[1].subject.ownership = "SUPERVISED";
    base.evidence[0].context = { tools_or_systems: ["SAP"] };
    base.evidence[1].context = { tools_or_systems: ["SAP"] };

    const mirror = buildProfessionalMirror(base);

    assert.equal(mirror.threads.length, 1);
    assert.equal(mirror.threads[0].connection_reason, "SHARED_OBJECT");
  });

  it("connects French inflection variants when the substantive object is the same", () => {
    const base = ledgerFor("les déclarations fiscales et les audits statutaires", "les contrôles fiscaux") as any;
    base.source_spans.forEach((span: any) => { span.language = "fr"; });
    base.evidence.forEach((atom: any) => { atom.provenance.language = "fr"; });

    const mirror = buildProfessionalMirror(base);

    assert.equal(mirror.threads.length, 1);
    assert.equal(mirror.threads[0].connection_reason, "SHARED_OBJECT");
  });

  it("keeps ownership visible in thread labels after cross-ownership connection", () => {
    const base = ledgerFor("finance reporting", "finance controls") as any;
    base.evidence[0].subject.ownership = "INDIVIDUAL";
    base.evidence[1].subject.ownership = "TEAM";

    const mirror = buildProfessionalMirror(base);

    assert.equal(mirror.threads.length, 1);
    assert.ok(mirror.threads[0].label.includes("Personally") || mirror.threads[0].label.includes("As a team"));
  });

});
