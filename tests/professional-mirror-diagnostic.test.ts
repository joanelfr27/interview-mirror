import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertProfessionalMirrorConnectionDiagnosticsMatchProduction,
  diagnoseProfessionalMirrorConnections,
  buildProfessionalMirror,
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

  it("asserts the diagnostic matrix exactly matches a second production traversal", () => {
    const ledger = {
      source_spans: [
        { id: "S1", document_id: "CV-1", text: "Managed regional liquidity reporting.", language: "en" },
        { id: "S2", document_id: "CV-1", text: "Managed weekly liquidity reporting.", language: "en" },
      ],
      evidence: [
        atom({ id: "A", source_span_id: "S1", action: { normalized_action: "managed", object: "regional liquidity reporting" }, context: { domain: "finance" } }),
        atom({ id: "B", source_span_id: "S2", action: { normalized_action: "managed", object: "weekly liquidity reporting" }, context: { domain: "finance" } }),
      ],
      requirements: [],
      facets: [],
    } as any;
    const diagnostics = diagnoseProfessionalMirrorConnections(ledger);
    assert.doesNotThrow(() => assertProfessionalMirrorConnectionDiagnosticsMatchProduction(ledger, diagnostics));
    assert.equal(diagnostics.pairs.length, 1);
    assert.equal(diagnostics.pairs[0]?.connection_reason, "SHARED_OBJECT");
  });


  it("exercises every reachable connection mechanism under the production precedence", () => {
    const ledger = {
      source_spans: [
        { id: "S-A", document_id: "CV", text: "Managed regional finance reporting.", language: "en" },
        { id: "S-B", document_id: "CV", text: "Reviewed regional finance dashboards.", language: "en" },
        { id: "S-C", document_id: "CV", text: "Implemented ERP controls.", language: "en" },
        { id: "S-D", document_id: "CV", text: "Audited IFRS controls.", language: "en" },
        { id: "S-E", document_id: "CV", text: "Reconciled treasury balances.", language: "en" },
        { id: "S-F", document_id: "CV", text: "Reconciled treasury accounts.", language: "en" },
        { id: "S-G", document_id: "CV", text: "Managed regional finance reporting for the board.", language: "en" },
      ],
      evidence: [
        atom({
          id: "A",
          source_span_id: "S-A",
          action: { normalized_action: "managed", object: "regional finance reporting" },
          context: { domain: "finance", tools_or_systems: ["ERP-A"], standards: ["IFRS-A"] },
        }),
        atom({
          id: "B",
          source_span_id: "S-B",
          action: { normalized_action: "reviewed", object: "regional finance dashboards" },
          context: { domain: "finance", tools_or_systems: ["BI-B"], standards: ["IFRS-B"] },
        }),
        atom({
          id: "C",
          source_span_id: "S-C",
          action: { normalized_action: "implemented", object: "ERP controls" },
          context: { domain: "technology", tools_or_systems: ["ERP-A"], standards: ["GAAP-C"] },
        }),
        atom({
          id: "D",
          source_span_id: "S-D",
          action: { normalized_action: "audited", object: "IFRS controls" },
          context: { domain: "audit", tools_or_systems: ["Audit-D"], standards: ["IFRS-A"] },
        }),
        atom({
          id: "E",
          source_span_id: "S-E",
          action: { normalized_action: "reconciled", object: "cash balances" },
          context: { domain: "treasury", tools_or_systems: ["Treasury-E"], standards: ["GAAP-E"] },
        }),
        atom({
          id: "F",
          source_span_id: "S-F",
          action: { normalized_action: "reconciled", object: "bank accounts" },
          context: { domain: "treasury", tools_or_systems: ["Treasury-F"], standards: ["GAAP-F"] },
        }),
        atom({
          id: "G",
          source_span_id: "S-G",
          subject: { actor: "candidate", ownership: "TEAM" },
          action: { normalized_action: "managed", object: "regional finance reporting for the board" },
          context: { domain: "finance", tools_or_systems: ["ERP-A"], standards: ["IFRS-A"] },
        }),
      ],
      requirements: [],
      facets: [],
    } as any;

    const diagnostics = diagnoseProfessionalMirrorConnections(ledger);
    assert.doesNotThrow(() =>
      assertProfessionalMirrorConnectionDiagnosticsMatchProduction(ledger, diagnostics),
    );

    const reasons = new Set(
      diagnostics.pairs
        .map((pair) => pair.connection_reason)
        .filter((reason): reason is NonNullable<typeof reason> => reason !== null),
    );

    assert.equal(reasons.has("SHARED_OBJECT"), true);
    assert.equal(reasons.has("SHARED_DOMAIN"), true);
    assert.equal(reasons.has("SHARED_TOOL"), true);
    assert.equal(reasons.has("SHARED_STANDARD"), true);
    assert.equal(reasons.has("REPEATED_ACTION"), false);

    const repeatedActionPair = diagnostics.pairs.find(
      (pair) => pair.left_id === "E" && pair.right_id === "F",
    );
    assert.equal(repeatedActionPair?.connection_reason, "SHARED_DOMAIN");

    // G matches A on object/domain/tool/standard, but the ownership gate must
    // short-circuit every otherwise-eligible connection mechanism.
    const incompatibleOwnershipPair = diagnostics.pairs.find(
      (pair) => pair.left_id === "A" && pair.right_id === "G",
    );
    assert.equal(incompatibleOwnershipPair?.connection_reason, null);
  });


  it("drops English/French function words while preserving substantive nouns", () => {
    assert.equal(diagnosticSignalOverlap("with marketing colleagues", "with project colleagues"), true);
    assert.equal(diagnosticSignalOverlap("with", "with"), false);
    assert.equal(diagnosticSignalOverlap("avec les équipes", "avec les équipes"), false);
    assert.equal(diagnosticSignalOverlap("office database", "office supplies"), true);
  });

  it("keeps role-overview evidence traceable but prevents it from creating D15 edges", () => {
    const ledger = {
      source_spans: [
        {
          id: "S1",
          document_id: "CV-1",
          text: "Responsible for accounting systems.",
          language: "en",
          source_section: "EXPERIENCE_NON_BULLET",
        },
        {
          id: "S2",
          document_id: "CV-1",
          text: "Managed accounting systems.",
          language: "en",
          source_section: "BULLET",
        },
      ],
      evidence: [
        atom({
          id: "A",
          source_span_id: "S1",
          action: { normalized_action: "Responsible", object: "accounting systems" },
        }),
        atom({
          id: "B",
          source_span_id: "S2",
          action: { normalized_action: "Managed", object: "accounting systems" },
        }),
      ],
      requirements: [],
      facets: [],
    } as any;

    const mirror = buildProfessionalMirror(ledger);
    assert.equal(mirror.evidence.length, 2);
    assert.equal(mirror.threads.length, 0);
    assert.equal(mirror.statements.filter((statement) => statement.kind === "FACT").length, 2);
  });

});