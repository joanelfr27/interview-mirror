import { AI_MODEL, getOpenAI } from "@/lib/openai";
import type { SessionRecord } from "@/types";
import {
  type EvidenceLedger,
  type SupportJudgment,
  type SupportStatus,
  validateSupportJudgmentAgainstEvidence,
  aggregateRequirementStatus,
  buildUnresolvedItems,
  validateRequirementGraph,
  assertCompleteFacetJudgments,
  validateSupportJudgmentAgainstFacet,
} from "@/lib/canonical-evidence-model";

type RawJudgment = {
  id: string; requirement_id: string; facet_id: string; status: SupportStatus;
  supporting_evidence_ids: string[]; rationale: string; confidence: number; abstained: boolean; abstention_reason?: string; support_basis: "DOCUMENTED" | "CANDIDATE_SELF_REPORTED";
  analogical_mapping?: { shared_dimensions: string[]; unshared_dimensions: string[] };
};

const STATUS_VALUES = ["DIRECT","PARTIAL","ANALOGICAL_TRANSFER","CONTRADICTORY","NONE"] as const;
const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    judgments: { type: "array", items: {
      type: "object", additionalProperties: false,
      properties: {
        id: { type: "string" }, requirement_id: { type: "string" }, facet_id: { type: "string" },
        status: { type: "string", enum: [...STATUS_VALUES] },
        supporting_evidence_ids: { type: "array", items: { type: "string" } },
        rationale: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 },
        abstained: { type: "boolean" },
        abstention_reason: { anyOf: [{ type: "string" }, { type: "null" }] },
        support_basis: { type: "string", enum: ["DOCUMENTED", "CANDIDATE_SELF_REPORTED"] },
        analogical_mapping: {
          anyOf: [{
            type: "object", additionalProperties: false,
            properties: {
              shared_dimensions: { type: "array", items: { type: "string" } },
              unshared_dimensions: { type: "array", items: { type: "string" } },
            },
            required: ["shared_dimensions", "unshared_dimensions"],
          }, { type: "null" }]
        },
      },
      required: ["id","requirement_id","facet_id","status","supporting_evidence_ids","rationale","confidence","abstained","abstention_reason","support_basis","analogical_mapping"],
    }},
  },
  required: ["judgments"],
} as const;

function summarizeFacetResponse(raw: RawJudgment[], facets: EvidenceLedger["requirements"][number]["facets"]) {
  const expected = new Set(facets.map(facet => facet.id));
  const seen = new Set<string>();
  let duplicateCount = 0;
  let unknownCount = 0;
  let validExpectedCount = 0;

  for (const item of raw) {
    if (seen.has(item.facet_id)) duplicateCount += 1;
    seen.add(item.facet_id);
    if (expected.has(item.facet_id)) validExpectedCount += 1;
    else unknownCount += 1;
  }

  return {
    expected_facets: facets.length,
    raw_judgments: raw.length,
    unique_facet_ids: seen.size,
    valid_expected_judgments: validExpectedCount,
    unknown_facet_ids: unknownCount,
    duplicate_facet_ids: duplicateCount,
    missing_facets: Math.max(0, facets.length - [...expected].filter(id => seen.has(id)).length),
  };
}

function responseFormat(name: string, schema: unknown) {
  return { type: "json_schema" as const, json_schema: { name, strict: true, schema: schema as Record<string, unknown> } };
}

export function sanitizeJudgments(raw: RawJudgment[], ledger: EvidenceLedger): { judgments: SupportJudgment[]; errors: string[] } {
  const errors: string[] = [];
  const evidenceIds = new Set(ledger.evidence.map(x => x.id));
  const requirements = new Map(ledger.requirements.map(x => [x.id, x]));
  const valid: SupportJudgment[] = [];
  const seenFacetKeys = new Set<string>();

  for (const item of raw) {
    const req = requirements.get(item.requirement_id);
    const facet = req?.facets.find(x => x.id === item.facet_id);
    if (!req || !facet) { errors.push("Rejected judgment " + item.id + ": unknown requirement/facet."); continue; }

    const facetKey = item.requirement_id + "::" + item.facet_id;
    if (seenFacetKeys.has(facetKey)) {
      errors.push("Rejected judgment " + item.id + ": duplicate judgment for the same requirement facet.");
      continue;
    }
    seenFacetKeys.add(facetKey);

    const cited = [...new Set(item.supporting_evidence_ids)].filter(id => evidenceIds.has(id));
    if (item.status === "NONE" || item.abstained) {
      item.status = "NONE"; item.abstained = true; item.supporting_evidence_ids = []; item.abstention_reason = item.abstention_reason || "Insufficient explicit evidence to make a positive support judgment.";
    } else {
      item.supporting_evidence_ids = cited;
      if (!cited.length) {
        errors.push("Rejected judgment " + item.id + ": positive status without cited evidence; converted to abstained NONE.");
        item.status = "NONE"; item.abstained = true;
      }
    }

    const citedAtoms = item.supporting_evidence_ids
      .map(id => ledger.evidence.find(atom => atom.id === id))
      .filter((atom): atom is EvidenceLedger["evidence"][number] => Boolean(atom));
    const hasElicited = citedAtoms.some(atom => atom.provenance.source_type === "CANDIDATE_ELICITED");
    const hasDocumented = citedAtoms.some(atom => atom.provenance.source_type !== "CANDIDATE_ELICITED");
    if (hasElicited && hasDocumented) {
      errors.push("Rejected judgment " + item.id + ": mixed documented and elicited evidence requires an explicit mixed basis.");
      continue;
    }
    item.support_basis = hasElicited ? "CANDIDATE_SELF_REPORTED" : "DOCUMENTED";

    // Positive FUNCTION support requires a grounded action/object proposition.
    // Atoms that only establish tools, credentials, languages, etc. must not be
    // promoted into a functional claim when their action/object is UNKNOWN.
    const positiveFunctionalStatus =
      item.status === "DIRECT" ||
      item.status === "PARTIAL" ||
      item.status === "ANALOGICAL_TRANSFER";
    if (positiveFunctionalStatus && facet.type === "FUNCTION" && citedAtoms.some(atom =>
      atom.action.normalized_action.trim() === "UNKNOWN" || atom.action.object.trim() === "UNKNOWN"
    )) {
      item.status = "NONE";
      item.abstained = true;
      item.supporting_evidence_ids = [];
      item.rationale = "The cited evidence does not contain a grounded action/object proposition sufficient for positive functional support.";
      item.confidence = 0;
      item.abstention_reason = "Positive functional support requires a grounded action and object in the cited evidence.";
    }

    // Positive OWNERSHIP support requires explicit ownership evidence.
    // UNKNOWN ownership is absence of evidence, not a positive ownership claim.
    if (positiveFunctionalStatus && facet.type === "OWNERSHIP" && citedAtoms.every(atom => atom.subject.ownership === "UNKNOWN")) {
      item.status = "NONE";
      item.abstained = true;
      item.supporting_evidence_ids = [];
      item.rationale = "The cited evidence does not contain explicit ownership attribution sufficient for positive ownership support.";
      item.confidence = 0;
      item.abstention_reason = "Positive ownership support requires explicit non-UNKNOWN ownership evidence.";
    }

    // Deterministic credential-specificity guard: a generic Master's/MBA credential
    // cannot DIRECTLY satisfy a Finance/Accounting-specific Master's requirement
    // unless the cited credential explicitly names Finance or Accounting.
    if (item.status === "DIRECT" && facet.type === "LEVEL" &&
        /master(?:'s|’s)?\s+degree.*\b(?:finance|accounting)\b/i.test(facet.requirement)) {
      const citedCredentials = citedAtoms.filter(atom => atom.assertion.type === "CREDENTIAL");
      const hasSpecificField = citedCredentials.some(atom =>
        /\b(?:finance|accounting)\b/i.test(atom.action.object)
      );
      if (citedCredentials.length > 0 && !hasSpecificField) {
        item.status = "PARTIAL";
        item.rationale = "The cited credential establishes Master's-level education, but the required Finance or Accounting specialization is not explicitly documented.";
        item.confidence = Math.min(item.confidence, 0.8);
      }
    }

    const validation = validateSupportJudgmentAgainstFacet(item, facet, ledger.evidence);
    if (validation.length) { errors.push(...validation.map(x => "[" + item.id + "] " + x)); continue; }
    valid.push(item);
  }

  for (const req of ledger.requirements) for (const facet of req.facets) {
    if (valid.some(j => j.requirement_id === req.id && j.facet_id === facet.id)) continue;
    valid.push({
      id: "SJ-" + req.id + "-" + facet.id + "-ABSTAIN",
      requirement_id: req.id, facet_id: facet.id, status: "NONE",
      supporting_evidence_ids: [],
      rationale: "No valid support judgment was returned for this facet; abstained rather than inferring.",
      confidence: 0, abstained: true, abstention_reason: "No valid facet judgment was returned; abstained rather than inferring.", support_basis: "DOCUMENTED",
    });
  }
  return { judgments: valid, errors };
}

export async function judgeCanonicalSupport(
  session: SessionRecord,
  ledger: EvidenceLedger,
): Promise<{ ledger: EvidenceLedger; diagnostics: string[] }> {
  const openai = getOpenAI();

  const compactEvidence = ledger.evidence.map(atom => ({
    id: atom.id,
    source_quote: ledger.source_spans.find(s => s.id === atom.source_span_id)?.text ?? "",
    ownership: atom.subject.ownership, action: atom.action, context: atom.context,
    scale: atom.scale, time: atom.time, outcome: atom.outcome, assertion: atom.assertion,
  }));
  const compactRequirements = ledger.requirements.map(req => ({
    id: req.id, requirement: req.normalized_requirement, salience: req.salience,
    facets: req.facets.map(f => ({
      id: f.id, type: f.type, requirement: f.requirement,
      source_quote: ledger.source_spans.find(s => s.id === f.source_span_id)?.text ?? "",
    })),
  }));

  const system =
    "You are Interview Mirror's normative evidentiary reader.\n" +
    "This is an internal canonical reasoning layer. Keep rationale and analogical dimension labels in stable English; preserve supplied source quotes verbatim. Never translate or rewrite evidence facts based on the user's product or interview language.\n" +
    "For each JD requirement facet, determine what the supplied candidate atoms support. " +
    "This is NOT a prediction of a real interviewer's thoughts and NOT a judgment of intrinsic ability.\n\n" +
    "DIRECT = explicit atom(s) directly satisfy the facet. PARTIAL = explicit atom(s) address part but a material dimension remains unresolved. " +
    "ANALOGICAL_TRANSFER = explicit atom shows genuinely adjacent capability/context, not the same requirement. " +
    "CONTRADICTORY = explicit candidate evidence conflicts with the facet. NONE = supplied evidence does not support the facet; abstain when uncertain.\n\n" +
    "Hard rules: cite only supplied evidence IDs; one facet may cite multiple atoms and one atom may support multiple facets; " +
    "never infer missing tools, scope, ownership, outcomes, seniority, industry or qualifications; not mentioned is not contradictory; an explicitly NEGATED atom is evidence of contradiction when it conflicts with the facet; " +
    "CONTRADICTORY requires explicit conflict; if insufficient to distinguish positive statuses, abstain as NONE; " +
    "rationale must describe evidentiary relationship, not imagined interviewer belief; confidence is mapping confidence; return one judgment per facet. A broader credential/category does not directly satisfy a narrower credential subtype: for example, an MBA in Global Business & Management Studies does not DIRECTLY satisfy a requirement specifically for a Master's degree in Finance or Accounting unless Finance or Accounting is explicitly stated in the cited evidence.";

  const response = await openai.chat.completions.create({
    model: AI_MODEL, temperature: 0, response_format: responseFormat("canonical_support_judgments", SCHEMA),
    messages: [
      { role: "system", content: system },
      { role: "user", content: "CANDIDATE ATOMS:\n" + JSON.stringify(compactEvidence) + "\n\nROLE REQUIREMENTS AND FACETS:\n" + JSON.stringify(compactRequirements) },
    ],
  });

  let raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty canonical support judgment response.");

  let parsed = JSON.parse(raw) as { judgments: RawJudgment[] };
  let rawJudgments = parsed.judgments ?? [];
  const facets = ledger.requirements.flatMap(r => r.facets);
  const completenessErrors = assertCompleteFacetJudgments(rawJudgments, facets);

  if (completenessErrors.length) {
    const retryResponse = await openai.chat.completions.create({
      model: AI_MODEL, temperature: 0, response_format: responseFormat("canonical_support_judgments_retry", SCHEMA),
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            "CANDIDATE ATOMS:\n" + JSON.stringify(compactEvidence) +
            "\n\nROLE REQUIREMENTS AND FACETS:\n" + JSON.stringify(compactRequirements) +
            "\n\nCOMPLETENESS REQUIREMENT:\n" +
            "The previous response did not return a complete facet set. Return exactly one judgment for every facet ID below, including NONE/abstained when evidence is insufficient. Do not omit any facet and do not invent evidence. Required facet IDs:\n" +
            JSON.stringify(facets.map(facet => facet.id)),
        },
      ],
    });
    raw = retryResponse.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty canonical support judgment retry response.");
    parsed = JSON.parse(raw) as { judgments: RawJudgment[] };
    rawJudgments = parsed.judgments ?? [];
    const retryCompletenessErrors = assertCompleteFacetJudgments(rawJudgments, facets);
    if (retryCompletenessErrors.length) {
      const summary = summarizeFacetResponse(rawJudgments, facets);
      throw new Error(
        "Canonical support judgment response was incomplete or structurally invalid after one retry: " +
        retryCompletenessErrors.join(" | ") +
        " | response_metrics=" + JSON.stringify(summary),
      );
    }
  }
  const sanitized = sanitizeJudgments(rawJudgments, ledger);
  if (sanitized.errors.length) {
    throw new Error("Canonical support judgment response failed validation: " + sanitized.errors.join(" | "));
  }
  const judgments = sanitized.judgments;
  const next: EvidenceLedger = {
    ...ledger,
    support_judgments: judgments,
    requirement_statuses: ledger.requirements.map(requirement => ({
      requirement_id: requirement.id, status: aggregateRequirementStatus(requirement, judgments),
    })),
    unresolved_items: [],
  };
  next.unresolved_items = buildUnresolvedItems(next);
  const graphErrors = validateRequirementGraph(next);
  if (graphErrors.length) {
    throw new Error("Canonical support graph failed validation: " + graphErrors.join(" | "));
  }
  return { ledger: next, diagnostics: sanitized.errors };
}
