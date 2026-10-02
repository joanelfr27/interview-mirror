import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createHash } from "node:crypto";

import type { SessionRecord } from "@/types";
import {
  type EvidenceLedger,
  type AtomicEvidence,
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
  relationship_connector?: string | null; licensing_spans: string[];
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
  transfer_probe_presence: Readonly<{ investment_decision: boolean; restricted_funds_reporting: boolean; multi_country_finance: boolean }>;
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
      required: ["id","requirement_id","facet_id","status","supporting_evidence_ids","context_evidence_ids","rationale","confidence","abstained","abstention_reason","support_basis","relationship_connector","licensing_spans","analogical_mapping"],
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
  /\b(?:input\s+(?:to|into|for)|based\s+on|in\s+response\s+to|drives?|feeds?\s+(?:into|to)|shapes?|enables?|influences?|leads?\s+(?:to|into)|turns?\s+.+\s+into|moves?\s+from\s+.+\s+to|because\s+of|as\s+a\s+result\s+of|so\s+that|in\s+order\s+to|depends?\s+on|dependent\s+on|recurr(?:ing|ence)|rhythm|cadence|interface\s+between|connects?\s+.+\s+(?:to|with)|coordinates?\s+.+\s+with|aligns?\s+.+\s+with|(?:use|uses|using|used|apply|applies|applying|applied|integrate|integrates|integrating|integrated|translate|translates|translating|translated)\s+.+\s+(?:in|into|to|for|with)\s+.+)\b/i,
  /(?:^|[^\p{L}\p{N}])(?:en\s+reponse\s+a|base(?:e|es|s)?\s+sur|fonde(?:e|es|s)?\s+sur|grace\s+a|afin\s+de|depend\s+(?:de|des|du)|recurr(?:ent|ente|ents|entes|ence)|rythme|cadence|interface\s+entre|relie\s+.+\s+a|coordonne\s+.+\s+avec|au\s+service\s+(?:de|des|du)|alimente|faconne|permet\s+de|influence|conduit\s+a|transforme\s+.+\s+en|(?:utilise|utiliser|utilisant|applique|appliquer|integrer|integre|integrant|traduit|traduire|traduisant)\s+.+\s+(?:dans|en|a|pour|avec)\s+.+)(?=$|[^\p{L}\p{N}])/iu,
] as const;

// This classifier is intentionally conservative. The frozen G codebook says
// connector tokens are not automatic semantic labels: chronology licenses only
// sequence, and ambiguous purpose/recipient wording requires interpretation.
// General DIRECT anti-composition below remains the fail-closed backstop even
// when a relationship is not mechanically classified here.

function isRelationalFacet(requirement: string): boolean {
  // Match on the same accent-folded representation used by the semantic boundary.
  // This avoids French gender/number/Unicode variants bypassing classification.
  const canonical = normalizeEvidenceText(requirement);
  return RELATIONAL_CONNECTOR_PATTERNS.some(pattern => pattern.test(canonical));
}

function normalizeEvidenceText(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function containsNormalizedPhrase(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeEvidenceText(needle);
  return normalizedNeedle.length > 0 && normalizeEvidenceText(haystack).includes(normalizedNeedle);
}

const RELATION_STOPWORDS = new Set([
  "use","uses","used","using","the","a","an","as","to","into","for","of","and","or","with","from","on","in","by",
  "utilise","utiliser","utilisees","les","la","le","un","une","des","du","de","au","aux","et","ou","avec","pour","par","dans","sur",
]);

function relationshipSideTokens(value: string): string[] {
  return normalizeEvidenceText(value).split(/\s+/).filter(token => token.length >= 3 && !RELATION_STOPWORDS.has(token));
}

const GENERIC_RELATION_PREPOSITIONS = new Set(["in","into","to","for","with","dans","en","a","pour","avec"]);

function relationBearingVerbFamily(facetRequirement: string): Set<string> | null {
  const normalized = normalizeEvidenceText(facetRequirement);
  const families = [
    ["use","uses","using","used"],
    ["apply","applies","applying","applied"],
    ["integrate","integrates","integrating","integrated"],
    ["translate","translates","translating","translated"],
    ["utilise","utiliser","utilisant"],
    ["applique","appliquer","appliquant"],
    ["integrer","integre","integrant"],
    ["traduit","traduire","traduisant"],
  ];
  const family = families.find(forms => forms.some(form => normalized.split(/\s+/).includes(form)));
  return family ? new Set(family) : null;
}

function connectorBindsFacetSides(facetRequirement: string, connector: string, licensingSpan: string): boolean {
  const facet = normalizeEvidenceText(facetRequirement);
  const normalizedConnector = normalizeEvidenceText(connector);
  const facetIndex = facet.indexOf(normalizedConnector);
  if (facetIndex < 0) return false;
  const leftTokens = relationshipSideTokens(facet.slice(0, facetIndex));
  const rightTokens = relationshipSideTokens(facet.slice(facetIndex + normalizedConnector.length));
  if (!leftTokens.length || !rightTokens.length) return false;

  // A connector must bind both facet sides inside one semantic clause. Commas and
  // coordinators delimit independent propositions so co-occurrence cannot masquerade
  // as a relationship merely because it appears in one sentence/source span.
  const sentences = licensingSpan.normalize("NFC")
    .split(/[.!?;:,\n]+|\b(?:and|but|while|whereas|et|mais|tandis\s+que|alors\s+que)\b/iu)
    .map(sentence => normalizeEvidenceText(sentence))
    .filter(Boolean);
  return sentences.some(sentence => {
    const connectorIndex = sentence.indexOf(normalizedConnector);
    if (connectorIndex < 0) return false;
    const before = sentence.slice(0, connectorIndex);
    const after = sentence.slice(connectorIndex + normalizedConnector.length);
    if (!leftTokens.some(token => before.includes(token)) || !rightTokens.some(token => after.includes(token))) return false;
    if (GENERIC_RELATION_PREPOSITIONS.has(normalizedConnector)) {
      const verbFamily = relationBearingVerbFamily(facetRequirement);
      const beforeTokens = before.split(/\s+/);
      if (!verbFamily || !beforeTokens.some(token => verbFamily.has(token))) return false;
    }
    return true;
  });
}

function stemContentToken(token: string): string {
  let t = normalizeEvidenceText(token);
  // Conservative inflection folding only; this is not a semantic synonym map.
  if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  else if (t.length > 4 && t.endsWith("es")) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s")) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith("x")) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

function semanticClauses(value: string): string[] {
  return value.normalize("NFC")
    .split(/[.!?;:,\n]+|\b(?:and|but|while|whereas|then|after|before|followed\s+by|et|mais|tandis\s+que|alors\s+que|puis|ensuite|avant|après)\b/iu)
    .map(clause => normalizeEvidenceText(clause))
    .filter(Boolean);
}

const FACET_CONTENT_STOPWORDS = new Set([
  ...RELATION_STOPWORDS,
  "experience","experienced","manage","managed","management","prepare","prepared","introduce","introduced",
  "run","ran","role","responsible","responsibility","required","requirement",
  "experience","gestion","gerer","gere","preparer","prepare","introduire","introduit","realiser","realise",
]);

function facetContentTokens(value: string): string[] {
  return [...new Set(normalizeEvidenceText(value).split(/\s+/)
    .filter(token => token.length >= 3 && !FACET_CONTENT_STOPWORDS.has(token))
    .map(stemContentToken)
    .filter(token => token.length >= 3))];
}

function facetContentGroups(value: string): string[][] {
  const normalized = normalizeEvidenceText(value);
  const relational = isRelationalFacet(value);
  // A plain conjunctive requirement lists independently required content ("budgeting
  // and forecasting"). A relational proposition keeps coordination inside the asserted
  // relationship and must be licensed within one evidence clause.
  const splitter = relational
    ? /[.!?;:,\n]+|\b(?:but|while|whereas|then|after|before|followed\s+by|mais|tandis\s+que|alors\s+que|puis|ensuite|avant|après)\b/iu
    : /[.!?;:,\n]+|\b(?:and|or|but|while|whereas|then|after|before|followed\s+by|et|ou|mais|tandis\s+que|alors\s+que|puis|ensuite|avant|après)\b/iu;
  return normalized.split(splitter).map(facetContentTokens).filter(group => group.length > 0);
}

function clauseTokenSet(value: string): Set<string> {
  return new Set(normalizeEvidenceText(value).split(/\s+/).filter(Boolean).map(stemContentToken));
}

const PREPOSITIONAL_GROUP_JOINERS = new Set(["in","into","to","for","with","dans","en","a","pour","avec"]);

const PREPOSITIONAL_MODIFIERS = new Set([
  "monthly","weekly","daily","annual","annually","financial","strong","regular","strategic","operational",
  "mensuel","mensuelle","hebdomadaire","quotidien","quotidienne","annuel","annuelle","financier","financiere","fort","forte",
]);
const LOCAL_RIGHT_SKIP = new Set(["the","a","an","le","la","les","un","une","des","du","de","d","weekly","monthly","annual","strategic","operational","financial","hebdomadaire","mensuel","mensuelle","annuel","annuelle","financier","financiere"]);

function prepositionalFacetParts(facetRequirement: string): { words: string[]; prepIndex: number; preposition: string; left: string[]; right: string[]; verbFamily: Set<string> | null } | null {
  const words = normalizeEvidenceText(facetRequirement).split(/\s+/).filter(Boolean);
  const prepIndex = words.findIndex((word, index) => index > 0 && index < words.length - 1 && PREPOSITIONAL_GROUP_JOINERS.has(word));
  if (prepIndex < 0) return null;

  let verbFamily: Set<string> | null = null;
  const first = words[0];
  const known = relationBearingVerbFamily(first);
  if (known) verbFamily = known;
  else if (first && !PREPOSITIONAL_MODIFIERS.has(first) && !RELATION_STOPWORDS.has(first)) {
    // Only treat the leading word as an unclassified relation verb when its family
    // can actually be observed as a predicate in evidence. The caller enforces that.
    const stem = stemContentToken(first);
    const forms = new Set([first, stem, stem+"s", stem+"ed", stem+"ing", stem+"e", stem+"er", stem+"é", stem+"ée", stem+"és", stem+"ées"]);
    if (first.endsWith("er") && first.length > 4) {
      const fs = first.slice(0,-2);
      for (const suffix of ["e","é","ée","és","ées","ait","ais","aient"]) forms.add(fs+suffix);
    }
    verbFamily = forms;
  }

  const leftWords = words.slice(verbFamily ? 1 : 0, prepIndex);
  const left = facetContentTokens(leftWords.join(" "));
  const right = facetContentTokens(words.slice(prepIndex + 1).join(" "));
  if (!left.length || !right.length) return null;
  return { words, prepIndex, preposition: words[prepIndex], left, right, verbFamily };
}

function clausePreservesFacetRelation(
  clause: string,
  parts: { preposition: string; left: string[]; right: string[]; verbFamily: Set<string> | null },
): boolean {
  const words = normalizeEvidenceText(clause).split(/\s+/).filter(Boolean);
  const stems = words.map(stemContentToken);

  // Modifier-led facets were classified verb-less when the facet was parsed.
  // For a genuinely verb-led facet, absence of its own verb family cannot be
  // reinterpreted as verb-less: it is an understatement-safe PARTIAL condition.
  const verbIndex = parts.verbFamily ? words.findIndex(word => parts.verbFamily!.has(word)) : -1;
  if (parts.verbFamily && verbIndex < 0) return false;
  const requireVerb = Boolean(parts.verbFamily);

  for (let prepIndex = 0; prepIndex < words.length; prepIndex++) {
    if (words[prepIndex] !== parts.preposition) continue;

    const leftIndexes = stems.map((token,index) => parts.left.includes(token) ? index : -1)
      .filter(index => index >= 0 && index < prepIndex);
    if (!leftIndexes.length) continue;
    const leftStart = Math.min(...leftIndexes);
    if (requireVerb && verbIndex >= leftStart) continue;
    // For verb-less/modifier-led facets, do not let an unrelated evidence verb\n    // reverse the facet relation (e.g. "Configured SAP in the reporting team"\n    // cannot directly satisfy "Reporting in SAP"). The facet-left content must\n    // occur before the facet preposition in the source clause.\n    if (!requireVerb && leftStart === 0 && words.length > 1 && !parts.left.includes(stems[0])) continue;

    // The right group must begin locally after the facet's own preposition. Permit
    // at most two determiner/adjective tokens; another preposition breaks binding.
    let cursor = prepIndex + 1;
    let skipped = 0;
    while (cursor < words.length && skipped < 2 && LOCAL_RIGHT_SKIP.has(words[cursor])) {
      cursor++; skipped++;
    }
    if (cursor >= words.length || PREPOSITIONAL_GROUP_JOINERS.has(words[cursor])) continue;
    if (!parts.right.includes(stems[cursor])) continue;
    return true;
  }
  return false;
}

function prepositionalDirectLacksRelationLicense(facetRequirement: string, citedSourceTexts: string[]): boolean {
  if (isRelationalFacet(facetRequirement)) return false;
  const parts = prepositionalFacetParts(facetRequirement);
  if (!parts) return false;

  for (const source of citedSourceTexts) {
    for (const clause of semanticClauses(source)) {
      if (clausePreservesFacetRelation(clause, parts)) return false;
    }
  }
  return true;
}

function directEvidenceContentIsSplitAcrossClauses(
  facetRequirement: string,
  citedSourceTexts: string[],
): boolean {
  const groups = facetContentGroups(facetRequirement);
  if (!groups.some(group => group.length >= 2)) return false;

  for (const source of citedSourceTexts) {
    const clauseTokens = semanticClauses(source).map(clauseTokenSet);
    for (const group of groups) {
      const matched = group.filter(token => clauseTokens.some(tokens => tokens.has(token)));
      if (matched.length < 2) continue;
      if (!clauseTokens.some(tokens => matched.every(token => tokens.has(token)))) return true;
    }
  }
  return false;
}

function buildCanonicalRationale(item: RawJudgment): string {
  if (item.status === "NONE" || item.abstained) return "No validated evidence subset supports a positive judgment for this facet.";
  const ids = item.supporting_evidence_ids.join(", ");
  if (item.relationship_connector?.trim() && item.licensing_spans.length) {
    return item.status + " support from minimal evidence [" + ids + "]; relationship connector \"" +
      item.relationship_connector.trim() + "\" is licensed by exact source span(s): " +
      item.licensing_spans.map(span => "\"" + span.trim() + "\"").join("; ") + ".";
  }
  return item.status + " support from minimal evidence [" + ids + "].";
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

function rationaleExplicitlyReferencesEvidenceId(rationale: string, evidenceId: string): boolean {
  const escapedId = evidenceId.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  // Symbolic IDs (for example A2/E13) remain valid as standalone references.
  // Bare numeric IDs are intentionally NOT matched as standalone numbers because
  // real rationales legitimately contain quantities such as 13+ years, 14
  // countries, or USD 50,000. Numeric IDs require an explicit evidence/atom label.
  if (!/[A-Za-z_-]/.test(evidenceId)) {
    const numericLabel = new RegExp(
      "(?:evidence|atom)\\s*(?:id\\s*)?(?:#|:)\\s*[\\\"'\\[]?" + escapedId + "(?![\\w.-])",
      "i",
    );
    return numericLabel.test(rationale);
  }
  const explicitLabel = new RegExp(
    "(?:evidence|atom)(?:\\s+id)?\\s*(?:#|:)?\\s*[\\\"'\\[]?" + escapedId + "(?![\\w.-])",
    "i",
  );
  if (explicitLabel.test(rationale)) return true;
  const standaloneId = new RegExp("(^|[^\\w.-])" + escapedId + "(?![\\w.-])", "i");
  return standaloneId.test(rationale);
}

function validateRelationalAndRationaleBoundary(item: RawJudgment, facet: EvidenceLedger["requirements"][number]["facets"][number], ledger: EvidenceLedger): string[] {
  const errors: string[] = [];
  const relational = isRelationalFacet(facet.requirement);
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
    const connector = item.relationship_connector?.trim() ?? "";
    if (!connector) errors.push("relational DIRECT requires an explicit relationship_connector.");
    if (connector && !containsNormalizedPhrase(facet.requirement, connector)) {
      errors.push("relational DIRECT connector must be explicitly present in the facet wording.");
    }
    if (!item.licensing_spans.length) errors.push("relational DIRECT requires at least one exact licensing span.");
    for (const licensingSpan of item.licensing_spans) {
      const exact = licensingSpan.trim();
      if (!exact || !citedSourceTexts.some(source => source.includes(exact))) {
        errors.push("relational DIRECT licensing span must be an exact quote from the minimal supporting evidence subset.");
      } else if (connector && !containsNormalizedPhrase(exact, connector)) {
        errors.push("relational DIRECT licensing span must explicitly contain the asserted relationship connector.");
      } else if (connector && !connectorBindsFacetSides(facet.requirement, connector, exact)) {
        errors.push("relational DIRECT licensing span must bind content from both sides of the facet relationship in the same clause.");
      }
    }
    if (item.supporting_evidence_ids.length > 1) {
      const sourceSpanIds = new Set(
        item.supporting_evidence_ids.map(id => byId.get(id)?.source_span_id).filter((id): id is string => Boolean(id))
      );
      if (sourceSpanIds.size > 1) {
        errors.push("relational DIRECT must be licensed within one preserved source reference; independent activities cannot be composed into a DIRECT relationship.");
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
    if (rationaleExplicitlyReferencesEvidenceId(item.rationale, atom.id)) errors.push("rationale explicitly relies on an evidence ID outside the minimal supporting subset.");
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
  compactEvidence: Array<{ id: string; source_quote?: string; action?: { normalized_action?: string; object?: string }; context?: Record<string, unknown>; scale?: Record<string, unknown> }>;
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
    transfer_probe_presence: (() => {
      const corpus = args.compactEvidence.map((atom) => JSON.stringify(atom)).join(" ").toLowerCase();
      return {
        investment_decision: /investment/.test(corpus) && /decision/.test(corpus),
        restricted_funds_reporting: /restricted/.test(corpus) && /fund/.test(corpus) && /report/.test(corpus),
        multi_country_finance: /(?:multi[- ]country|countries|pays)/.test(corpus) && /financ/.test(corpus),
      };
    })(),
  };
}

const SPECIFICITY_DOMAIN_GROUPS = [
  ["m&a", "mergers and acquisitions", "fusions acquisitions", "fusion acquisition"],
  ["private equity", "pe", "capital investissement"],
  ["project finance", "financement de projet"],
  ["asset management", "gestion d actifs", "gestion d actifs"],
] as const;

function normalizedSpecificityText(value: string): string {
  return normalizeEvidenceText(value)
    .replace(/[’']/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function specificityGroupsNamed(value: string): number[] {
  const normalized = normalizedSpecificityText(value);
  return SPECIFICITY_DOMAIN_GROUPS.flatMap((aliases, index) =>
    aliases.some(alias => {
      const token = normalizedSpecificityText(alias);
      if (token === "pe") return new RegExp("(?:^|\\s)pe(?:$|\\s)", "i").test(normalized);
      if (token === "m and a") return /(?:^|\s)m\s+and\s+a(?:$|\s)/i.test(normalized);
      return normalized.includes(token);
    }) ? [index] : []
  );
}

function directLacksNamedDomainSpecificity(
  facet: EvidenceLedger["requirements"][number]["facets"][number],
  citedAtoms: AtomicEvidence[],
  ledger: EvidenceLedger,
): boolean {
  if (facet.type !== "LEVEL") return false;
  const requiredGroups = specificityGroupsNamed(facet.requirement);
  if (requiredGroups.length === 0) return false;
  const citedText = citedAtoms.map(atom => {
    const source = ledger.source_spans.find(span => span.id === atom.source_span_id)?.text ?? "";
    return [source, atom.action.object, atom.context.domain ?? "", atom.context.situation ?? ""].join(" ");
  }).join(" ");
  const evidencedGroups = new Set(specificityGroupsNamed(citedText));
  return !requiredGroups.some(group => evidencedGroups.has(group));
}

function directLacksEducationFieldSpecificity(
  facet: EvidenceLedger["requirements"][number]["facets"][number],
  citedAtoms: AtomicEvidence[],
): boolean {
  if (facet.type !== "LEVEL") return false;
  const requirement = normalizedSpecificityText(facet.requirement);
  const asksSpecificMastersField = /\b(?:master|masters|master s|degree|diplome)\b/.test(requirement) &&
    /\b(?:finance|accounting|comptabilite)\b/.test(requirement);
  if (!asksSpecificMastersField) return false;
  const credentials = citedAtoms.filter(atom => atom.assertion.type === "CREDENTIAL");
  if (!credentials.length) return false;
  return !credentials.some(atom => {
    const field = normalizedSpecificityText(atom.action.object);
    return /\b(?:finance|accounting|comptabilite)\b/.test(field);
  });
}


export function sanitizeJudgments(raw: RawJudgment[], ledger: EvidenceLedger): { judgments: SupportJudgment[]; errors: string[] } {
  const errors: string[] = [];
  const evidenceIds = new Set(ledger.evidence.map(x => x.id));
  const requirements = new Map(ledger.requirements.map(x => [x.id, x]));
  const valid: SupportJudgment[] = [];
  const seenFacetKeys = new Set<string>();

  for (const item of raw) {
    let deterministicRationaleOverride: string | null = null;
    const req = requirements.get(item.requirement_id);
    const facet = req?.facets.find(x => x.id === item.facet_id);
    if (!req || !facet) { errors.push("Rejected judgment " + item.id + ": unknown requirement/facet."); continue; }

    const facetKey = item.requirement_id + "::" + item.facet_id;
    if (seenFacetKeys.has(facetKey)) {
      errors.push("Rejected judgment " + item.id + ": duplicate judgment for the same requirement facet.");
      continue;
    }
    seenFacetKeys.add(facetKey);

    const unknownSupportingIds = [...new Set(item.supporting_evidence_ids)].filter(id => !evidenceIds.has(id));
    const unknownContextIds = [...new Set(item.context_evidence_ids ?? [])].filter(id => !evidenceIds.has(id));
    if (unknownSupportingIds.length || unknownContextIds.length) {
      errors.push("Rejected judgment " + item.id + ": unknown evidence ID in support/context citations.");
      continue;
    }
    const cited = [...new Set(item.supporting_evidence_ids)];
    item.context_evidence_ids = [...new Set(item.context_evidence_ids ?? [])];
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
      errors.push("Rejected judgment " + item.id + ": mixed documented and elicited evidence is not permitted in one support judgment.");
      continue;
    }
    item.support_basis = hasElicited ? "CANDIDATE_SELF_REPORTED" : "DOCUMENTED";
    if (hasElicited && item.status === "DIRECT") {
      item.status = "PARTIAL";
      deterministicRationaleOverride = "Candidate self-reported evidence cannot establish DIRECT support; conservatively downgraded to PARTIAL.";
      item.rationale = deterministicRationaleOverride;
      item.confidence = Math.min(item.confidence, 0.8);
    }

    // General anti-composition invariant: DIRECT support cannot be assembled from
    // independent source spans. For relational facets this is a hard rejection because
    // composition could manufacture the relationship. For non-relational facets the
    // evidence can still support the requirement, but only at PARTIAL.
    if (item.status === "DIRECT") {
      const sourceSpanIds = new Set(citedAtoms.map(atom => atom.source_span_id));
      if (sourceSpanIds.size > 1) {
        if (isRelationalFacet(facet.requirement) || Boolean(item.relationship_connector?.trim())) {
          errors.push("Rejected judgment " + item.id + ": relational DIRECT cannot compose independent source spans; use a single preserved source reference.");
          continue;
        }
        item.status = "PARTIAL";
        deterministicRationaleOverride = "Multiple independent source spans support this facet, so DIRECT is conservatively downgraded to PARTIAL.";
        item.rationale = deterministicRationaleOverride;
        item.confidence = Math.min(item.confidence, 0.8);
      }
    }

    
    // General downgrade-only specificity boundary: a LEVEL requirement that names
    // a specific professional field cannot be DIRECT from generic tenure alone.
    // This guard never creates NONE and intentionally uses only the frozen alias set.
    if (item.status === "DIRECT" && directLacksNamedDomainSpecificity(facet, citedAtoms, ledger)) {
      item.status = "PARTIAL";
      deterministicRationaleOverride = "The cited evidence establishes relevant experience, but does not explicitly document experience in one of the specific professional fields named by the requirement.";
      item.rationale = deterministicRationaleOverride;
      item.confidence = Math.min(item.confidence, 0.8);
    }

// Education-field specificity uses the same downgrade-only boundary rather than a credential-specific exception.
    if (item.status === "DIRECT" && directLacksEducationFieldSpecificity(facet, citedAtoms)) {
      item.status = "PARTIAL";
      deterministicRationaleOverride = "The cited credential establishes Master's-level education, but the required Finance or Accounting specialization is not explicitly documented.";
      item.rationale = deterministicRationaleOverride;
      item.confidence = Math.min(item.confidence, 0.8);
    }

    const prepositionalUnlicensedDirect = item.status === "DIRECT" && prepositionalDirectLacksRelationLicense(
      facet.requirement,
      citedAtoms.map(atom => ledger.source_spans.find(span => span.id === atom.source_span_id)?.text ?? ""),
    );
    if (prepositionalUnlicensedDirect) {
      item.status = "PARTIAL";
      deterministicRationaleOverride = "The cited evidence contains both content groups but does not explicitly license the facet's prepositional relationship; conservatively downgraded to PARTIAL.";
      item.rationale = deterministicRationaleOverride;
      item.confidence = Math.min(item.confidence, 0.8);
    }

    const clauseSplitDirect = item.status === "DIRECT" && directEvidenceContentIsSplitAcrossClauses(
      facet.requirement,
      citedAtoms.map(atom => ledger.source_spans.find(span => span.id === atom.source_span_id)?.text ?? ""),
    );
    if (clauseSplitDirect) {
      item.status = "PARTIAL";
      deterministicRationaleOverride = "Facet content is distributed across independent evidence clauses, so co-occurrence cannot establish DIRECT support; conservatively downgraded to PARTIAL.";
      item.rationale = deterministicRationaleOverride;
      item.confidence = Math.min(item.confidence, 0.8);
    }

    const semanticBoundaryErrors = validateRelationalAndRationaleBoundary(item, facet, ledger);
    if (semanticBoundaryErrors.length) {
      errors.push(...semanticBoundaryErrors.map(error => "[" + item.id + "] " + error));
      continue;
    }

    const validation = validateSupportJudgmentAgainstFacet(item, facet, ledger.evidence);
    if (validation.length) { errors.push(...validation.map(x => "[" + item.id + "] " + x)); continue; }
    // Candidate-facing/downstream rationale is deterministic and derived only from the
    // validated minimal subset. The raw model rationale remains available in diagnostics.
    item.rationale = deterministicRationaleOverride ?? buildCanonicalRationale(item);
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
    "Relationship grounding is classified deterministically from the FACET wording; do not infer the classification yourself. For a relational DIRECT judgment, relationship_connector is required and licensing_spans must quote the exact words in the minimal supporting evidence that license that connector. Co-occurrence is not a relationship; chronology is not causality or purpose. Two separately documented activities cannot be combined to manufacture a DIRECT relationship. If the relationship exists only in candidate elicitation, use CANDIDATE_SELF_REPORTED and remain below DIRECT. Never mention or paraphrase evidence outside supporting_evidence_ids in the rationale; context_evidence_ids is non-licensing context only.\n" +
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
