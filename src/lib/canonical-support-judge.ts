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
  buildCandidateElicitations,
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
            type: "object",
            additionalProperties: false,
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
    "rationale must describe evidentiary relationship, not imagined interviewer belief; confidence is mapping confidence; return one judgment per facet.";

  const response = await openai.chat.completions.create({
    model: AI_MODEL, temperature: 0, response_format: responseFormat("canonical_support_judgments", SCHEMA),
    messages: [
      { role: "system", content: system },
      { role: "user", content: "CANDIDATE ATOMS:\n" + JSON.stringify(compactEvidence) + "\n\nROLE REQUIREMENTS AND FACETS:\n" + JSON.stringify(compactRequirements) },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty canonical support judgment response.");
  const parsed = JSON.parse(raw) as { judgments: RawJudgment[] };
  const rawJudgments = parsed.judgments ?? [];
  const completenessErrors = assertCompleteFacetJudgments(rawJudgments, ledger.requirements.flatMap(r => r.facets));
  if (completenessErrors.length) throw new Error("Canonical support judgment response was incomplete or structurally invalid: " + completenessErrors.join(" | "));
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
  next.candidate_elicitations = buildCandidateElicitations(next);
  const graphErrors = validateRequirementGraph(next);
  if (graphErrors.length) {
    throw new Error("Canonical support graph failed validation: " + graphErrors.join(" | "));
  }
  return { ledger: next, diagnostics: sanitized.errors };
}
