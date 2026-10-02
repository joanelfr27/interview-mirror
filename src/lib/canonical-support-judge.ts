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
  supporting_evidence_ids: string[]; context_evidence_ids: string[];
  rationale: string; confidence: number; abstained: boolean; abstention_reason?: string; support_basis: "DOCUMENTED" | "CANDIDATE_SELF_REPORTED";
  relational: boolean; relationship_connector?: string | null; licensing_spans: string[];
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
  raw_response: string | null;
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
        context_evidence_ids: { type: "array", items: { type: "string" } },
        rationale: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 },
        abstained: { type: "boolean" },
        relational: { type: "boolean" },
        relationship_connector: { anyOf: [{ type: "string" }, { type: "null" }] },
        licensing_spans: { type: "array", items: { type: "string" } },
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
      required: ["id","requirement_id","facet_id","status","supporting_evidence_ids","context_evidence_ids","rationale","confidence","abstained","abstention_reason","support_basis","relational","relationship_connector","licensing_spans","analogical_mapping"],
    }},
  },
  required: ["judgments"],
} as const;

// Preserve the canonical two-basis contract in the generated response grammar.
// This changes the judge request, so it is an isolated boundary-change candidate.
export function buildSupportJudgeSchema(ledger: EvidenceLedger) {
  const template = SCHEMA.properties.judgments.items;
  const branch = (basis: string[], statuses: string[], ids: string[], abstained: boolean) => ({
    ...template,
    properties: {
      ...template.properties,
      support_basis: { type: "string", enum: basis },
      status: { type: "string", enum: statuses },
      abstained: { type: "boolean", enum: [abstained] },
      supporting_evidence_ids: ids.length
        ? { type: "array", minItems: 1, items: { type: "string", enum: ids } }
        : { type: "array", maxItems: 0, items: { type: "string" } },
      context_evidence_ids: abstained
        ? { type: "array", maxItems: 0, items: { type: "string" } }
        : { type: "array", items: { type: "string", enum: [...documented, ...elicited] } },
    },
  });
  const documented = ledger.evidence.filter(a => a.provenance.source_type !== "CANDIDATE_ELICITED").map(a => a.id);
  const elicited = ledger.evidence.filter(a => a.provenance.source_type === "CANDIDATE_ELICITED").map(a => a.id);
  const anyOf = [branch(["DOCUMENTED", "CANDIDATE_SELF_REPORTED"], ["NONE"], [], true)];
  if (documented.length) anyOf.push(branch(["DOCUMENTED"], ["DIRECT", "PARTIAL", "ANALOGICAL_TRANSFER", "CONTRADICTORY"], documented, false));
  if (elicited.length) anyOf.push(branch(["CANDIDATE_SELF_REPORTED"], ["PARTIAL", "ANALOGICAL_TRANSFER", "CONTRADICTORY"], elicited, false));
  return { ...SCHEMA, properties: { judgments: { type: "array", items: { anyOf } } } };
}


const RELATIONAL_CONNECTOR_PATTERNS = [
  /\b(?:input\s+(?:to|into|for)|based\s+on|in\s+response\s+to|used\s+to|uses?\s+.+\s+to|drives?|feeds?\s+(?:into|to)|shapes?|enables?|influences?|leads?\s+(?:to|into)|turns?\s+.+\s+into|moves?\s+from\s+.+\s+to|because\s+of|as\s+a\s+result\s+of|so\s+that|in\s+order\s+to)\b/i,
  /\b(?:en\s+réponse\s+à|bas[ée]e?\s+sur|fond[ée]e?\s+sur|grâce\s+à|afin\s+de|suite\s+à|sert\s+à|utilis[ée]e?\s+pour|alimente|façonne|permet\s+de|influence|conduit\s+à|transforme\s+.+\s+en)\b/i,
] as const;

function isRelationalFacet(requirement: string): boolean {
  return RELATIONAL_CONNECTOR_PATTERNS.some(pattern => pattern.test(requirement));
}

function normalizeEvidenceText(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function distinctivePhrases(value: string): string[] {
  const words = normalizeEvidenceText(value).split(/\s+/).filter(Boolean);
  const phrases: string[] = [];
  for (let size = Math.min(6, words.length); size >= 4; size--) {
    for (let i = 0; i + size <= words.length; i++) {
      const phrase = words.slice(i, i + size).join(" ");
      if (phrase.length >= 20) phrases.push(phrase);
    }
  }
  return phrases;
}

function validateRelationalAndRationaleBoundary(item: RawJudgment, facet: EvidenceLedger["requirements"][number]["facets"][number], ledger: EvidenceLedger): string[] {
  const errors: string[] = [];
  const relational = isRelationalFacet(facet.requirement);
  if (item.relational !== relational) errors.push("relational classification does not match the deterministic facet classifier.");

  const minimalIds = new Set(item.supporting_evidence_ids);
  const contextIds = new Set(item.context_evidence_ids);
  if ([...minimalIds].some(id => contextIds.has(id))) errors.push("minimal supporting evidence and optional context evidence must be disjoint.");

  const byId = new Map(ledger.evidence.map(atom => [atom.id, atom]));
  const spans = new Map(ledger.source_spans.map(span => [span.id, span.text]));
  const citedSourceTexts = item.supporting_evidence_ids
    .map(id => byId.get(id))
    .filter((atom): atom is EvidenceLedger["evidence"][number] => Boolean(atom))
    .map(atom => spans.get(atom.source_span_id) ?? "");

  if (relational && item.status === "DIRECT") {
    if (!item.relationship_connector?.trim()) errors.push("relational DIRECT requires an explicit relationship_connector.");
    if (!item.licensing_spans.length) errors.push("relational DIRECT requires at least one exact licensing span.");
    for (const licensingSpan of item.licensing_spans) {
      const exact = licensingSpan.trim();
      if (!exact || !citedSourceTexts.some(source => source.includes(exact))) {
        errors.push("relational DIRECT licensing span must be an exact quote from the minimal supporting evidence subset.");
      }
    }
    if (item.supporting_evidence_ids.length > 1) {
      const licensingAtomIds = new Set<string>();
      for (const exact of item.licensing_spans.map(span => span.trim()).filter(Boolean)) {
        for (const id of item.supporting_evidence_ids) {
          const atom = byId.get(id);
          const source = atom ? spans.get(atom.source_span_id) ?? "" : "";
          if (source.includes(exact)) licensingAtomIds.add(id);
        }
      }
      if (licensingAtomIds.size !== 1) {
        errors.push("relational DIRECT must be licensed within one cited atom; independent activities cannot be composed into a DIRECT relationship.");
      }
    }
  }
  if ((!relational || item.status !== "DIRECT") && item.licensing_spans.length > 0) {
    for (const licensingSpan of item.licensing_spans) {
      const exact = licensingSpan.trim();
      if (!exact || !citedSourceTexts.some(source => source.includes(exact))) errors.push("licensing span must be an exact quote from minimal supporting evidence.");
    }
  }

  const rationale = normalizeEvidenceText(item.rationale);
  for (const atom of ledger.evidence) {
    if (minimalIds.has(atom.id)) continue;
    if (item.rationale.includes(atom.id)) errors.push("rationale explicitly relies on an evidence ID outside the minimal supporting subset.");
    const source = spans.get(atom.source_span_id) ?? "";
    const otherSources = ledger.evidence
      .filter(other => other.id !== atom.id)
      .map(other => spans.get(other.source_span_id) ?? "");
    const uniquePhrases = distinctivePhrases(source).filter(phrase =>
      !otherSources.some(other => normalizeEvidenceText(other).includes(phrase))
    );
    if (uniquePhrases.some(phrase => rationale.includes(phrase))) {
      errors.push("rationale contains a distinctive phrase from evidence outside the minimal supporting subset.");
    }
  }
  return errors;
}

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
    raw_response: args.raw,
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
    item.context_evidence_ids = [...new Set(item.context_evidence_ids ?? [])].filter(id => evidenceIds.has(id));
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

    const semanticBoundaryErrors = validateRelationalAndRationaleBoundary(item, facet, ledger);
    if (semanticBoundaryErrors.length) {
      errors.push(...semanticBoundaryErrors.map(error => "[" + item.id + "] " + error));
      continue;
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

export function buildSupportJudgeEvidence(ledger: EvidenceLedger) {
  return ledger.evidence.map(atom => ({
    id: atom.id,
    source_type: atom.provenance.source_type,
    support_basis: atom.provenance.source_type === "CANDIDATE_ELICITED"
      ? "CANDIDATE_SELF_REPORTED" : "DOCUMENTED",
    source_quote: ledger.source_spans.find(s => s.id === atom.source_span_id)?.text ?? "",
    ownership: atom.subject.ownership, action: atom.action, context: atom.context,
    scale: atom.scale, time: atom.time, outcome: atom.outcome, assertion: atom.assertion,
  }));
}

export async function judgeCanonicalSupport(
  session: SessionRecord,
  ledger: EvidenceLedger,
): Promise<{ ledger: EvidenceLedger; diagnostics: string[] }> {
  const openai = getOpenAI();

  const compactEvidence = buildSupportJudgeEvidence(ledger);
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
    "Evidence basis rules: each supplied atom includes source_type and support_basis. supporting_evidence_ids is the MINIMAL subset that licenses the returned status; optional non-licensing background belongs only in context_evidence_ids. The two lists must be disjoint. Each facet judgment must cite atoms from only one support_basis; never mix DOCUMENTED and CANDIDATE_SELF_REPORTED IDs in one judgment. " +
    "Use DOCUMENTED with documented atoms only. Use CANDIDATE_SELF_REPORTED with CANDIDATE_ELICITED atoms only; candidate self-report can never be DIRECT. " +
    "When both bases address a facet, choose the single basis that supports the most defensible allowed judgment and explain its limits; do not combine the bases to manufacture stronger support. If neither basis alone supports a defensible judgment, abstain as NONE with no citations.\n" +
    "Relationship grounding: set relational to whether the FACET ITSELF asserts a connection such as input-to, based-on, used-to, drives, feeds, shapes, enables, response, purpose, causality, recurrence, interface or dependency. For a relational DIRECT judgment, relationship_connector is required and licensing_spans must quote the exact words in the minimal supporting evidence that license that connector. Co-occurrence is not a relationship; chronology is not causality or purpose. Two separately documented activities cannot be combined to manufacture a DIRECT relationship. If the relationship exists only in candidate elicitation, use CANDIDATE_SELF_REPORTED and remain below DIRECT. Never mention or paraphrase evidence outside supporting_evidence_ids in the rationale; context_evidence_ids is non-licensing context only.\n" +
    "Hard rules: cite only supplied evidence IDs; one facet may cite multiple atoms and one atom may support multiple facets; " +
    "never infer missing tools, scope, ownership, outcomes, seniority, industry or qualifications; not mentioned is not contradictory; an explicitly NEGATED atom is evidence of contradiction when it conflicts with the facet; " +
    "CONTRADICTORY requires explicit conflict; if insufficient to distinguish positive statuses, abstain as NONE; " +
    "rationale must describe evidentiary relationship, not imagined interviewer belief; confidence is mapping confidence; return one judgment per facet. A broader credential/category does not directly satisfy a narrower credential subtype: for example, an MBA in Global Business & Management Studies does not DIRECTLY satisfy a requirement specifically for a Master's degree in Finance or Accounting unless Finance or Accounting is explicitly stated in the cited evidence.";

  const userContent = "CANDIDATE ATOMS:\n" + JSON.stringify(compactEvidence) + "\n\nROLE REQUIREMENTS AND FACETS:\n" + JSON.stringify(compactRequirements);
  const response = await openai.chat.completions.create({
    model: AI_MODEL, temperature: 0, response_format: responseFormat("canonical_support_judgments", buildSupportJudgeSchema(ledger)),
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
  // Sanitize before asserting completeness. Missing model judgments are an
  // epistemic gap, not evidence of support: sanitizeJudgments deterministically
  // fills each missing facet with an abstained NONE. Unknown/duplicate/invalid
  // judgments still fail closed through sanitized.errors.
  const sanitized = sanitizeJudgments(rawJudgments, ledger);
  if (sanitized.errors.length) {
    throw new CanonicalSupportJudgmentError("Canonical support judgment response failed validation: " + sanitized.errors.join(" | "), diagnostic);
  }
  const completenessErrors = assertCompleteFacetJudgments(sanitized.judgments, ledger.requirements.flatMap(r => r.facets));
  if (completenessErrors.length) {
    throw new CanonicalSupportJudgmentError(
      "Sanitized canonical support judgments were incomplete or structurally invalid: " + completenessErrors.join(" | "),
      diagnostic,
    );
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
