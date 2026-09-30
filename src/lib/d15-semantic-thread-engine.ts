import type { AtomicEvidence, EvidenceLedger } from "@/lib/canonical-evidence-model";
import type { MirrorMaturity } from "@/lib/professional-mirror";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { d15ThreadEligibleAtoms } from "@/lib/d15-evidence-eligibility";

export type D15BSemanticThreadProposal = {
  id: string;
  headline: string;
  evidence_ids: string[];
  question_back: string | null;
};

export type D15BVerifiedThread = D15BSemanticThreadProposal & {
  maturity: MirrorMaturity;
  verification: "SUPPORTED";
};

export type D15BVerificationResult = {
  accepted: D15BVerifiedThread[];
  rejected: Array<{ proposal_id: string; reasons: string[] }>;
};

const OWNERSHIP_RANK: Record<AtomicEvidence["subject"]["ownership"], number> = {
  UNKNOWN: 0,
  SUPERVISED: 1,
  TEAM: 1,
  SHARED: 2,
  INDIVIDUAL: 3,
};

const OWNERSHIP_ESCALATION = /\b(led|lead|leading|owned|owner|ownership|managed|manager|managing|directed|headed|responsible for|pilot(?:e|é|ée|és|ées|er|ait|aient))\b/iu;
const OUTCOME_ESCALATION = /\b(improved|increased|reduced|saved|grew|accelerated|optimized|optimised|successful|successfully|delivered|achieved|réduit|réduite|réduits|réduites|réduire|diminué|diminuée|amélioré|améliorée|augmenté|augmentée)\b/iu;
const NUMBER_OR_PERCENT = /(?:\b\d+(?:[.,]\d+)?\b|%)/;
const YEAR_OR_DURATION = /(?:\b(?:19|20)\d{2}\b|\b\d+\s*(?:years?|months?|weeks?|days?)\b)/i;
const SCOPE_ESCALATION = /\b(global|regional|enterprise(?:-wide)?|company(?:-wide)?|group(?:-wide)?|organization(?:-wide)?|organisation(?:-wide)?|across\s+\d+\s+(?:countries|markets|teams|entities)|executive|c-suite|board)\b/i;
const SENIORITY_ESCALATION = /\b(senior|head of|director|executive|chief|vice president|vp)\b/i;
const PROPER_NOUN_TOKEN = /\b[A-ZÀ-ÖØ-Þ][\p{L}\p{M}'’.-]{2,}\b/gu;

function supportedAtoms(ledger: EvidenceLedger): AtomicEvidence[] {
  // D15-B consumes the same canonical pre-connection evidence population as
  // the Professional Mirror. This prevents a second eligibility ontology.
  return d15ThreadEligibleAtoms(ledger);
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function citedText(ledger: EvidenceLedger, evidenceIds: string[]): string {
  const wanted = new Set(evidenceIds);
  return supportedAtoms(ledger)
    .filter((atom) => wanted.has(atom.id))
    .map((atom) => {
      const span = ledger.source_spans.find((candidate) => candidate.id === atom.source_span_id);
      return [
        span?.text ?? "",
        atom.action.normalized_action,
        atom.action.object,
        atom.context.domain ?? "",
        atom.scale.quantity ?? "",
        atom.scale.currency ?? "",
        atom.scale.scope ?? "",
        atom.outcome ?? "",
        atom.time.start ?? "",
        atom.time.end ?? "",
        atom.time.recency ?? "",
      ].join(" ");
    })
    .join(" ");
}

const TITLE_CASE_CONNECTORS = new Set(["and","or","of","the","through","its","for","to","in","with","across","during","et","ou","de","du","des","la","le","les","pour","avec","dans"]);

/**
 * Proper-noun hard guard, intentionally narrow.
 * A capitalized token is only treated as a candidate entity when it is the
 * first lexical token and the next lexical token is not also capitalized.
 * This preserves the reviewed Syngenta/Paris adversarial cases without
 * treating ordinary Title Case headlines as named entities.
 */
function unsupportedProperNouns(claim: string, source: string): string[] {
  const sourceNorm = normalized(source);
  const words = claim.trim().match(/[\\p{L}][\\p{L}'’.-]*/gu) ?? [];
  if (words.length === 0) return [];

  const first = words[0];
  const firstIsCapitalized = /^\p{Lu}/u.test(first);
  if (!firstIsCapitalized || TITLE_CASE_CONNECTORS.has(normalized(first))) return [];

  const second = words[1];
  const secondIsCapitalized = second ? /^\p{Lu}/u.test(second) : false;
  if (secondIsCapitalized) return [];

  return sourceNorm.includes(normalized(first)) ? [] : [first];
}
function exactNumericTokens(value: string): string[] {
  return value.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
}
function exactYears(value: string): string[] {
  return value.match(/\b(?:19|20)\d{2}\b/g) ?? [];
}
function unsupportedExactValues(claim: string, source: string): string[] {
  const sourceNumbers = new Set(exactNumericTokens(source));
  const sourceYears = new Set(exactYears(source));
  return [...new Set([
    ...exactNumericTokens(claim).filter((value) => !sourceNumbers.has(value)),
    ...exactYears(claim).filter((value) => !sourceYears.has(value)),
  ])];
}

function threadMaturity(evidenceCount: number): MirrorMaturity {
  // D15-A invariant: canonical role context is unavailable, so any supported
  // semantic thread remains capped at Emerging.
  return evidenceCount > 0 ? "EMERGING_PATTERN" : "INSUFFICIENT_EVIDENCE";
}

function deterministicProposalErrors(
  ledger: EvidenceLedger,
  proposal: D15BSemanticThreadProposal,
): string[] {
  const errors: string[] = [];
  const atoms = supportedAtoms(ledger);
  const byId = new Map(atoms.map((atom) => [atom.id, atom]));
  const uniqueIds = [...new Set(proposal.evidence_ids)];

  if (uniqueIds.length !== proposal.evidence_ids.length) errors.push("duplicate evidence IDs");
  if (uniqueIds.length < 2) errors.push("semantic thread requires at least two evidence atoms");
  if (!proposal.headline.trim()) errors.push("headline is empty");

  const cited = uniqueIds.map((id) => byId.get(id));
  if (cited.some((atom) => !atom)) errors.push("proposal cites unknown or ineligible evidence");

  const citedSpans = new Set(cited.filter(Boolean).map((atom) => atom!.source_span_id));
  if (citedSpans.size < 2) errors.push("semantic thread requires at least two independent source spans");

  const source = citedText(ledger, uniqueIds);
  const sourceNorm = normalized(source);
  const claimNorm = normalized(proposal.headline);

  if (NUMBER_OR_PERCENT.test(proposal.headline) && unsupportedExactValues(proposal.headline, source).length > 0) {
    errors.push("headline introduces an unsupported exact number or percentage");
  }
  if (YEAR_OR_DURATION.test(proposal.headline) && unsupportedExactValues(proposal.headline, source).length > 0) {
    errors.push("headline introduces unsupported exact timing");
  }
  if (OUTCOME_ESCALATION.test(proposal.headline) && !OUTCOME_ESCALATION.test(source)) {
    errors.push("headline introduces an unsupported outcome");
  }
  if (SCOPE_ESCALATION.test(proposal.headline) && !SCOPE_ESCALATION.test(source)) {
    errors.push("headline introduces unsupported scope");
  }
  if (SENIORITY_ESCALATION.test(proposal.headline) && !SENIORITY_ESCALATION.test(source)) {
    errors.push("headline introduces unsupported seniority");
  }
  if (unsupportedProperNouns(proposal.headline, source).length > 0) {
    errors.push("headline introduces an unsupported named entity or place");
  }

  if (OWNERSHIP_ESCALATION.test(proposal.headline)) {
    const strongest = cited
      .filter((atom): atom is AtomicEvidence => Boolean(atom))
      .reduce((rank, atom) => Math.max(rank, OWNERSHIP_RANK[atom.subject.ownership]), 0);
    const ownershipWordGrounded = proposal.headline
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3 && OWNERSHIP_ESCALATION.test(word))
      .some((word) => sourceNorm.includes(normalized(word)));
    if (strongest < OWNERSHIP_RANK.INDIVIDUAL || !ownershipWordGrounded) {
      errors.push("headline risks ownership escalation");
    }
  }

  if (proposal.question_back && !proposal.question_back.trim()) {
    errors.push("question_back is blank");
  }

  // A question may ask about an uncertainty, but it must not state a new fact.
  if (proposal.question_back && !proposal.question_back.trim().endsWith("?")) {
    errors.push("question_back must be phrased as a question");
  }

  if (proposal.question_back) {
    const question = proposal.question_back;
    if (unsupportedExactValues(question, source).length > 0) errors.push("question_back asserts an unsupported exact value");
    if (unsupportedProperNouns(question, source).length > 0) errors.push("question_back asserts an unsupported named entity or place");
    if (OWNERSHIP_ESCALATION.test(question) && !OWNERSHIP_ESCALATION.test(source)) errors.push("question_back asserts unsupported ownership");
    if (OUTCOME_ESCALATION.test(question) && !OUTCOME_ESCALATION.test(source)) errors.push("question_back asserts an unsupported outcome");
    if (SCOPE_ESCALATION.test(question) && !SCOPE_ESCALATION.test(source)) errors.push("question_back asserts unsupported scope");
    if (SENIORITY_ESCALATION.test(question) && !SENIORITY_ESCALATION.test(source)) errors.push("question_back asserts unsupported seniority");
  }

  return errors;
}

export function verifyD15BSemanticThreadProposals(
  ledger: EvidenceLedger,
  proposals: D15BSemanticThreadProposal[],
): D15BVerificationResult {
  const accepted: D15BVerifiedThread[] = [];
  const rejected: D15BVerificationResult["rejected"] = [];
  const seenEvidenceSets = new Set<string>();

  for (const proposal of proposals) {
    const errors = deterministicProposalErrors(ledger, proposal);
    const evidenceKey = [...new Set(proposal.evidence_ids)].sort().join("|");
    if (seenEvidenceSets.has(evidenceKey)) errors.push("duplicate semantic evidence group");

    if (errors.length) {
      rejected.push({ proposal_id: proposal.id, reasons: errors });
      continue;
    }

    seenEvidenceSets.add(evidenceKey);
    accepted.push({
      ...proposal,
      evidence_ids: [...new Set(proposal.evidence_ids)].sort(),
      maturity: threadMaturity(proposal.evidence_ids.length),
      verification: "SUPPORTED",
    });
  }

  return { accepted, rejected };
}

export type D15BClaimVerification = {
  supported: boolean;
  reason: string;
};

const PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          headline: { type: "string" },
          evidence_ids: { type: "array", items: { type: "string" } },
          question_back: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
        required: ["id", "headline", "evidence_ids", "question_back"],
      },
    },
  },
  required: ["proposals"],
} as const;

const VERIFIER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    supported: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["supported", "reason"],
} as const;

function jsonSchemaFormat(name: string, schema: unknown) {
  return { type: "json_schema" as const, json_schema: { name, strict: true, schema: schema as Record<string, unknown> } };
}

export async function proposeD15BSemanticThreads(ledger: EvidenceLedger): Promise<D15BSemanticThreadProposal[]> {
  const input = buildD15BSemanticInput(ledger);
  if (input.atoms.length < 2) return [];
  const response = await getOpenAI().chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: jsonSchemaFormat("d15_b_semantic_threads", PROPOSAL_SCHEMA),
    messages: [
      {
        role: "system",
        content: `You are the whole-CV professional pattern reasoner for Interview Mirror D15-B. Read the complete eligible evidence set before proposing anything. Your job is not to cluster similar duties; it is to discover the few highest-value professional insights that emerge across the candidate's evidence.
Use ONLY the canonical evidence atoms supplied. Do not infer from job titles, employers, typical duties, or outside knowledge.
A thread is a professionally meaningful relationship or function supported by at least two independent evidence atoms/source spans. Reason across the whole CV first, then select evidence for the strongest insights. Use these abstract reasoning dimensions to test candidate relationships: CHANGE_CONTINUITY (a function kept operating while systems/processes/business changed); INFORMATION_DECISION (information or observations carried into management/decision use); DIAGNOSIS_CHANGE (a problem or blockage identified and a procedure/process response followed); MULTIPARTY_RESOLUTION (different parties coordinated around resolving an issue); OPERATING_RHYTHM (planning/forecasting, review and follow-through form a recurring management cadence); EXTERNAL_INTERNAL_BRIDGE (customer/user/market signals connected to internal management); CHANGE_USER_INTERFACE (a system/change connected to the people who adopt or use it). Do not name a dimension unless the evidence relationship exists. These dimensions are a reasoning scaffold, not answers and not evidence. Prefer evidence combinations that demonstrate one dimension over generic topical similarity.
Before returning each proposal, apply this counterfactual test: if its headline could reasonably be used as a section heading on the CV by merely grouping similar duties, reject it. The headline must instead explain a relationship between activities or what function those activities collectively serve. Do not create a thread that merely renames, summarizes, or bundles a role/activity category. Prefer at most 3 high-value threads and usually 1-2; evidence may be left unused. Do not force every role or atom into a thread. If the CV contains only routine unrelated duties with no meaningful relationship across them, return zero proposals.\nSemantic similarity is allowed even when wording differs. Lexical overlap alone is not enough.
Never invent or upgrade ownership, outcomes, metrics, dates, duration, scale, scope, seniority, entities, places, tools, or responsibilities.
The headline is an interpretation, never evidence. Keep it concise and faithful to the cited atoms.
question_back is optional and only for a material uncertainty in an otherwise meaningful thread. At most one per thread. OWNERSHIP-TENSION RULE: when a proposed thread is supported mainly by support/assist/participate/coordinated-with wording, or mixes support-level wording with stronger implementation wording, ask neutrally what the candidate personally owned versus supported. Do not state that they led or owned it. Otherwise, after an evidenced action/change with no result, a neutral outcome question is preferred. Do not ask generic ownership questions merely because an ownership field is unknown, and do not ask scale/timing by default. It must not assert an unsupported premise.
Cite only evidence_id values present in the input. Prefer restraint: return no proposal rather than a weak, merely descriptive, or false thread.
Return JSON only.`,
      },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || '{"proposals":[]}') as { proposals?: D15BSemanticThreadProposal[] };
  return Array.isArray(parsed.proposals) ? parsed.proposals : [];
}

function citedAtomsForVerifier(ledger: EvidenceLedger, evidenceIds: string[]) {
  const wanted = new Set(evidenceIds);
  return buildD15BSemanticInput(ledger).atoms.filter((atom) => wanted.has(atom.evidence_id));
}

export async function verifyD15BClaimIndependently(
  ledger: EvidenceLedger,
  evidenceIds: string[],
  claim: string,
  claimType: "HEADLINE" | "SIGNIFICANCE" | "QUESTION_BACK",
): Promise<D15BClaimVerification> {
  const atoms = citedAtomsForVerifier(ledger, evidenceIds);
  if (!claim.trim() || atoms.length < 2) return { supported: false, reason: "insufficient cited evidence" };
  const response = await getOpenAI().chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: jsonSchemaFormat("d15_b_claim_verification", VERIFIER_SCHEMA),
    messages: [
      {
        role: "system",
        content: `You are the independent D15-B claim verifier. You receive ONLY cited canonical evidence atoms and one candidate-facing claim.
Judge whether the claim stays within those atoms. Do not use outside knowledge or infer from titles or typical duties.
Reject ownership upgrades, invented outcomes, metrics, dates/durations, named entities/places, seniority/scope, tools, responsibilities, or causal claims.
For HEADLINE, verify ONLY factual entailment and truth-boundary safety. Semantic synthesis is allowed when every substantive factual assertion is grounded in the cited atoms. Do not reject a headline merely because it is broad, interpretive, generic, or not insightful; SIGNIFICANCE is evaluated separately.
For SIGNIFICANCE, ignore whether the wording is an exact paraphrase. Judge only professional insight value. supported=true only when combining the cited atoms reveals a useful relationship, bridge, operating pattern, or function that no single cited line states on its own. Category labels, duty summaries, paraphrases, and bundles of similar activities are false. Routine administrative bundles are false. Be strict about insight, but do not re-run factual entailment here.
For QUESTION_BACK, a genuine question may ask to establish an unknown fact; reject it only when its wording asserts an unsupported premise as already true.
Return supported=false whenever uncertain. Return JSON only.`,
      },
      { role: "user", content: JSON.stringify({ claim_type: claimType, cited_atoms: atoms, claim }) },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || '{"supported":false,"reason":"empty verifier response"}') as D15BClaimVerification;
  return { supported: parsed.supported === true, reason: String(parsed.reason ?? "") };
}

export async function runD15BSemanticThreadEngine(ledger: EvidenceLedger): Promise<D15BVerificationResult> {
  const proposed = await proposeD15BSemanticThreads(ledger);
  const deterministic = verifyD15BSemanticThreadProposals(ledger, proposed);
  const accepted: D15BVerifiedThread[] = [];
  const rejected = [...deterministic.rejected];

  for (const proposal of deterministic.accepted) {
    const headline = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, proposal.headline, "HEADLINE");
    if (!headline.supported) {
      rejected.push({ proposal_id: proposal.id, reasons: [`independent headline verifier rejected: ${headline.reason}`] });
      continue;
    }
    const significance = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, proposal.headline, "SIGNIFICANCE");
    if (!significance.supported) {
      rejected.push({ proposal_id: proposal.id, reasons: [`significance judge rejected: ${significance.reason}`] });
      continue;
    }
    if (proposal.question_back) {
      const question = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, proposal.question_back, "QUESTION_BACK");
      if (!question.supported) {
        rejected.push({ proposal_id: proposal.id, reasons: [`independent question verifier rejected: ${question.reason}`] });
        continue;
      }
    }
    accepted.push(proposal);
  }
  return { accepted, rejected };
}

export type D15BSemanticInput = {
  atoms: Array<{
    evidence_id: string;
    source_span_id: string;
    source_quote: string;
    ownership: AtomicEvidence["subject"]["ownership"];
    action: string;
    object: string;
    domain: string | null;
    outcome: string | null;
    scale: {
      quantity: string | null;
      currency: string | null;
      team_size: number | null;
      scope: string | null;
    };
    time: {
      start: string | null;
      end: string | null;
      recency: string | null;
    };
  }>;
};

export function buildD15BSemanticInput(ledger: EvidenceLedger): D15BSemanticInput {
  const atoms = supportedAtoms(ledger);
  return {
    atoms: atoms.map((atom) => {
      const span = ledger.source_spans.find((candidate) => candidate.id === atom.source_span_id);
      if (!span) throw new Error(`D15-B invariant failed: missing source span for ${atom.id}`);
      return {
        evidence_id: atom.id,
        source_span_id: atom.source_span_id,
        source_quote: span.text,
        ownership: atom.subject.ownership,
        action: atom.action.normalized_action,
        object: atom.action.object,
        domain: atom.context.domain ?? null,
        outcome: atom.outcome ?? null,
        scale: {
          quantity: atom.scale.quantity ?? null,
          currency: atom.scale.currency ?? null,
          team_size: atom.scale.team_size ?? null,
          scope: atom.scale.scope ?? null,
        },
        time: {
          start: atom.time.start ?? null,
          end: atom.time.end ?? null,
          recency: atom.time.recency ?? null,
        },
      };
    }),
  };
}
