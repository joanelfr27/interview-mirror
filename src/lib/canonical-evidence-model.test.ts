import {
  aggregateRequirementStatus,
  validateAtomicEvidence,
  validateDemonstrationEvidenceBinding,
  validateSpanBounds,
  validateSupportJudgment,
  type AtomicEvidence,
  type Requirement,
  type SupportJudgment,
} from "@/lib/canonical-evidence-model";

const atom = (id: string): AtomicEvidence => ({
  id,
  source_span_id: `span-${id}`,
  provenance: {
    source_type: "CV",
    language: "fr",
    extraction_method: "LLM",
  },
  subject: {
    actor: "candidate",
    ownership: "INDIVIDUAL",
  },
  action: {
    normalized_action: "managed",
    object: "accounts payable",
  },
  context: {},
  scale: {},
  time: {},
  outcome: null,
  assertion: { type: "RESPONSIBILITY" },
  verifiability: {
    has_quantifiable_metric: false,
    has_third_party_entity: false,
    has_time_anchor: false,
  },
  extraction_confidence: 0.98,
});

const requirement: Requirement = {
  id: "REQ-1",
  source_span_id: "jd-span-1",
  normalized_requirement: "lead finance operations",
  category: "RESPONSIBILITY",
  salience: "CORE",
  facets: [
    { id: "REQ-1-F1", type: "FUNCTION", requirement: "finance operations", source_span_id: "jd-span-1" },
    { id: "REQ-1-F2", type: "SCOPE", requirement: "regional scope", source_span_id: "jd-span-1" },
  ],
  extraction_confidence: 0.96,
};

const direct: SupportJudgment = {
  id: "SJ-1",
  requirement_id: "REQ-1",
  facet_id: "REQ-1-F1",
  status: "DIRECT",
  supporting_evidence_ids: ["A1"],
  rationale: "The source explicitly states responsibility for finance operations.",
  confidence: 0.94,
  abstained: false,
};

const partial: SupportJudgment = {
  id: "SJ-2",
  requirement_id: "REQ-1",
  facet_id: "REQ-1-F2",
  status: "PARTIAL",
  supporting_evidence_ids: ["A1"],
  rationale: "The function is documented, but the required regional scope is not established.",
  confidence: 0.90,
  abstained: false,
};

describe("canonical evidence model", () => {
  test("accepts an atomic claim without inventing missing scale/outcome", () => {
    expect(validateAtomicEvidence(atom("A1"))).toEqual([]);
  });

  test("rejects invalid source spans", () => {
    expect(validateSpanBounds({
      id: "span-A1",
      document_id: "cv-1",
      text: "managed",
      start_offset: 0,
      end_offset: 7,
      language: "en",
    }, "managed accounts")).toEqual([]);

    expect(validateSpanBounds({
      id: "span-A2",
      document_id: "cv-1",
      text: "invented",
      start_offset: 0,
      end_offset: 7,
      language: "en",
    }, "managed accounts")).toEqual([
      "SourceSpan span-A2 does not exactly match the source document.",
    ]);
  });

  test("aggregates facet-level support without treating partial as full support", () => {
    expect(aggregateRequirementStatus(requirement, [direct, partial])).toBe("PARTIAL");
  });

  test("requires contradictory judgments to cite evidence", () => {
    expect(validateSupportJudgment({
      ...direct,
      status: "CONTRADICTORY",
      supporting_evidence_ids: [],
    })).toContain("CONTRADICTORY support must cite the contradictory evidence.");
  });

  test("allows many-to-many evidence binding", () => {
    const secondAtom = atom("A2");
    const multi: SupportJudgment = {
      ...partial,
      id: "SJ-3",
      supporting_evidence_ids: [atom("A1").id, secondAtom.id],
    };
    expect(validateSupportJudgment(multi)).toEqual([]);
  });

  test("prevents demonstration objectives from referencing unknown facts", () => {
    const errors = validateDemonstrationEvidenceBinding({
      id: "DO-1",
      target_unresolved_item_id: "U-1",
      observable_cue: "Explain the candidate's actual regional scope.",
      supporting_true_atom_ids: ["A1", "UNKNOWN"],
      truthfulness_boundary: {
        permitted_claims: ["State the documented finance responsibility."],
        prohibited_claims: ["Claim regional ownership unless established."],
      },
    }, [atom("A1")]);

    expect(errors).toEqual([
      "DemonstrationObjective DO-1 references unknown atomic evidence UNKNOWN.",
    ]);
  });
});
