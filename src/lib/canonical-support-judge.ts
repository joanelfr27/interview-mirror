import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createHash } from "node:crypto";

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


export type SupportJudgeDiagnostic = Readonly<{
  model: string;
  temperature: number;
  response_format: string;
  requirement_count: number;
  facet_count: number;
  expected_facet_ids: readonly string[];
  evidence_atom_count: number;
  evidence_atom_ids: readonly string[];
  request_character_count: number;
  response_present: boolean;
  response_character_count: number;
  response_sha256: string | null;
  parsed_successfully: boolean;
  returned_judgment_count: number;
  returned_facet_ids: readonly string[];
  missing_facet_ids: readonly string[];
  unknown_facet_ids: readonly string[];
  duplicate_facet_ids: readonly string[];
  judgment_statuses: Readonly<Record<string, string>>;
  supporting_evidence_ids: Readonly<Record<string, readonly string[]>>;
  rationale_lengths: Readonly<Record<string, number>>;
  analogical_mapping_lengths: Readonly<Record<string, { shared_dimensions: number; unshared_dimensions: number }>>;
}>;

export class CanonicalSupportJudgmentError extends Error {
  readonly diagnostic: SupportJudgeDiagnostic;
  constructor(message: string, diagnostic: SupportJudgeDiagnostic) {
    super(message);
    this.name = "CanonicalSupportJudgmentError";
    this.diagnostic = diagnostic;
  }
}
\nconst STATUS_VALUES = ["DIRECT","PARTIAL","ANALOGICAL_TRANSFER","CONTRADICTORY","NONE"] as const;
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

function buildSupportJudgeDiagnostic(args: {
  raw: string | null;
  parsedSuccessfully: boolean;
  rawJudgments: RawJudgment[];
  compactRequirements: Array<{ id: string; facets: Array<{ id: string }> }>;
  compactEvidence: Array<{ id: string }>;
  requestCharacterCount: number;
}): SupportJudgeDiagnostic {
  const expectedFacetIds = args.compactRequirements.flatMap((req) => req.facets.map((facet) => facet.id));
  const returnedFacetIds = args.rawJudgments.map((judgment) => judgment.facet_id);
  const expected = new Set(expectedFacetIds);
  const returned = new Set(returnedFacetIds);
  const missingFacetIds = expectedFacetIds.filter((id) => !returned.has(id));
  const unknownFacetIds = returnedFacetIds.filter((id) => !expected.has(id));
  const duplicateFacetIds = [...new Set(returnedFacetIds.filter((id, index) => returnedFacetIds.indexOf(id) !== index))];

  return {
    model: AI_MODEL,
    temperature: 0,
    response_format: "canonical_support_judgments",
    requirement_count: args.compactRequirements.length,
    facet_count: expectedFacetIds.length,
    expected_facet_ids: expectedFacetIds,
    evidence_atom_count: args.compactEvidence.length,
    evidence_atom_ids: args.compactEvidence.map((atom) => atom.id),
    request_character_count: args.requestCharacterCount,
    response_present: args.raw !== null,
    response_character_count: args.raw?.length ?? 0,
    response_sha256: args.raw === null ? null : createHash("sha256").update(args.raw, "utf8").digest("hex"),
    parsed_successfully: args.parsedSuccessfully,
    returned_judgment_count: args.rawJudgments.length,
    returned_facet_ids: returnedFacetIds,
    missing_facet_ids: missingFacetIds,
    unknown_facet_ids: unknownFacetIds,
    duplicate_facet_ids: duplicateFacetIds,
    judgment_statuses: Object.fromEntries(args.rawJudgments.map((judgment) => [judgment.facet_id, judgment.status])),
    supporting_evidence_ids: Object.fromEntries(args.rawJudgments.map((judgment) => [judgment.facet_id, judgment.supporting_evidence_ids])),
    rationale_lengths: Object.fromEntries(args.rawJudgments.map((judgment) => [judgment.facet_id, judgment.rationale.length])),
    analogical_mapping_lengths: Object.fromEntries(args.rawJudgments.map((judgment) => [
      judgment.facet_id,
      {
        shared_dimensions: judgment.analogical_mapping?.shared_dimensions.length ?? 0,
        unshared_dimensions: judgment.analogical_mapping?.unshared_dimensions.length ?? 0,
      },
    ])),
  };
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

  const userContent = "CANDIDATE ATOMS:\n" + JSON.stringify(compactEvidence) + "\n\nROLE REQUIREMENTS AND FACETS:\n" + JSON.stringify(compactRequirements);
  const response = await openai.chat.completions.create({
    model: AI_MODEL, temperature: 0, response_format: responseFormat("canonical_support_judgments", SCHEMA),
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? null;
  if (raw === null || raw.length === 0) {
    const diagnostic = buildSupportJudgeDiagnostic({
      raw,
      parsedSuccessfully: false,
      rawJudgments: [],
      compactRequirements,
      compactEvidence,
      requestCharacterCount: userContent.length,
    });
    throw new CanonicalSupportJudgmentError("Empty canonical support judgment response.", diagnostic);
  }

  let parsed: { judgments: RawJudgment[] };
  try {
    parsed = JSON.parse(raw) as { judgments: RawJudgment[] };
  } catch (error) {
    const diagnostic = buildSupportJudgeDiagnostic({
      raw,
      parsedSuccessfully: false,
      rawJudgments: [],
      compactRequirements,
      compactEvidence,
      requestCharacterCount: userContent.length,
    });
    throw new CanonicalSupportJudgmentError(
      "Canonical support judgment response could not be parsed as JSON: " + (error instanceof Error ? error.message : String(error)),
      diagnostic,
    );
  }

  const rawJudgments = parsed.judgments ?? [];
  const diagnostic = buildSupportJudgeDiagnostic({
    raw,
    parsedSuccessfully: true,
    rawJudgments,
    compactRequirements,
    compactEvidence,
    requestCharacterCount: userContent.length,
  });
  const completenessErrors = assertCompleteFacetJudgments(rawJudgments, ledger.requirements.flatMap(r => r.facets));
  if (completenessErrors.length) {
    throw new CanonicalSupportJudgmentError(
      "Canonical support judgment response was incomplete or structurally invalid: " + completenessErrors.join(" | "),
      diagnostic,
    );
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
