import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildD16DependencySnapshot, buildD16Strategy, validateD16Inputs, validateD16Strategy, type D16Inputs, type D16Strategy } from "@/lib/d16-personalized-interview-strategy";

function fixture(overrides: Partial<D16Inputs> = {}): D16Inputs {
  const canonical = [
    { id: "REQ-A", normalized_requirement: "Lead regional financial reporting" },
    { id: "REQ-B", normalized_requirement: "Advanced treasury management" },
    { id: "REQ-C", normalized_requirement: "French stakeholder communication" },
    { id: "REQ-D", normalized_requirement: "Strategic transformation leadership" },
  ];
  const evidence = [
    { evidence_id: "EV-A", source_span_id: "SPAN-A", source_quote: "Led regional financial reporting for multiple countries.", source_type: "CV" as const },
    { evidence_id: "EV-B", source_span_id: "SPAN-B", source_quote: "Supported treasury processes.", source_type: "CV" as const },
  ];
  const bridge = {
    version: "d6-v1" as const,
    requirements: [
      { requirement_id: "REQ-A", normalized_requirement: canonical[0].normalized_requirement, status: "SUPPORTED" as const, route_mode: "DIRECT" as const, fit_state: "ESTABLISHED", gap_classification: "EXPERIENCE_GAP", preparation_state: "READY_TO_DEMONSTRATE", strategy_action: "DEMONSTRATE" as const, evidence: [{ evidence_id: "EV-A", source_span_id: "SPAN-A", source_quote: evidence[0].source_quote, support_status: "DIRECT" }], unresolved_item_ids: [], demonstration_objective_ids: ["OBJ-A"], boundaries: [{ permitted_claims: ["Regional reporting"], prohibited_claims: ["Claiming transformation leadership"] }] },
      { requirement_id: "REQ-B", normalized_requirement: canonical[1].normalized_requirement, status: "PARTIAL" as const, route_mode: "TRANSFERABLE" as const, fit_state: "PARTIAL", gap_classification: "TRANSFERABLE", preparation_state: "PREPARE_TRANSFER", strategy_action: "POSITION_TRANSFER" as const, evidence: [{ evidence_id: "EV-B", source_span_id: "SPAN-B", source_quote: evidence[1].source_quote, support_status: "PARTIAL" }], unresolved_item_ids: ["U-B"], demonstration_objective_ids: ["OBJ-B"], boundaries: [{ permitted_claims: ["Treasury process support"], prohibited_claims: ["Claiming full treasury ownership"] }] },
      { requirement_id: "REQ-C", normalized_requirement: canonical[2].normalized_requirement, status: "UNRESOLVED" as const, route_mode: "VERIFY_GAP" as const, fit_state: "UNRESOLVED", gap_classification: "EVIDENCE_GAP", preparation_state: "VERIFY_BEFORE_INTERVIEW", strategy_action: "VERIFY_GAP" as const, evidence: [], unresolved_item_ids: ["U-C"], demonstration_objective_ids: [], boundaries: [{ permitted_claims: [], prohibited_claims: ["Claiming French stakeholder experience without evidence"] }] },
      { requirement_id: "REQ-D", normalized_requirement: canonical[3].normalized_requirement, status: "CONTRADICTED" as const, route_mode: "VERIFY_GAP" as const, fit_state: "CONTRADICTED", gap_classification: "EXPERIENCE_GAP", preparation_state: "DEFEND_BOUNDARY", strategy_action: "DEFEND_BOUNDARY" as const, evidence: [{ evidence_id: "EV-A", source_span_id: "SPAN-A", source_quote: evidence[0].source_quote, support_status: "CONTRADICTORY" }], unresolved_item_ids: ["U-D"], demonstration_objective_ids: [], boundaries: [{ permitted_claims: [], prohibited_claims: ["Claiming transformation leadership"] }] },
    ],
  };
  const rcm = {
    version: "rcm-v1" as const, model_id: "rcm-test", role_family: "finance", role_title: "Finance Manager",
    requirements: canonical.map((r, i) => ({
      capability_id: "CAP-" + (i + 1), normalized_requirement: r.normalized_requirement,
      baseline_criticality: (i < 2 ? "CRITICAL" : i === 2 ? "IMPORTANT" : "SUPPORTING") as "CRITICAL" | "IMPORTANT" | "SUPPORTING",
      source: { source_type: "ADMIN_CURATED" as const, source_id: "test", source_version: "1" },
      canonical_requirement_id: r.id,
    })),
  };
  const ledger = {
    source_spans: evidence.map((e) => ({ id: e.source_span_id, document_id: "CV-1", text: e.source_quote, start_offset: 0, end_offset: e.source_quote.length, language: "en" })),
    evidence: evidence.map((e) => ({ id: e.evidence_id, source_span_id: e.source_span_id, provenance: { source_type: e.source_type, language: "en", extraction_method: "PARSER" as const }, subject: { actor: "candidate", ownership: "INDIVIDUAL" as const }, action: { normalized_action: "managed", object: "financial reporting" }, context: {}, scale: {}, time: {}, outcome: null, assertion: { type: "RESPONSIBILITY" as const, polarity: "AFFIRMATIVE" as const }, verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false }, extraction_confidence: 1 })),
    requirements: [], support_judgments: [], requirement_statuses: [], unresolved_items: [], candidate_elicitations: [], demonstration_objectives: [],
  };
  const mirror = { version: "d15-v1" as const, evidence: evidence.map((e) => ({ evidence_id: e.evidence_id, source_span_id: e.source_span_id, source_quote: e.source_quote, source_type: e.source_type })), threads: [], statements: [], story: { opening: "x", opening_statement_id: null, threads: [] } };
  const input = { mirror, bridge, role_capability_model: rcm, ledger, canonical_requirements: canonical, jd_present: false, jd_fingerprint: null, dependency_snapshot: null, ...overrides } as D16Inputs;
  input.dependency_snapshot = buildD16DependencySnapshot(input);
  return input;
}

describe("D16 personalized interview strategy", () => {
  it("selects deterministically with canonical status precedence and caps output at three", () => {
    const strategy = buildD16Strategy(fixture());
    assert.equal(strategy.tensions.length, 3);
    assert.deepEqual(strategy.tensions.map((t) => t.requirement_id), ["REQ-D", "REQ-C", "REQ-B"]);
    assert.deepEqual(strategy.tensions.map((t) => t.preparation_priority), [1, 2, 3]);
  });

  it("allows zero tensions when nothing is eligible", () => {
    const input = fixture();
    input.bridge.requirements = [input.bridge.requirements[0]];
    input.canonical_requirements = [input.canonical_requirements[0]];
    input.role_capability_model.requirements = [input.role_capability_model.requirements[0]];
    input.dependency_snapshot = buildD16DependencySnapshot(input);
    const strategy = buildD16Strategy(input);
    assert.equal(strategy.tensions.length, 0);
  });

  it("keeps assessment relevance separate from baseline criticality", () => {
    const input = fixture({ assessment_context: { version: "assessment-context-v1", context_id: "A1", requirement_relevance: { "REQ-B": "HIGH", "REQ-D": "LOW" } } });
    const strategy = buildD16Strategy(input);
    const b = strategy.tensions.find((t) => t.requirement_id === "REQ-B")!;
    assert.equal(b.role_criticality, "CRITICAL");
    assert.equal(b.assessment_relevance, "HIGH");
  });

  it("represents mixed evidence distinctly", () => {
    const input = fixture();
    input.bridge.requirements[1].evidence = [
      { evidence_id: "EV-B", source_span_id: "SPAN-B", source_quote: "Supported treasury processes.", support_status: "PARTIAL" },
      { evidence_id: "EV-A", source_span_id: "SPAN-A", source_quote: "Led regional financial reporting for multiple countries.", support_status: "CONTRADICTORY" },
    ];
    const strategy = buildD16Strategy(input);
    assert.equal(strategy.tensions.find((t) => t.requirement_id === "REQ-B")?.evidence_reference_mode, "MIXED_EVIDENCE");
  });

  it("fails closed on forged evidence references", () => {
    const input = fixture();
    input.bridge.requirements[0].evidence[0].evidence_id = "FORGED";
    assert.throws(() => buildD16Strategy(input), /forged or missing evidence/);
  });

  it("fails closed on unknown requirements and malformed assessment context", () => {
    const input = fixture({ assessment_context: { version: "assessment-context-v1", context_id: "A1", requirement_relevance: { "UNKNOWN": "HIGH" } } });
    const validation = validateD16Inputs(input);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes("unknown requirement")));
  });

  it("routes every selected tension to prep, practice and evaluation with traceability", () => {
    const strategy = buildD16Strategy(fixture());
    assert.equal(strategy.actions.length, strategy.tensions.length * 3);
    for (const action of strategy.actions) {
      const tension = strategy.tensions.find((t) => t.requirement_id === action.requirement_id)!;
      assert.deepEqual(action.evidence_ids, tension.evidence_ids);
      assert.equal(action.canonical_status, tension.canonical_status);
      assert.equal(action.role_criticality, tension.role_criticality);
      assert.equal(action.assessment_context, null);
      assert.ok(["PREP", "PRACTICE", "EVALUATION"].includes(action.dispatcher));
    }
  });

  it("propagates the exact validated Assessment Context to every action", () => {
    const assessment_context = {
      version: "assessment-context-v1" as const,
      context_id: "A1",
      requirement_relevance: { "REQ-B": "HIGH" as const, "REQ-D": "UNKNOWN" as const },
    };
    const input = fixture({ assessment_context });
    const strategy = buildD16Strategy(input);
    for (const action of strategy.actions) {
      assert.deepEqual(action.assessment_context, assessment_context);
    }

    const tampered = structuredClone(strategy);
    tampered.actions[0].assessment_context!.context_id = "FORGED";
    assert.equal(validateD16Strategy(tampered, input).valid, false);
  });

  it("fails closed when a material dependency becomes stale", () => {
    const input = fixture();
    const snapshot = input.dependency_snapshot;

    const changedMirror = structuredClone(input);
    changedMirror.mirror.evidence[0].source_quote = "Changed evidence.";
    assert.equal(validateD16Inputs(changedMirror).valid, false);

    const changedRcm = structuredClone(input);
    changedRcm.role_capability_model.requirements[0].baseline_criticality = "SUPPORTING";
    assert.equal(validateD16Inputs(changedRcm).valid, false);

    const changedJd = { ...input, jd_present: true, jd_fingerprint: "sha256:changed" };
    assert.equal(validateD16Inputs(changedJd).valid, false);

    const withAssessment = fixture({ assessment_context: { version: "assessment-context-v1", context_id: "A1", requirement_relevance: { "REQ-B": "HIGH" } } });
    const changedAssessment = structuredClone(withAssessment);
    changedAssessment.assessment_context!.context_id = "A2";
    assert.equal(validateD16Inputs(changedAssessment).valid, false);

    assert.deepEqual(input.dependency_snapshot, snapshot);
  });

  it("uses deterministic evidence strength and provenance as a final ordering tie-break", () => {
    const input = fixture();
    input.canonical_requirements[2] = { id: "REQ-C", normalized_requirement: "Advanced treasury management" };
    input.bridge.requirements[2] = {
      ...input.bridge.requirements[2],
      normalized_requirement: "Advanced treasury management",
      status: "PARTIAL" as const,
      route_mode: "TRANSFERABLE" as const,
      fit_state: "PARTIAL",
      gap_classification: "TRANSFERABLE",
      preparation_state: "PREPARE_PARTIAL",
      strategy_action: "DEMONSTRATE_PARTIAL" as const,
      evidence: [],
    };
    input.role_capability_model.requirements[2] = {
      ...input.role_capability_model.requirements[2],
      normalized_requirement: "Advanced treasury management",
      baseline_criticality: "CRITICAL" as const,
    };
    input.dependency_snapshot = buildD16DependencySnapshot(input);
    const strategy = buildD16Strategy(input);
    const partials = strategy.tensions.filter((t) => t.canonical_status === "PARTIAL");
    assert.equal(partials[0].requirement_id, "REQ-B");
    assert.equal(partials[1].requirement_id, "REQ-C");
  });

  it("handles French contextual vocabulary without creating a false delta", () => {
    const input = fixture();
    const frenchQuote = "Gère les rapports financiers régionaux.";
    input.canonical_requirements = [{ id: "REQ-A", normalized_requirement: "Gérer les rapports financiers régionaux" }];
    input.bridge.requirements = [{
      ...input.bridge.requirements[0],
      normalized_requirement: "Gérer les rapports financiers régionaux",
      route_mode: "TRANSFERABLE" as const,
      evidence: [{ ...input.bridge.requirements[0].evidence[0], source_quote: frenchQuote }],
    }];
    input.role_capability_model.requirements = [{
      ...input.role_capability_model.requirements[0],
      normalized_requirement: "Gérer les rapports financiers régionaux",
    }];
    input.mirror.evidence = [{ ...input.mirror.evidence[0], source_quote: frenchQuote }];
    input.ledger.source_spans = [{ ...input.ledger.source_spans[0], text: frenchQuote }];
    input.ledger.evidence = [{ ...input.ledger.evidence[0], source_span_id: "SPAN-A" }];
    input.dependency_snapshot = buildD16DependencySnapshot(input);
    const strategy = buildD16Strategy(input);
    const tension = strategy.tensions.find((t) => t.requirement_id === "REQ-A");
    assert.equal(tension?.contextual_delta.ownership, false);
    assert.equal(tension?.contextual_delta.scope, false);
  });

  it("pins D6 and RCM versions and rejects invalid strategy state", () => {
    const input = fixture();
    const strategy = buildD16Strategy(input);
    const invalid = { ...strategy, d6_version: "other" as "d6-v1" };
    assert.equal(validateD16Strategy(invalid, input).valid, false);
  });

  it("does not invent a tension for a fully supported direct requirement without contextual delta", () => {
    const input = fixture();
    input.bridge.requirements = [input.bridge.requirements[0]];
    input.canonical_requirements = [input.canonical_requirements[0]];
    input.role_capability_model.requirements = [input.role_capability_model.requirements[0]];
    input.dependency_snapshot = buildD16DependencySnapshot(input);
    const strategy = buildD16Strategy(input);
    assert.equal(strategy.tensions.length, 0);
  });

  it("ranks higher criticality first within the same canonical status", () => {
    const input = fixture();
    input.bridge.requirements[2] = {
      ...input.bridge.requirements[2],
      status: "PARTIAL" as const,
      route_mode: "TRANSFERABLE" as const,
      fit_state: "PARTIAL",
      gap_classification: "TRANSFERABLE",
      preparation_state: "PREPARE_PARTIAL",
      strategy_action: "DEMONSTRATE_PARTIAL" as const,
    };
    const strategy = buildD16Strategy(input);
    const partials = strategy.tensions.filter((t) => t.canonical_status === "PARTIAL");
    assert.deepEqual(partials.map((t) => t.requirement_id), ["REQ-B", "REQ-C"]);
    assert.equal(partials[0].role_criticality, "CRITICAL");
    assert.equal(partials[1].role_criticality, "IMPORTANT");
  });

  it("fails closed on malformed top-level D16 dependencies", () => {
    const input = fixture();
    for (const key of ["bridge", "mirror", "role_capability_model", "ledger"] as const) {
      const malformed = { ...input, [key]: null } as unknown as D16Inputs;
      assert.doesNotThrow(() => validateD16Inputs(malformed));
      assert.equal(validateD16Inputs(malformed).valid, false);
    }
    const malformedAssessment = { ...input, assessment_context: [] } as unknown as D16Inputs;
    assert.doesNotThrow(() => validateD16Inputs(malformedAssessment));
    assert.equal(validateD16Inputs(malformedAssessment).valid, false);
    assert.doesNotThrow(() => validateD16Inputs(null as unknown as D16Inputs));
    assert.equal(validateD16Inputs(null as unknown as D16Inputs).valid, false);
  });

  it("rejects unsupported Assessment Context fields", () => {
    const input = fixture({
      assessment_context: {
        version: "assessment-context-v1",
        context_id: "A1",
        requirement_relevance: { "REQ-B": "HIGH" },
      },
    });
    (input.assessment_context as any).unexpected = "ignored";
    const validation = validateD16Inputs(input);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes("unsupported field")));
  });

  it("recognizes common ownership verb variants for contextual delta", () => {
    const input = fixture();
    input.canonical_requirements = [input.canonical_requirements[0]];
    input.bridge.requirements = [{ ...input.bridge.requirements[0], normalized_requirement: "Manage regional financial reporting", route_mode: "TRANSFERABLE" as const }];
    input.role_capability_model.requirements = [{ ...input.role_capability_model.requirements[0], normalized_requirement: "Manage regional financial reporting" }];
    input.canonical_requirements[0] = { id: "REQ-A", normalized_requirement: "Manage regional financial reporting" };
    input.dependency_snapshot = buildD16DependencySnapshot(input);
    const strategy = buildD16Strategy(input);
    const tension = strategy.tensions.find((t) => t.requirement_id === "REQ-A");
    assert.equal(tension?.contextual_delta.ownership, false);
  });

  it("fails closed when canonical or D6 requirements are not arrays", () => {
    const input = fixture();
    const malformedCanonical = { ...input, canonical_requirements: "invalid" } as unknown as D16Inputs;
    const canonicalValidation = validateD16Inputs(malformedCanonical);
    assert.equal(canonicalValidation.valid, false);
    assert.ok(canonicalValidation.errors.some((e) => e.includes("canonical requirements must be an array")));

    const malformedBridge = { ...input, bridge: { ...input.bridge, requirements: "invalid" } } as unknown as D16Inputs;
    const bridgeValidation = validateD16Inputs(malformedBridge);
    assert.equal(bridgeValidation.valid, false);
    assert.ok(bridgeValidation.errors.some((e) => e.includes("D6 bridge requirements must be an array")));
  });

  it("fails closed on malformed nested evidence and context structures", () => {
    const cases: D16Inputs[] = [
      { ...fixture(), canonical_requirements: [null as never] },
      { ...fixture(), bridge: { ...fixture().bridge, requirements: [null as never] } },
      { ...fixture(), bridge: { ...fixture().bridge, requirements: [{ ...fixture().bridge.requirements[0], evidence: null as never }] } },
      { ...fixture(), bridge: { ...fixture().bridge, requirements: [{ ...fixture().bridge.requirements[0], evidence: [null as never] }] } },
      { ...fixture(), bridge: { ...fixture().bridge, requirements: [{ ...fixture().bridge.requirements[0], evidence: [{ ...fixture().bridge.requirements[0].evidence[0], source_quote: "" }] }] } },
      { ...fixture(), mirror: { ...fixture().mirror, evidence: null as never } },
      { ...fixture(), ledger: { ...fixture().ledger, evidence: null as never } },
      { ...fixture(), ledger: { ...fixture().ledger, source_spans: null as never } },
      { ...fixture({ assessment_context: { version: "assessment-context-v1", context_id: "A1", requirement_relevance: {} } }), assessment_context: { version: "assessment-context-v1", context_id: "A1", requirement_relevance: null as never } },
    ];
    for (const malformed of cases) {
      assert.doesNotThrow(() => validateD16Inputs(malformed));
      assert.equal(validateD16Inputs(malformed).valid, false);
    }
  });

  it("rejects tampered derived tension and action fields", () => {
    const input = fixture();
    const strategy = buildD16Strategy(input);

    const priorityTamper = structuredClone(strategy);
    priorityTamper.tensions[0].preparation_priority = 99;
    assert.equal(validateD16Strategy(priorityTamper, input).valid, false);

    const vulnerabilityTamper = structuredClone(strategy);
    vulnerabilityTamper.tensions[0].interview_vulnerability = "The candidate is weak.";
    assert.equal(validateD16Strategy(vulnerabilityTamper, input).valid, false);

    const provenanceTamper = structuredClone(strategy);
    provenanceTamper.tensions[0].evidence_provenance_ids = ["FORGED-SPAN"];
    assert.equal(validateD16Strategy(provenanceTamper, input).valid, false);

    const actionTamper = structuredClone(strategy);
    actionTamper.actions[0].practice_target = "Claim the experience regardless of evidence.";
    assert.equal(validateD16Strategy(actionTamper, input).valid, false);
  });

  it("requires the exact deterministic three-action dispatch per selected tension", () => {
    const input = fixture();
    const strategy = buildD16Strategy(input);
    strategy.actions = strategy.actions.slice(0, -1);
    assert.equal(validateD16Strategy(strategy, input).valid, false);
  });

  it("fails closed when strategy or strategy collections are malformed", () => {
    const input = fixture();
    assert.doesNotThrow(() => validateD16Strategy(null as unknown as D16Strategy, input));
    assert.equal(validateD16Strategy(null as unknown as D16Strategy, input).valid, false);

    const malformedTensions = { ...buildD16Strategy(input), tensions: null } as unknown as D16Strategy;
    assert.doesNotThrow(() => validateD16Strategy(malformedTensions, input));
    assert.equal(validateD16Strategy(malformedTensions, input).valid, false);

    const malformedActions = { ...buildD16Strategy(input), actions: null } as unknown as D16Strategy;
    assert.doesNotThrow(() => validateD16Strategy(malformedActions, input));
    assert.equal(validateD16Strategy(malformedActions, input).valid, false);
  });

  it("keeps no-JD mode valid", () => {
    const strategy = buildD16Strategy(fixture({ jd_present: false }));
    assert.equal(strategy.jd_present, false);
    assert.equal(strategy.d6_version, "d6-v1");
  });
});
