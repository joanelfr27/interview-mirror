import { AI_MODEL, getOpenAI, normalizeLanguage } from "@/lib/openai";
import type { SessionRecord } from "@/types";
import {
  type AtomicEvidence,
  type EvidenceLedger,
  type EvidenceOwnership,
  type EvidenceSourceType,
  type Requirement,
  type RequirementFacet,
  type RequirementFacetType,
  type RequirementSalience,
  type SourceSpan,
  validateAtomicEvidence,
  validateSourceSpan,
  validateSpanBounds,
  forbiddenInferenceViolations,
  validatePipelineContext,
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

function detectSourceLanguage(cv: string, jd: string): "en" | "fr" | "mixed" {
  const text = (cv + "\n" + jd).toLowerCase();
  const french = (text.match(/\b(?:expérience|responsabilités|formation|compétences|finance|poste|gestion|diplôme|vous|dans|avec)\b/g) ?? []).length;
  const english = (text.match(/\b(?:experience|responsibilities|education|skills|finance|role|management|degree|you|with|from)\b/g) ?? []).length;
  if (french === 0 && english === 0) return "mixed";
  if (french > english * 1.5) return "fr";
  if (english > french * 1.5) return "en";
  return "mixed";
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
        id: `SPAN-${documentId}-${index}-${index + target.length}`,
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

function spanWithinParent(parent: SourceSpan, quote: string, spanKind: "FACET" = "FACET"): SourceSpan | null {
  const target = quote.trim();
  const relative = parent.text.indexOf(target);
  if (!target || relative < 0) return null;
  const start = parent.start_offset + relative;
  return {
    id: "SPAN-" + parent.document_id + "-" + start + "-" + (start + target.length),
    document_id: parent.document_id,
    text: target,
    start_offset: start,
    end_offset: start + target.length,
    language: parent.language,
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
  language: "en" | "fr",
): Promise<RawCandidateAtom[]> {
  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: responseFormat("canonical_candidate_atoms", CANDIDATE_SCHEMA),
    messages: [
      {
        role: "system",
        content: `You are the canonical candidate-evidence extractor for Interview Mirror.

Source-language rule: preserve the language of the supplied CV in normalized fields. Do not translate, rewrite into the preparation language, or mix languages. Source quotes must remain verbatim. The preparation/product language is irrelevant to this canonical extraction layer.`

Extract atomic evidence directly from the supplied CV. An atom is ONE explicit proposition that can be traced to one exact source quote.

Hard rules:
- source_quote must be copied verbatim from the CV.
- Never summarize multiple unrelated CV statements into one atom.
- Never infer ownership, scope, scale, outcome, seniority, tool, geography, date or responsibility.
- Mark polarity NEGATED only when the CV explicitly negates the proposition; unmentioned is not negated.
- If the CV does not explicitly state a field, return null, [] or UNKNOWN as appropriate.
- Do not use any prior CV analysis, strengths, gaps or strategy.
- Do not judge candidate fit.
- Do not claim that an atom proves a capability; extraction only.
- Keep the normalized action/object faithful to the quote.
- Extraction confidence measures representation accuracy only.
- Prefer enough atoms to preserve the candidate's real professional progression, including role, scope, responsibility, action and explicit outcomes when present.
- Do not create an atom solely because something is plausible for the candidate's job.
- Every atom must have a source_quote that appears exactly in the supplied CV.
`
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
  language: "en" | "fr",
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

Source-language rule: preserve the language of the supplied job description in normalized fields. Do not translate, rewrite into the preparation language, or mix languages. Source quotes must remain verbatim. The preparation/product language is irrelevant to this canonical extraction layer.`

Extract material requirements directly from the supplied job description.

Hard rules:
- source_quote must be copied verbatim from the JD.
- A requirement is a material capability, responsibility, qualification, context or standard stated by the employer.
- Decompose each requirement into only the facets actually present or explicitly implied by the same requirement sentence/phrase.
- Facets are FUNCTION, CONTEXT, SCOPE, SCALE, TOOL_METHOD, LEVEL, OWNERSHIP, STAKEHOLDER, GOVERNANCE and OUTCOME.
- Do not invent a facet because it is typical for the role.
- Do not use candidate information.
- Salience reflects prominence/materiality within the JD, not candidate fit.
- Each facet source_quote must be an exact substring of the requirement source_quote.
- Keep normalized requirements concise and faithful.
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
    extractAtoms(session.cv_text ?? "", language),
    extractRequirements(session.job_description ?? "", language),
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
    const span = findExactSpan(`CV-${session.id}`, session.cv_text ?? "", raw.source_quote, sourceLanguage, cvUsed, "ATOM");
    if (!span) {
      rejectedAtoms.push(raw.id);
      warnings.push(`Candidate atom ${raw.id} was rejected because its source quote was not an exact CV substring.`);
      continue;
    }

    const atom = toAtomicEvidence(raw, span);
    const atomErrors = [
      ...validateSourceSpan(span),
      ...validateSpanBounds(span, session.cv_text ?? ""),
      ...validateAtomicEvidence(atom),
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
      jdLanguage,
      jdUsed,
      "REQUIREMENT",
    );

    if (!requirementSpan) {
      rejectedRequirements.push(raw.id);
      warnings.push(`Requirement ${raw.id} was rejected because its source quote was not an exact JD substring.`);
      continue;
    }

    const facets: RequirementFacet[] = [];
    for (const rawFacet of raw.facets) {
      if (!requirementSpan.text.includes(rawFacet.source_quote)) {
        errors.push(`[${raw.id}/${rawFacet.id}] Facet source quote is not contained in the requirement source quote.`);
        continue;
      }

      const facetSpan = spanWithinParent(requirementSpan, rawFacet.source_quote, "FACET");

      if (!facetSpan) {
        warnings.push(`[${raw.id}/${rawFacet.id}] Facet source quote could not be mapped uniquely in the JD.`);
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
