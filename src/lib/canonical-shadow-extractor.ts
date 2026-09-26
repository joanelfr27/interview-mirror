import { AI_MODEL, getOpenAI, normalizeLanguage } from "@/lib/openai";
import type { SessionRecord } from "@/types";
import {
  type AtomicEvidence,
  type EvidenceLedger, detectSourceLanguage, detectQuoteLanguage,
  type EvidenceOwnership,
  type EvidenceSourceType,
  type Requirement,
  type RequirementFacet,
  type RequirementFacetType,
  type RequirementSalience,
  type SourceSpan,
  validateAtomicEvidence,
  deriveDeterministicVerifiability,
  validateAtomicEvidenceAgainstSource,
  validateSourceSpan,
  validateSpanBounds,
  forbiddenInferenceViolations,
  validatePipelineContext,
  validateRequirementGraph,
  type PipelineContext,
} from "@/lib/canonical-evidence-model";

/**
 * E1.2 — Canonical extraction in shadow mode.
 *
 * This module deliberately does NOT replace the current analysis/Strategy
 * pipeline. It creates a second, auditable representation from the raw CV/JD.
 *
 * Design rule:
 *   raw document -> exact source spans -> canonical objects
 *
 * No legacy summary is supplied to either extraction prompt.
 */

type RawCandidateAtom = {
  id: string;
  source_quote: string;
  actor: string;
  ownership: EvidenceOwnership;
  normalized_action: string;
  object: string;
  domain?: string | null;
  jurisdiction?: string | null;
  situation?: string | null;
  tools_or_systems?: string[];
  standards?: string[];
  quantity?: string | null;
  currency?: string | null;
  team_size?: number | null;
  scope?: string | null;
  start?: string | null;
  end?: string | null;
  recency?: string | null;
  outcome?: string | null;
  assertion_type: "STATED" | "QUANTIFIED" | "CREDENTIAL" | "EMPLOYMENT" | "RESPONSIBILITY" | "OUTCOME_CLAIM";
  polarity: "AFFIRMATIVE" | "NEGATED";
  has_quantifiable_metric: boolean;
  has_third_party_entity: boolean;
  has_time_anchor: boolean;
  extraction_confidence: number;
};

type RawRequirement = {
  id: string;
  source_quote: string;
  normalized_requirement: string;
  category: string;
  salience: RequirementSalience;
  facets: Array<{
    id: string;
    type: RequirementFacetType;
    requirement: string;
    source_quote: string;
  }>;
  extraction_confidence: number;
};

const CANDIDATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    atoms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          source_quote: { type: "string" },
          actor: { type: "string" },
          ownership: { type: "string", enum: ["INDIVIDUAL", "TEAM", "SHARED", "SUPERVISED", "UNKNOWN"] },
          normalized_action: { type: "string" },
          object: { type: "string" },
          domain: { anyOf: [{ type: "string" }, { type: "null" }] },
          jurisdiction: { anyOf: [{ type: "string" }, { type: "null" }] },
          situation: { anyOf: [{ type: "string" }, { type: "null" }] },
          tools_or_systems: { type: "array", items: { type: "string" } },
          standards: { type: "array", items: { type: "string" } },
          quantity: { anyOf: [{ type: "string" }, { type: "null" }] },
          currency: { anyOf: [{ type: "string" }, { type: "null" }] },
          team_size: { anyOf: [{ type: "integer" }, { type: "null" }] },
          scope: { anyOf: [{ type: "string" }, { type: "null" }] },
          start: { anyOf: [{ type: "string" }, { type: "null" }] },
          end: { anyOf: [{ type: "string" }, { type: "null" }] },
          recency: { anyOf: [{ type: "string" }, { type: "null" }] },
          outcome: { anyOf: [{ type: "string" }, { type: "null" }] },
          assertion_type: { type: "string", enum: ["STATED", "QUANTIFIED", "CREDENTIAL", "EMPLOYMENT", "RESPONSIBILITY", "OUTCOME_CLAIM"] },
          polarity: { type: "string", enum: ["AFFIRMATIVE", "NEGATED"] },
          has_quantifiable_metric: { type: "boolean" },
          has_third_party_entity: { type: "boolean" },
          has_time_anchor: { type: "boolean" },
          extraction_confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: [
          "id","source_quote","actor","ownership","normalized_action","object",
          "domain","jurisdiction","situation","tools_or_systems","standards",
          "quantity","currency","team_size","scope","start","end","recency",
          "outcome","assertion_type","polarity","has_quantifiable_metric",
          "has_third_party_entity","has_time_anchor","extraction_confidence"
        ]
      }
    }
  },
  required: ["atoms"]
} as const;

export const CANDIDATE_EXTRACTION_SYSTEM_PROMPT = `You are the canonical candidate-evidence extractor for Interview Mirror.

Source-language rule: preserve the language of the supplied CV in normalized fields. Do not translate, rewrite into the preparation language, or mix languages. Source quotes must remain verbatim. The preparation/product language is irrelevant to this canonical extraction layer.

Extract atomic evidence directly from the supplied CV. An atom is ONE explicit proposition that can be traced to one exact source quote.

Hard rules:
- source_quote MUST be copied verbatim from the CV, character-for-character apart from trimming surrounding whitespace. Never paraphrase, normalize, merge, or rewrite source_quote. If you cannot produce an exact source quote, DO NOT return the atom.
- Every populated structured field is an ATOM-LOCAL EXTRACTION, not a semantic summary. The value must be an exact contiguous phrase or literal value that appears inside that atom's source_quote.
- assertion_type MUST match the proposition actually stated in source_quote. If assertion_type is OUTCOME_CLAIM, outcome MUST be non-null and MUST be an exact contiguous phrase from that same source_quote. Never label an atom OUTCOME_CLAIM when no explicit outcome is stated.
- For OUTCOME_CLAIM specifically, the outcome field is mandatory evidence, not an optional annotation. If there is no explicit outcome phrase in the source_quote, use another assertion_type or omit the atom.
- normalized_action is NOT a lemma, synonym, or generalized capability. Copy the explicit action phrase from the quote (for example, use "Leading" rather than "lead" when the quote says "Leading"). Do not convert nouns to verbs or verbs to abstract concepts.
- object is the exact noun/object phrase stated in the quote. Do not replace it with a broader concept.
- actor: use the exact actor phrase from the quote when explicitly named; otherwise use the canonical placeholder "candidate". Never invent a person, employer, team, or role as actor.
- ownership: use INDIVIDUAL, TEAM, SHARED, or SUPERVISED only when the quote explicitly contains the corresponding ownership marker. Otherwise use UNKNOWN. A job title, managerial title, or ordinary responsibility statement does NOT imply ownership.
- domain, jurisdiction, situation, scope, quantity, currency, start, end, recency, outcome, tools_or_systems, and standards must each be copied from the same source_quote when present. If the information appears elsewhere in the CV, do not attach it to this atom; return null or [].
- Employment dates must NOT be attached to a responsibility/achievement atom unless those dates occur in that atom's source_quote. If dates are useful, create a separate employment atom whose source_quote contains the dates.
- Never infer geography from an employer location, role location, or surrounding CV section when it is absent from the atom quote.
- Never infer seniority, scale, scope, ownership, outcome, tool, standard, domain, jurisdiction, or time from the candidate's job title or from neighboring lines.
- If the CV does not explicitly state a field in the atom quote, return null, [] or UNKNOWN as appropriate.
- Mark polarity NEGATED only when the CV explicitly negates the proposition; unmentioned is not negated.
- Do not use any prior CV analysis, strengths, gaps or strategy.
- Do not judge candidate fit.
- Do not claim that an atom proves a capability; extraction only.
- Extraction confidence measures source representation accuracy only, not candidate fit.
- Prefer multiple small atoms over one enriched atom. Split role/date facts, responsibilities, tools, metrics, outcomes, and explicit scope into separate atoms when their source quotes differ.
- has_time_anchor MUST be true only when the atom's source_quote contains an explicit four-digit year. Otherwise false.
- has_quantifiable_metric MUST be true only when the atom's source_quote contains an explicit numeric/percentage/currency metric; otherwise false.
- has_third_party_entity MUST be true only when the atom's source_quote itself explicitly names a third-party entity; otherwise false.
- Every atom must have a source_quote that appears exactly in the supplied CV.
- COMPLETENESS GATE: before returning the final atom list, inspect the entire CV, not only employment bullet points. Explicitly check the professional summary/profile, header/location, years-of-experience statements, key skills/capabilities, named tools/systems, standards, education, professional qualifications, languages, employment titles/dates, and explicit achievements/metrics.
- Every explicit material fact in those sections that could correspond to a JD requirement must be represented by at least one atom, unless it is already represented by another atom with the same source proposition.
- In particular, do not omit explicit years of experience, named standards (for example IFRS or SYSCOHADA), language abilities, education/credentials, or explicit location facts merely because they are not employment bullets.
- This is a coverage requirement, not a fit judgment: do not invent facts to fill a missing category.
`;

const REQUIREMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          source_quote: { type: "string" },
          normalized_requirement: { type: "string" },
          category: { type: "string" },
          salience: { type: "string", enum: ["CORE", "IMPORTANT", "SUPPORTING", "CONTEXTUAL"] },
          facets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                type: {
                  type: "string",
                  enum: ["FUNCTION","CONTEXT","SCOPE","SCALE","TOOL_METHOD","LEVEL","OWNERSHIP","STAKEHOLDER","GOVERNANCE","OUTCOME"]
                },
                requirement: { type: "string" },
                source_quote: { type: "string" }
              },
              required: ["id","type","requirement","source_quote"]
            }
          },
          extraction_confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["id","source_quote","normalized_requirement","category","salience","facets","extraction_confidence"]
      }
    }
  },
  required: ["requirements"]
} as const;

function responseFormat(name: string, schema: unknown) {
  return {
    type: "json_schema" as const,
    json_schema: { name, strict: true, schema: schema as Record<string, unknown> }
  };
}

function canonicalize(value: string): string {
  return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}



function findExactSpan(
  documentId: string,
  document: string,
  quote: string,
  language: string,
  used: Set<string>,
  spanKind: "ATOM" | "REQUIREMENT" = "ATOM",
): SourceSpan | null {
  const target = quote.trim();
  if (!target) return null;

  let cursor = 0;
  while (cursor <= document.length) {
    const index = document.indexOf(target, cursor);
    if (index < 0) break;
    const key = `${index}:${index + target.length}`;
    if (!used.has(key)) {
      used.add(key);
      return {
        id: `SPAN-${documentId}-${spanKind}-${index}-${index + target.length}`,
        document_id: documentId,
        text: target,
        start_offset: index,
        end_offset: index + target.length,
        language,
      };
    }
    cursor = index + Math.max(1, target.length);
  }

  return null;
}

export function spanWithinParent(parent: SourceSpan, quote: string, spanKind: "FACET" = "FACET"): SourceSpan | null {
  const target = quote.trim();
  if (!target) return null;
  const first = parent.text.indexOf(target);
  if (first < 0) return null;
  const second = parent.text.indexOf(target, first + Math.max(1, target.length));
  if (second >= 0) return null;
  const start = parent.start_offset + first;
  return {
    id: "SPAN-" + parent.document_id + "-" + spanKind + "-" + start + "-" + (start + target.length),
    document_id: parent.document_id,
    text: target,
    start_offset: start,
    end_offset: start + target.length,
    language: parent.language,
  };
}

function exactOrNull(value: string | null | undefined, source: string): string | null {
  const candidate = value?.trim();
  return candidate && source.includes(candidate) ? candidate : null;
}

function exactOrUnknown(value: string | null | undefined, source: string): string {
  const candidate = value?.trim();
  return candidate && source.includes(candidate) ? candidate : "UNKNOWN";
}

export function downgradeUngroundedOutcomeClaim(
  raw: RawCandidateAtom,
  source: string,
): RawCandidateAtom {
  const groundedOutcome = exactOrNull(raw.outcome, source);
  if (raw.assertion_type === "OUTCOME_CLAIM" && !groundedOutcome) {
    return { ...raw, assertion_type: "STATED", outcome: null };
  }
  return { ...raw, outcome: groundedOutcome };
}

function exactArrayOrEmpty(values: string[] | undefined, source: string): string[] {
  return (values ?? []).map(value => value.trim()).filter(value => value && source.includes(value));
}

function canonicalizeRawCandidateAtom(raw: RawCandidateAtom, source: string): RawCandidateAtom {
  // Apply outcome grounding before canonical validation so an LLM cannot
  // classify an atom as OUTCOME_CLAIM when its outcome is not actually
  // present in the source quote.
  const groundedRaw = downgradeUngroundedOutcomeClaim(raw, source);
  const actor = groundedRaw.actor.trim();
  const groundedActor =
    actor && /^(?:candidate|the candidate|candidat|le candidat)$/i.test(actor)
      ? "candidate"
      : exactOrNull(actor, source) ?? "candidate";

  const ownershipMarkers: Record<Exclude<EvidenceOwnership, "UNKNOWN">, RegExp> = {
    INDIVIDUAL: /\b(?:i|i['’]m|i['’]ve|me|my|mine|je|j['’]ai|moi|mon|ma|mes)\b/i,
    TEAM: /\b(?:we|our|team|teams|nous|notre|nos|équipe|équipes)\b/i,
    SHARED: /\b(?:shared|co-owned|partagé|partagée|partagés|partagées)\b/i,
    SUPERVISED: /\b(?:supervised|under supervision|sous supervision|supervisé|supervisée|report(?:ed)? to|rattaché|rattachée)\b/i,
  };
  const ownership = raw.ownership === "UNKNOWN"
    ? "UNKNOWN"
    : ownershipMarkers[raw.ownership]?.test(source)
      ? raw.ownership
      : "UNKNOWN";

  const deterministic = deriveDeterministicVerifiability(source);

  return {
    ...groundedRaw,
    actor: groundedActor,
    ownership,
    normalized_action: exactOrUnknown(raw.normalized_action, source),
    object: exactOrUnknown(raw.object, source),
    domain: exactOrNull(raw.domain, source),
    jurisdiction: exactOrNull(raw.jurisdiction, source),
    situation: exactOrNull(raw.situation, source),
    tools_or_systems: exactArrayOrEmpty(raw.tools_or_systems, source),
    standards: exactArrayOrEmpty(raw.standards, source),
    quantity: exactOrNull(raw.quantity, source),
    currency: exactOrNull(raw.currency, source),
    team_size:
      raw.team_size !== null && source.includes(String(raw.team_size))
        ? raw.team_size
        : null,
    scope: exactOrNull(raw.scope, source),
    start: exactOrNull(raw.start, source),
    end: exactOrNull(raw.end, source),
    recency: exactOrNull(raw.recency, source),
    outcome: exactOrNull(raw.outcome, source),
    has_quantifiable_metric: deterministic.has_quantifiable_metric,
    has_third_party_entity: deterministic.has_third_party_entity,
    has_time_anchor: deterministic.has_time_anchor,
  };
}

function toAtomicEvidence(
  raw: RawCandidateAtom,
  span: SourceSpan,
): AtomicEvidence {
  return {
    id: raw.id,
    source_span_id: span.id,
    provenance: {
      source_type: "CV" as EvidenceSourceType,
      language: span.language,
      extraction_method: "LLM",
    },
    subject: {
      actor: raw.actor,
      ownership: raw.ownership,
    },
    action: {
      normalized_action: raw.normalized_action,
      object: raw.object,
    },
    context: {
      ...(raw.domain ? { domain: raw.domain } : {}),
      ...(raw.jurisdiction ? { jurisdiction: raw.jurisdiction } : {}),
      ...(raw.situation ? { situation: raw.situation } : {}),
      ...(raw.tools_or_systems?.length ? { tools_or_systems: raw.tools_or_systems } : {}),
      ...(raw.standards?.length ? { standards: raw.standards } : {}),
    },
    scale: {
      ...(raw.quantity ? { quantity: raw.quantity } : {}),
      ...(raw.currency ? { currency: raw.currency } : {}),
      ...(raw.team_size !== null ? { team_size: raw.team_size ?? undefined } : {}),
      ...(raw.scope ? { scope: raw.scope } : {}),
    },
    time: {
      ...(raw.start ? { start: raw.start } : {}),
      ...(raw.end ? { end: raw.end } : {}),
      ...(raw.recency ? { recency: raw.recency } : {}),
    },
    outcome: raw.outcome ?? null,
    assertion: { type: raw.assertion_type, polarity: raw.polarity },
    verifiability: {
      has_quantifiable_metric: raw.has_quantifiable_metric,
      has_third_party_entity: raw.has_third_party_entity,
      has_time_anchor: raw.has_time_anchor,
    },
    extraction_confidence: raw.extraction_confidence,
  };
}

async function extractAtoms(
  cv: string,
): Promise<RawCandidateAtom[]> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: responseFormat("canonical_candidate_atoms", CANDIDATE_SCHEMA),
    messages: [
      {
        role: "system",
        content: CANDIDATE_EXTRACTION_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `CV SOURCE:\n${cv}`
      }
    ]
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty canonical candidate extraction response.");


  return JSON.parse(raw).atoms as RawCandidateAtom[];
}

async function extractRequirements(
  jd: string,
): Promise<RawRequirement[]> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: responseFormat("canonical_jd_requirements", REQUIREMENT_SCHEMA),
    messages: [
      {
        role: "system",
        content: `You are the canonical job-requirement decomposer for Interview Mirror.

Source-language rule: preserve the language of the supplied job description in normalized fields. Do not translate, rewrite into the preparation language, or mix languages. Source quotes must remain verbatim. The preparation/product language is irrelevant to this canonical extraction layer.

Extract material requirements directly from the supplied job description.

Hard rules:
- source_quote MUST be copied verbatim from the JD, character-for-character apart from trimming surrounding whitespace. Never paraphrase or rewrite it.
- normalized_requirement is a compact label, but source_quote is always the authoritative employer wording.
- A requirement is a material capability, responsibility, qualification, context or standard stated by the employer.
- For each requirement, choose and verify the requirement source_quote FIRST. It must be the exact contiguous JD passage that contains every facet you return for that requirement; do not choose a narrower parent quote and then attach a facet from outside it.
- Every facet source_quote MUST be an exact contiguous substring of the requirement source_quote, character-for-character apart from trimming surrounding whitespace. Before returning the object, verify this containment for EVERY facet. If any facet is not contained, either expand the requirement source_quote to the exact larger JD passage that contains it, or omit that facet/requirement. Never synthesize, paraphrase, or cross-link quotes from different JD passages.
- Facet requirement text must remain faithful to its facet source quote and must not introduce facts absent from that quote.
- Facets are FUNCTION, CONTEXT, SCOPE, SCALE, TOOL_METHOD, LEVEL, OWNERSHIP, STAKEHOLDER, GOVERNANCE and OUTCOME.
- Do not invent a facet because it is typical for the role.
- Do not use candidate information.
- Salience reflects prominence/materiality within the JD, not candidate fit.
- Prefer fewer fully grounded facets over broader inferred decomposition.
- If an exact source quote cannot be produced, omit that requirement/facet rather than paraphrasing.
`
      },
      {
        role: "user",
        content: `JOB DESCRIPTION SOURCE:\n${jd}`
      }
    ]
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty canonical JD extraction response.");
  return JSON.parse(raw).requirements as RawRequirement[];
}

export type CanonicalShadowResult = {
  pipeline_context: PipelineContext;
  ledger: EvidenceLedger;
  source_spans: SourceSpan[];
  diagnostics: {
    errors: string[];
    warnings: string[];
    candidate_atom_count: number;
    requirement_count: number;
    facet_count: number;
    rejected_atoms: string[];
    rejected_requirements: string[];
  };
};

export async function extractCanonicalShadow(
  session: SessionRecord,
): Promise<CanonicalShadowResult> {
  const language = normalizeLanguage(session.preparation_language);
  const sourceLanguage = detectSourceLanguage(session.cv_text ?? "", "");
  const jdLanguage = detectSourceLanguage(session.job_description ?? "", "");
  const context: PipelineContext = {
    source_language: sourceLanguage === jdLanguage ? sourceLanguage : "mixed",
    product_language: language,
    interview_language: language,
  };

  const contextErrors = validatePipelineContext(context);
  const [rawAtoms, rawRequirements] = await Promise.all([
    extractAtoms(session.cv_text ?? ""),
    extractRequirements(session.job_description ?? ""),
  ]);

  const sourceSpans: SourceSpan[] = [];
  const atoms: AtomicEvidence[] = [];
  const requirements: Requirement[] = [];
  const errors = [...contextErrors];
  const warnings: string[] = [];
  const rejectedAtoms: string[] = [];
  const rejectedRequirements: string[] = [];
  const cvUsed = new Set<string>();
  const jdUsed = new Set<string>();

  for (const raw of rawAtoms) {
    const spanLanguage = detectQuoteLanguage(raw.source_quote, sourceLanguage);
    const span = findExactSpan(`CV-${session.id}`, session.cv_text ?? "", raw.source_quote, spanLanguage, cvUsed, "ATOM");
    if (!span) {
      rejectedAtoms.push(raw.id);
      warnings.push(`Candidate atom ${raw.id} was rejected because its source quote was not an exact CV substring.`);
      continue;
    }

    const canonicalRaw = canonicalizeRawCandidateAtom(raw, span.text);
    const atom = toAtomicEvidence(canonicalRaw, span);
    const atomErrors = [
      ...validateSourceSpan(span),
      ...validateSpanBounds(span, session.cv_text ?? ""),
      ...validateAtomicEvidence(atom),
      ...validateAtomicEvidenceAgainstSource(atom, span),
      ...forbiddenInferenceViolations(atom),
    ];

    if (atomErrors.length) {
      rejectedAtoms.push(raw.id);
      errors.push(...atomErrors.map((error) => `[${raw.id}] ${error}`));
      continue;
    }

    sourceSpans.push(span);
    atoms.push(atom);
  }

  for (const raw of rawRequirements) {
    const requirementSpan = findExactSpan(
      `JD-${session.id}`,
      session.job_description ?? "",
      raw.source_quote,
      detectQuoteLanguage(raw.source_quote, jdLanguage),
      jdUsed,
      "REQUIREMENT",
    );

    if (!requirementSpan) {
      rejectedRequirements.push(raw.id);
      warnings.push(`Requirement ${raw.id} was rejected because its source quote was not an exact JD substring.`);
      continue;
    }

    const facets: RequirementFacet[] = [];
    let facetMappingFailed = false;
    for (const rawFacet of raw.facets) {
      if (!requirementSpan.text.includes(rawFacet.source_quote)) {
        warnings.push(`[${raw.id}/${rawFacet.id}] Facet source quote is not contained in the requirement source quote; facet omitted.`);
        continue;
      }

      const facetSpan = spanWithinParent(requirementSpan, rawFacet.source_quote, "FACET");

      if (!facetSpan) {
        warnings.push(`[${raw.id}/${rawFacet.id}] Facet source quote could not be mapped uniquely in the JD; facet omitted.`);
        continue;
      }

      sourceSpans.push(facetSpan);
      facets.push({
        id: rawFacet.id,
        type: rawFacet.type,
        requirement: canonicalize(rawFacet.requirement),
        source_span_id: facetSpan.id,
      });
    }

    if (facetMappingFailed) {
      rejectedRequirements.push(raw.id);
      warnings.push(`Requirement ${raw.id} was rejected because at least one facet failed deterministic source validation.`);
      continue;
    }

    if (!facets.length) {
      rejectedRequirements.push(raw.id);
      warnings.push(`Requirement ${raw.id} was rejected because no facet survived deterministic source validation.`);
      continue;
    }
    const requirement: Requirement = {
      id: raw.id,
      source_span_id: requirementSpan.id,
      normalized_requirement: canonicalize(raw.normalized_requirement),
      category: canonicalize(raw.category),
      salience: raw.salience,
      facets,
      extraction_confidence: raw.extraction_confidence,
    };

    const requirementErrors = [
      ...validateSourceSpan(requirementSpan),
      ...validateSpanBounds(requirementSpan, session.job_description ?? ""),
    ];

    if (requirementErrors.length) {
      rejectedRequirements.push(raw.id);
      errors.push(...requirementErrors.map((error) => `[${raw.id}] ${error}`));
      continue;
    }

    sourceSpans.push(requirementSpan);
    requirements.push(requirement);
  }

  const uniqueSourceSpans = [...new Map(sourceSpans.map(span => [span.id, span])).values()];
  const ledger: EvidenceLedger = {
    source_spans: uniqueSourceSpans,
    evidence: atoms,
    requirements,
    support_judgments: [],
    requirement_statuses: requirements.map((requirement) => ({
      requirement_id: requirement.id,
      status: "UNRESOLVED",
    })),
    unresolved_items: [],
    candidate_elicitations: [],
    demonstration_objectives: [],
  };

  const graphErrors = validateRequirementGraph(ledger, { allowUnjudgedFacets: true });
  if (graphErrors.length) {
    throw new Error("Canonical extraction graph failed validation: " + graphErrors.join(" | "));
  }

  return {
    pipeline_context: context,
    ledger,
    source_spans: uniqueSourceSpans,
    diagnostics: {
      errors,
      warnings,
      candidate_atom_count: atoms.length,
      requirement_count: requirements.length,
      facet_count: requirements.reduce((sum, requirement) => sum + requirement.facets.length, 0),
      rejected_atoms: rejectedAtoms,
      rejected_requirements: rejectedRequirements,
    },
  };
}
