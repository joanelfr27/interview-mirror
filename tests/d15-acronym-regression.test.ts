import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProfessionalMirror } from "@/lib/professional-mirror";

type TestAtom = {
  id: string;
  source_span_id: string;
  source_quote: string;
  domain: string;
};

function ledgerFor(domainA: string, domainB: string) {
  const atoms: TestAtom[] = [
    {
      id: "EV-A",
      source_span_id: "SPAN-A",
      source_quote: `Worked with ${domainA} transformation initiatives.`,
      domain: domainA,
    },
    {
      id: "EV-B",
      source_span_id: "SPAN-B",
      source_quote: `Supported ${domainB} reporting activities.`,
      domain: domainB,
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
        object: atom.id === "EV-A" ? "transformation initiatives" : "reporting activities",
      },
      context: {
        domain: atom.domain,
      },
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

describe("D15 acronym/domain regression guardrail", () => {
  const professionalTerms = [
    "SAP",
    "ERP",
    "CRM",
    "AWS",
    "GCP",
    "SQL",
    "AI",
    "ATS",
    "HCM",
    "PMO",
    "PMP",
    "ISO",
    "SOX",
    "VAT",
    "GAAP",
    "IFRS",
    "JIRA",
    "GitHub",
    "HRIS",
    "S4HANA",
  ];

  for (const term of professionalTerms) {
    it(`connects repeated domain evidence for ${term}`, () => {
      const mirror = buildProfessionalMirror(
        ledgerFor(term, term) as never,
      );

      assert.equal(
        mirror.threads.length,
        1,
        `Expected ${term} to create a thread from two independent source spans.`,
      );
      assert.equal(mirror.threads[0].connection_reason, "SHARED_DOMAIN");
      assert.deepEqual(
        mirror.threads[0].evidence_ids,
        ["EV-A", "EV-B"],
      );
    });
  }

  it("does not require the acronym to appear in the action object", () => {
    const mirror = buildProfessionalMirror(
      ledgerFor("SAP", "SAP") as never,
    );

    assert.equal(mirror.threads[0]?.connection_reason, "SHARED_DOMAIN");
  });
});
