import {
  buildCanonicalReasoningProjection,
  validateCanonicalReasoningProjection,
} from "@/lib/canonical-reasoning-adapter";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";

function atom(
  id: string,
  spanId: string,
  action: string,
  object: string,
  polarity: "AFFIRMATIVE" | "NEGATED" = "AFFIRMATIVE",
  sourceType: "CV" | "CANDIDATE_ELICITED" = "CV",
) {
  return {
    id,
    source_span_id: spanId,
    provenance: { source_type: sourceType, language: "en", extraction_method: "LLM" as const },
    subject: { actor: "candidate", ownership: "UNKNOWN" as const },
    action: { normalized_action: action, object },
    context: {},
    scale: {},
    time: {},
    outcome: null,
    assertion: {
      type: sourceType === "CANDIDATE_ELICITED" ? "ELICITED" as const : "RESPONSIBILITY" as const,
      polarity,
    },
    verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false },
    extraction_confidence: 1,
  };
}

function fixture(): EvidenceLedger {
  return {
    source_spans: [
      { id: "SPAN-A", document_id: "CV", text: "Managed regional reporting.", start_offset: 0, end_offset: 27, language: "en" },
      { id: "SPAN-B", document_id: "CV", text: "Led financial planning.", start_offset: 0, end_offset: 23, language: "en" },
      { id: "SPAN-C", document_id: "CV", text: "Worked with reporting systems.", start_offset: 0, end_offset: 31, language: "en" },
      { id: "SPAN-D", document_id: "CV", text: "Did not manage mining operations.", start_offset: 0, end_offset: 32, language: "en" },
      { id: "SPAN-E", document_id: "CV", text: "Bilingual financial reporting.", start_offset: 0, end_offset: 30, language: "en" },
      { id: "SPAN-F", document_id: "JD", text: "Regional financial reporting.", start_offset: 0, end_offset: 28, language: "en" },
      { id: "SPAN-G", document_id: "JD", text: "Financial planning.", start_offset: 0, end_offset: 19, language: "en" },
      { id: "SPAN-H", document_id: "JD", text: "Systems experience.", start_offset: 0, end_offset: 19, language: "en" },
      { id: "SPAN-I", document_id: "JD", text: "Mining experience.", start_offset: 0, end_offset: 18, language: "en" },
      { id: "SPAN-J", document_id: "JD", text: "Bilingual reporting.", start_offset: 0, end_offset: 19, language: "en" },
      { id: "ELICIT-1", document_id: "ELICIT-ANSWER-1", text: "I transferred similar reporting experience.", start_offset: 0, end_offset: 43, language: "en" },
    ],
    evidence: [
      atom("A1", "SPAN-A", "managed", "regional reporting"),
      atom("A2", "SPAN-B", "led", "financial planning"),
      atom("A3", "SPAN-C", "worked", "reporting systems"),
      atom("A4", "SPAN-D", "manage", "mining operations", "NEGATED"),
      atom("ELICIT-ATOM-ELICIT-1", "ELICIT-1", "transferred", "similar reporting experience", "AFFIRMATIVE", "CANDIDATE_ELICITED"),
    ],
    requirements: [
      {
        id: "R1",
        source_span_id: "SPAN-F",
        normalized_requirement: "Regional financial reporting",
        category: "RESPONSIBILITY",
        salience: "CORE",
        facets: [{ id: "R1-F1", type: "FUNCTION", requirement: "Regional financial reporting", source_span_id: "SPAN-F" }],
        extraction_confidence: 1,
      },
      {
        id: "R2",
        source_span_id: "SPAN-G",
        normalized_requirement: "Financial planning",
        category: "RESPONSIBILITY",
        salience: "IMPORTANT",
        facets: [{ id: "R2-F1", type: "FUNCTION", requirement: "Financial planning", source_span_id: "SPAN-G" }],
        extraction_confidence: 1,
      },
      {
        id: "R3",
        source_span_id: "SPAN-H",
        normalized_requirement: "Systems experience",
        category: "RESPONSIBILITY",
        salience: "IMPORTANT",
        facets: [{ id: "R3-F1", type: "FUNCTION", requirement: "Systems experience", source_span_id: "SPAN-H" }],
        extraction_confidence: 1,
      },
      {
        id: "R4",
        source_span_id: "SPAN-I",
        normalized_requirement: "Mining experience",
        category: "CONTEXT",
        salience: "CORE",
        facets: [{ id: "R4-F1", type: "CONTEXT", requirement: "Mining experience", source_span_id: "SPAN-I" }],
        extraction_confidence: 1,
      },
      {
        id: "R5",
        source_span_id: "SPAN-J",
        normalized_requirement: "Bilingual reporting",
        category: "RESPONSIBILITY",
        salience: "IMPORTANT",
        facets: [{ id: "R5-F1", type: "FUNCTION", requirement: "Bilingual reporting", source_span_id: "SPAN-J" }],
        extraction_confidence: 1,
      },
    ],
    support_judgments: [
      {
        id: "SJ1", requirement_id: "R1", facet_id: "R1-F1", status: "DIRECT",
        supporting_evidence_ids: ["A1"], rationale: "Direct documented support.", confidence: 1,
        abstained: false, support_basis: "DOCUMENTED",
      },
      {
        id: "SJ2", requirement_id: "R2", facet_id: "R2-F1", status: "PARTIAL",
        supporting_evidence_ids: ["A2"], rationale: "Partial documented support.", confidence: 0.7,
        abstained: false, support_basis: "DOCUMENTED",
      },
      {
        id: "SJ3", requirement_id: "R3", facet_id: "R3-F1", status: "ANALOGICAL_TRANSFER",
        supporting_evidence_ids: ["A3"], rationale: "Related systems experience can transfer.", confidence: 0.6,
        abstained: false, support_basis: "DOCUMENTED",
        analogical_mapping: { shared_dimensions: ["systems"], unshared_dimensions: ["target role context"] },
      },
      {
        id: "SJ4", requirement_id: "R4", facet_id: "R4-F1", status: "CONTRADICTORY",
        supporting_evidence_ids: ["A4"], rationale: "The source explicitly negates the required experience.", confidence: 0.9,
        abstained: false, support_basis: "DOCUMENTED",
      },
      {
        id: "SJ5", requirement_id: "R5", facet_id: "R5-F1", status: "NONE",
        supporting_evidence_ids: [], rationale: "No documented support.", confidence: 0.5,
        abstained: true, abstention_reason: "Insufficient explicit evidence.",
        support_basis: "DOCUMENTED",
      },
    ],
    requirement_statuses: [
      { requirement_id: "R1", status: "SUPPORTED" },
      { requirement_id: "R2", status: "PARTIAL" },
      { requirement_id: "R3", status: "PARTIAL" },
      { requirement_id: "R4", status: "CONTRADICTED" },
      { requirement_id: "R5", status: "UNRESOLVED" },
    ],
    unresolved_items: [{
      id: "UNRESOLVED-R5",
      requirement_id: "R5",
      facet_ids: ["R5-F1"],
      type: "ABSENT",
      supporting_evidence_ids: [],
      contradiction_evidence_ids: [],
      absence_basis: "UNMENTIONED",
      negation_evidence_ids: [],
    }],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };
}

const projection = buildCanonicalReasoningProjection(fixture());

if (projection.version !== "d1-v1") throw new Error("Projection version mismatch.");
if (projection.requirements.length !== 5) throw new Error("Requirement count was not preserved.");

const statuses = projection.requirements.map((requirement) => requirement.facets[0]?.status);
const expectedStatuses = ["DIRECT", "PARTIAL", "ANALOGICAL_TRANSFER", "CONTRADICTORY", "NONE"];
if (JSON.stringify(statuses) !== JSON.stringify(expectedStatuses)) {
  throw new Error("Direct/partial/analogical/contradictory/unresolved facet statuses were not preserved.");
}

const requirementStatuses = projection.requirements.map((requirement) => requirement.status);
const expectedRequirementStatuses = ["SUPPORTED", "PARTIAL", "PARTIAL", "CONTRADICTED", "UNRESOLVED"];
if (JSON.stringify(requirementStatuses) !== JSON.stringify(expectedRequirementStatuses)) {
  throw new Error("Requirement aggregation was not projected.");
}

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

const dangling = fixture();
dangling.demonstration_objectives = [{
  id: "D1",
  target_unresolved_item_id: "UNKNOWN",
  observable_cue: "cue",
  supporting_true_atom_ids: ["MISSING"],
  truthfulness_boundary: { permitted_claims: [], prohibited_claims: ["Do not invent evidence."] },
}];
let rejected = false;
try {
  buildCanonicalReasoningProjection(dangling);
} catch {
  rejected = true;
}
if (!rejected) throw new Error("Dangling canonical references were not rejected.");

const elicited = fixture();
elicited.requirements.push({
  id: "R6",
  source_span_id: "SPAN-J",
  normalized_requirement: "Transferable reporting experience",
  category: "RESPONSIBILITY",
  salience: "IMPORTANT",
  facets: [{ id: "R6-F1", type: "FUNCTION", requirement: "Transferable reporting experience", source_span_id: "SPAN-J" }],
  extraction_confidence: 1,
});
elicited.support_judgments.push({
  id: "SJ6",
  requirement_id: "R6",
  facet_id: "R6-F1",
  status: "PARTIAL",
  supporting_evidence_ids: ["ELICIT-ATOM-ELICIT-1"],
  rationale: "Candidate self-reported transferable experience.",
  confidence: 0.7,
  abstained: false,
  support_basis: "CANDIDATE_SELF_REPORTED",
});
elicited.requirement_statuses.push({ requirement_id: "R6", status: "PARTIAL" });
elicited.unresolved_items.push({
  id: "UNRESOLVED-R6",
  requirement_id: "R6",
  facet_ids: ["R6-F1"],
  type: "AMBIGUOUS",
  supporting_evidence_ids: ["ELICIT-ATOM-ELICIT-1"],
  contradiction_evidence_ids: [],
  absence_basis: "UNMENTIONED",
  negation_evidence_ids: [],
});
elicited.candidate_elicitations.push({
  id: "ELICIT-1",
  unresolved_item_id: "UNRESOLVED-R6",
  question: "Describe the transferable experience.",
  answer: "I transferred similar reporting experience.",
  answer_source_span_id: "ELICIT-1",
  answer_assertion_type: "ELICITED",
  classification: "TRANSFERABLE",
  classification_rationale: "The candidate described related experience that may transfer.",
});

const elicitedProjection = buildCanonicalReasoningProjection(elicited);
if (elicitedProjection.unresolved_items.find((item) => item.unresolved_item_id === "UNRESOLVED-R6")?.elicitation?.classification !== "TRANSFERABLE") {
  throw new Error("Elicitation state was not preserved.");
}
