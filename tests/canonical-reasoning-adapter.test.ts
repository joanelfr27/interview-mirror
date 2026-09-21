import {
  buildCanonicalReasoningProjection,
  validateCanonicalReasoningProjection,
} from "@/lib/canonical-reasoning-adapter";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";

function fixture(): EvidenceLedger {
  return {
    source_spans: [
      { id: "SPAN-A", document_id: "CV", text: "Managed regional reporting.", start_offset: 0, end_offset: 29, language: "en" },
      { id: "SPAN-B", document_id: "JD", text: "Regional financial reporting.", start_offset: 0, end_offset: 28, language: "en" },
    ],
    evidence: [
      {
        id: "A1",
        source_span_id: "SPAN-A",
        provenance: { source_type: "CV", language: "en", extraction_method: "LLM" },
        subject: { actor: "candidate", ownership: "INDIVIDUAL" },
        action: { normalized_action: "managed", object: "regional reporting" },
        context: {},
        scale: {},
        time: {},
        outcome: null,
        assertion: { type: "RESPONSIBILITY", polarity: "AFFIRMATIVE" },
        verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false },
        extraction_confidence: 1,
      },
    ],
    requirements: [
      {
        id: "R1",
        source_span_id: "SPAN-B",
        normalized_requirement: "Regional financial reporting",
        category: "RESPONSIBILITY",
        salience: "CORE",
        facets: [{ id: "R1-F1", type: "FUNCTION", requirement: "Regional financial reporting", source_span_id: "SPAN-B" }],
        extraction_confidence: 1,
      },
    ],
    support_judgments: [
      {
        id: "SJ1",
        requirement_id: "R1",
        facet_id: "R1-F1",
        status: "DIRECT",
        supporting_evidence_ids: ["A1"],
        rationale: "The atom explicitly states regional reporting responsibility.",
        confidence: 1,
        abstained: false,
        support_basis: "DOCUMENTED",
      },
    ],
    requirement_statuses: [{ requirement_id: "R1", status: "SUPPORTED" }],
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
}

const projection = buildCanonicalReasoningProjection(fixture());
if (projection.version !== "d1-v1") throw new Error("Projection version mismatch.");
if (projection.requirements[0]?.status !== "SUPPORTED") throw new Error("Requirement status was not projected.");
if (projection.requirements[0]?.facets[0]?.status !== "DIRECT") throw new Error("Facet support was not projected.");
if (projection.requirements[0]?.facets[0]?.evidence[0]?.source_quote !== "Managed regional reporting.") {
  throw new Error("Source-grounded evidence quote was not preserved.");
}

const validation = validateCanonicalReasoningProjection(projection);
if (!validation.valid) throw new Error(validation.errors.join(" | "));

const broken = {
  ...projection,
  unresolved_items: [{
    unresolved_item_id: "U1",
    requirement_id: "UNKNOWN",
    facet_ids: ["UNKNOWN-F"],
    type: "ABSENT" as const,
    supporting_evidence: [],
    contradiction_evidence: [],
    elicitation: null,
  }],
};

const brokenValidation = validateCanonicalReasoningProjection(broken);
if (brokenValidation.valid) throw new Error("Invalid cross-reference was not rejected.");

console.log("D1 canonical reasoning adapter tests passed.");

const dangling = fixture();
dangling.demonstration_objectives = [{
  id: "D1", target_unresolved_item_id: "UNKNOWN", observable_cue: "cue",
  supporting_true_atom_ids: ["MISSING"], truthfulness_boundary: { permitted_claims: [], prohibited_claims: [] }
}];
let rejected = false;
try { buildCanonicalReasoningProjection(dangling); } catch { rejected = true; }
if (!rejected) throw new Error("Dangling canonical references were not rejected.");
