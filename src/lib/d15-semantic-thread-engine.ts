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

const OWNERSHIP_ESCALATION = /\b(led|lead|leading|owned|owner|ownership|managed|manager|managing|directed|headed|responsible for)\b/i;
const OUTCOME_ESCALATION = /\b(improved|increased|reduced|saved|grew|accelerated|optimized|optimised|successful|successfully|delivered|achieved)\b/i;
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

function unsupportedProperNouns(claim: string, source: string): string[] {
  const sourceNorm = normalized(source);
  const tokens = claim.match(PROPER_NOUN_TOKEN) ?? [];
  return [...new Set(tokens.filter((token, index) => index > 0 || !claim.trim().startsWith(token))
    .filter((token) => !sourceNorm.includes(normalized(token))))];
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

  if (NUMBER_OR_PERCENT.test(proposal.headline) && !NUMBER_OR_PERCENT.test(source)) {
    errors.push("headline introduces an unsupported number or percentage");
  }
  if (YEAR_OR_DURATION.test(proposal.headline) && !YEAR_OR_DURATION.test(source)) {
    errors.push("headline introduces unsupported timing");
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
        content: `You are a bounded semantic pattern proposer for Interview Mirror D15-B.
Use ONLY the canonical evidence atoms supplied. Do not infer from job titles, employers, typical duties, or outside knowledge.
A thread is a recurring professional pattern supported by at least two independent evidence atoms/source spans.
Semantic similarity is allowed even when wording differs. Lexical overlap alone is not enough.
Never invent or upgrade ownership, outcomes, metrics, dates, duration, scale, scope, seniority, entities, places, tools, or responsibilities.
The headline is an interpretation, never evidence. Keep it concise and faithful to the cited atoms.
question_back may ask the candidate to clarify an uncertainty exposed by the cited evidence, but must not assert an unsupported premise.
Cite only evidence_id values present in the input. Prefer restraint: return no proposal rather than a weak or false thread.
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
  claimType: "HEADLINE" | "QUESTION_BACK",
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
For HEADLINE, semantic synthesis is allowed only when every substantive assertion is supported by the cited atoms.
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
