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
  cv_question_back: string | null;
  completion_state: "COMPLETED_WITH_THREADS" | "COMPLETED_NO_QUALIFYING_RELATIONSHIP" | "ALL_REJECTED";
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

function sourceLanguageForEvidence(ledger: EvidenceLedger, evidenceIds: string[]): "en"|"fr" {
  const wanted=new Set(evidenceIds);
  const languages=new Set(
    supportedAtoms(ledger)
      .filter(atom=>wanted.has(atom.id))
      .map(atom=>ledger.source_spans.find(span=>span.id===atom.source_span_id)?.language)
      .filter((language): language is "en"|"fr"=>language==="en"||language==="fr")
  );
  if(languages.size!==1) throw new Error("D15 invariant violation: thread evidence must resolve to exactly one source language");
  return [...languages][0]!;
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
  if (first === undefined) {
    throw new Error("D15 invariant violation: non-empty lexical token array has no first token");
  }
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
    // Ownership/outcome words in a question can name the unknown being elicited; the
    // independent QUESTION_BACK verifier determines whether the wording asserts a premise.
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

  const completion_state:D15BVerificationResult["completion_state"]=accepted.length>0
    ? "COMPLETED_WITH_THREADS"
    : proposals.length===0
      ? "COMPLETED_NO_QUALIFYING_RELATIONSHIP"
      : "ALL_REJECTED";
  return { accepted, rejected, cv_question_back:null, completion_state };}

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

type D15BCandidateSet = {
  id: string;
  dimension: "CHANGE_CONTINUITY" | "INFORMATION_DECISION" | "DIAGNOSIS_CHANGE" | "MULTIPARTY_RESOLUTION" | "OPERATING_RHYTHM" | "EXTERNAL_INTERNAL_BRIDGE" | "CHANGE_USER_INTERFACE" | "OTHER";
  evidence_ids: string[];
};

const CANDIDATE_SET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          dimension: { type: "string", enum: ["CHANGE_CONTINUITY","INFORMATION_DECISION","DIAGNOSIS_CHANGE","MULTIPARTY_RESOLUTION","OPERATING_RHYTHM","EXTERNAL_INTERNAL_BRIDGE","CHANGE_USER_INTERFACE","OTHER"] },
          evidence_ids: { type: "array", minItems: 2, items: { type: "string" } },
        },
        required: ["id","dimension","evidence_ids"],
      },
    },
  },
  required: ["candidates"],
} as const;

const INTERPRETATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { headline: { type: "string" } },
  required: ["headline"],
} as const;

async function discoverD15BCandidateSets(ledger: EvidenceLedger): Promise<D15BCandidateSet[]> {
  const input = buildD15BSemanticInput(ledger);
  if (input.atoms.length < 2) return [];
  const response = await getOpenAI().chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: jsonSchemaFormat("d15_b_candidate_sets", CANDIDATE_SET_SCHEMA),
    messages: [
      { role: "system", content: `You select evidence relationships for Interview Mirror. Read the COMPLETE eligible evidence set before selecting anything.
Return only candidate evidence sets; do NOT write headlines, summaries, questions, or candidate-facing prose.
A candidate set needs at least two independent source spans whose relationship reveals a professional operating pattern that no single atom states alone.
Use dimensions only as reasoning lenses: CHANGE_CONTINUITY, INFORMATION_DECISION, DIAGNOSIS_CHANGE, MULTIPARTY_RESOLUTION, OPERATING_RHYTHM, EXTERNAL_INTERNAL_BRIDGE, CHANGE_USER_INTERFACE, OTHER.
Select the SMALLEST sufficient evidence set that captures the COMPLETE relationship. Do not add atoms merely because they share a topic and do not optimize coverage.
Rank candidate relationships by professional information gain. Treat the dimensions as operational ranking rules, not labels:
- EXTERNAL_INTERNAL_BRIDGE: prefer direct evidence that customer/user/market observations are carried to internal or senior-management audiences over generic coordination.
- DIAGNOSIS_CHANGE: prefer diagnosis/root-cause evidence paired with a procedure/process change or reorganisation over dashboards/reporting.
- OPERATING_RHYTHM: prefer recurring planning/forecast evidence paired with a structured review cadence over general account/team activity.
- CHANGE_USER_INTERFACE: prefer implementation/rollout evidence paired with user feedback, training, or support over generic project administration.
- CHANGE_CONTINUITY: capture both the evidenced change context and the implementation/process response when both exist. Do not stop at two support/context lines when an additional implementation/process-change atom is needed to complete that relationship.\n- INFORMATION_DECISION: prefer the smallest set that captures the full information-to-decision/stakeholder relationship, not merely adjacent topical duties.
- MULTIPARTY_RESOLUTION: require evidence of a problem plus coordination across the parties involved in resolving it.
When a stronger dimension above is supported, do not substitute a weaker OTHER or topical-coordination bundle using overlapping or nearby evidence. Choose at most ONE best evidence set per meaningful dimension and suppress generic project/administrative coordination when a more informative relationship exists.
Prefer 1-2 strong relationships; maximum 2. Return zero when evidence contains only routine unrelated duties or category-level similarity.
Do not infer facts from titles, employers, typical duties, or outside knowledge. Evidence IDs must come from input. Return JSON only.` },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || '{"candidates":[]}') as { candidates?: D15BCandidateSet[] };
  return Array.isArray(parsed.candidates) ? parsed.candidates : [];
}

async function interpretD15BCandidateSet(ledger: EvidenceLedger, candidate: D15BCandidateSet): Promise<string> {
  const atoms = citedAtomsForVerifier(ledger, candidate.evidence_ids);
  const response = await getOpenAI().chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: jsonSchemaFormat("d15_b_interpretation", INTERPRETATION_SCHEMA),
    messages: [
      { role: "system", content: `Write ONE concise candidate-facing professional insight from ONLY the supplied evidence atoms.
Describe ONLY the relationship/function that emerges when the lines are considered together. Do not explain why that relationship is beneficial, valuable, effective, strategic, successful, improved, enhanced, enabled, strengthened, optimized, or what effect it may have unless that exact effect is explicitly stated in the cited evidence.
Prefer relationship-descriptive constructions such as "Connecting X with Y", "Linking X to Y", "Combining X with Y", or an equally concise factual relationship. Do not merely name a topic, role, activity category, or repeat the reasoning-dimension label.
Do not add purpose or causality with phrases such as "to improve", "to enhance", "enabling", "supporting better", "driving", or equivalent French constructions unless the cited evidence explicitly states that purpose/effect.
Do not invent or upgrade ownership, outcome, metric, date, duration, scale, scope, seniority, entity, place, tool, responsibility, purpose, benefit, or causality.
Write in the same language as the supplied source evidence. The headline is interpretation, never evidence. Return JSON only.` },
      { role: "user", content: JSON.stringify({ source_language: sourceLanguageForEvidence(ledger,candidate.evidence_ids), dimension: candidate.dimension, cited_atoms: atoms }) },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || '{"headline":""}') as { headline?: string };
  return String(parsed.headline ?? "").trim();
}

export async function proposeD15BSemanticThreads(ledger: EvidenceLedger): Promise<D15BSemanticThreadProposal[]> {
  const candidates = await discoverD15BCandidateSets(ledger);
  const eligible = new Set(buildD15BSemanticInput(ledger).atoms.map((atom) => atom.evidence_id));
  const proposals: D15BSemanticThreadProposal[] = [];
  for (const candidate of candidates) {
    const ids = [...new Set(candidate.evidence_ids)];
    if (ids.length < 2 || ids.some((id) => !eligible.has(id))) continue;
    const headline = await interpretD15BCandidateSet(ledger, { ...candidate, evidence_ids: ids });
    if (!headline) continue;
    proposals.push({ id: candidate.id, headline, evidence_ids: ids, question_back: null });
  }
  return proposals;
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
For QUESTION_BACK, a genuine question may ask to establish an unknown fact; reject it only when its wording asserts an unsupported premise as already true. A neutral question asking what the candidate personally owned/did versus supported/assisted is SUPPORTED when cited evidence contains support/assist/help/participate/contribute wording. Do not treat the words "owned", "led", "result", or equivalent inside an interrogative as assertions when they are explicitly asking whether/how much of that unknown was true.
Reject the claim when its language differs from expected_language. Return supported=false whenever uncertain. Return JSON only.`,
      },
      { role: "user", content: JSON.stringify({ claim_type: claimType, expected_language: sourceLanguageForEvidence(ledger,evidenceIds), cited_atoms: atoms, claim }) },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || '{"supported":false,"reason":"empty verifier response"}') as D15BClaimVerification;
  return { supported: parsed.supported === true, reason: String(parsed.reason ?? "") };
}

const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { question_back: { anyOf: [{ type: "string" }, { type: "null" }] } },
  required: ["question_back"],
} as const;

function deterministicOwnershipQuestion(ledger: EvidenceLedger, proposal: D15BSemanticThreadProposal): string | null {
  const atoms = citedAtomsForVerifier(ledger, proposal.evidence_ids);
  const quotes = atoms.map((atom) => atom.source_quote).join(" ");
  const support = /\b(support(?:ed|ing)?|assist(?:ed|ing)?|help(?:ed|ing)?|participat(?:e|ed|ing)|contribut(?:e|ed|ing)|sout(?:enir|enu|enue|enus|enues)|appuy(?:er|é|ée|és|ées)|assist(?:er|é|ée|és|ées)|particip(?:er|é|ée|és|ées|ait|aient)|contribu(?:er|é|ée|és|ées|ait|aient))\b/iu.test(quotes);
  if (!support) return null;
  const language = sourceLanguageForEvidence(ledger, proposal.evidence_ids);
  return language === "fr"
    ? "Dans ce travail, qu’avez-vous personnellement pris en charge, et qu’avez-vous plutôt soutenu ou accompagné ?"
    : "In this work, what did you personally own or do, and what did you mainly support or assist with?";
}

function deterministicOutcomeQuestion(ledger: EvidenceLedger, proposal:D15BSemanticThreadProposal):string {
  return sourceLanguageForEvidence(ledger,proposal.evidence_ids)==="fr"
    ? "Quel résultat concret a suivi ce travail, s’il y en a eu un ?"
    : "What concrete result followed from this work, if any?";
}

async function enrichD15BQuestion(ledger: EvidenceLedger, proposal: D15BSemanticThreadProposal): Promise<string | null> {
  const atoms = citedAtomsForVerifier(ledger, proposal.evidence_ids);
  const response = await getOpenAI().chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    response_format: jsonSchemaFormat("d15_b_question", QUESTION_SCHEMA),
    messages: [
      { role: "system", content: `Generate at most one optional clarification question for an already-valid professional insight.
Return null unless answering the question would materially strengthen the insight.
Priority 1: genuine ownership tension in the EVIDENCE TEXT. Treat support/assist/help/participate/contribute wording (and French soutenir/appuyer/assister/participer/contribuer) as an explicit ownership ambiguity. If the thread depends on such wording, generate a neutral question asking what the candidate personally owned/did versus supported; never presume leadership. Also ask when support-level wording is mixed with stronger implementation/deployment/coordination wording.
Priority 2: an evidenced action/change with no stated result; ask neutrally what changed or resulted.
Do not ask generic ownership merely because ownership metadata is unknown. Do not ask scale or timing by default. Do not assert an unknown fact in the question. Write the question strictly in source_language. Return JSON only.` },
      { role: "user", content: JSON.stringify({ source_language: sourceLanguageForEvidence(ledger,proposal.evidence_ids), headline: proposal.headline, cited_atoms: atoms }) },
    ],
  });
  const parsed = JSON.parse(response.choices[0]?.message?.content || '{"question_back":null}') as { question_back?: string | null };
  const q = parsed.question_back;
  return typeof q === "string" && q.trim() ? q.trim() : null;
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
      const significanceConfirmation = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, proposal.headline, "SIGNIFICANCE");
      if (!significanceConfirmation.supported) {
        rejected.push({ proposal_id: proposal.id, reasons: [`significance judge rejected twice: ${significance.reason} | ${significanceConfirmation.reason}`] });
        continue;
      }
    }
    if (proposal.question_back) {
      const question = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, proposal.question_back, "QUESTION_BACK");
      if (!question.supported) {
        rejected.push({ proposal_id: proposal.id, reasons: [`independent question verifier rejected: ${question.reason}`] });
        continue;
      }
    }
    const preferredQuestion = deterministicOwnershipQuestion(ledger, proposal) ?? await enrichD15BQuestion(ledger, proposal);
    let generatedQuestion = preferredQuestion ?? deterministicOutcomeQuestion(ledger,proposal);
    let questionCheck = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, generatedQuestion, "QUESTION_BACK");
    if (!questionCheck.supported && preferredQuestion) {
      generatedQuestion = deterministicOutcomeQuestion(ledger,proposal);
      questionCheck = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, generatedQuestion, "QUESTION_BACK");
    }
    if (!questionCheck.supported) {
      rejected.push({ proposal_id: proposal.id, reasons: [`required question verifier rejected: ${questionCheck.reason}`] });
      continue;
    }
    accepted.push({ ...proposal, question_back: generatedQuestion });
  }
  const cvLanguage=(()=>{
    const languages=new Set(ledger.source_spans.map(span=>span.language).filter((x):x is "en"|"fr"=>x==="en"||x==="fr"));
    if(languages.size!==1) return "en" as const;
    return [...languages][0]!;
  })();

  const clauseTrim=(text:string,max=96)=>{
    const clean=text.replace(/\\s+/g," ").trim();
    if(clean.length<=max) return clean;
    const head=clean.slice(0,max+1);
    const breaks=[...head.matchAll(/[,;:—–]|\s[-–—]\s/g)].map(m=>m.index ?? -1).filter(i=>i>=40);
    const cut=breaks.length ? breaks[breaks.length-1]! : head.lastIndexOf(" ");
    return clean.slice(0,cut>40?cut:max).trimEnd()+"…";
  };
  // Until E1 carries an explicit role_id, use only responsibility evidence and
  // deterministic source-position spread. Do not infer role boundaries from CV text.
  const eligibleSpans=supportedAtoms(ledger)
    .filter(atom=>atom.assertion.type==="RESPONSIBILITY")
    .map(atom=>ledger.source_spans.find(span=>span.id===atom.source_span_id))
    .filter((span):span is NonNullable<typeof span>=>Boolean(span))
    .sort((a,b)=>(a.start_offset-b.start_offset)||a.id.localeCompare(b.id));
  const selected:typeof eligibleSpans=[];
  if(eligibleSpans.length<=3){
    selected.push(...eligibleSpans);
  }else{
    const positions=[0,Math.floor((eligibleSpans.length-1)/2),eligibleSpans.length-1];
    for(const index of [...new Set(positions)]) selected.push(eligibleSpans[index]!);
  }
  const anchorText=selected.length
    ? selected.map(span=>`“${clauseTrim(span.text)}”`).join(", ")
    : null;
  const cv_question_back=accepted.length===0
    ? (cvLanguage==="fr"
      ? (anchorText
        ? `Votre CV mentionne notamment ${anchorText}. Sans supposer qu'ils forment un même fil conducteur, y a-t-il une manière de travailler ou une responsabilité récurrente qui relie certains de ces éléments ?`
        : "Sans supposer qu’un fil conducteur existe, y a-t-il une manière de travailler ou une responsabilité récurrente qui relie certains éléments de votre parcours ?")
      : (anchorText
        ? `Your CV includes ${anchorText}. Without assuming they form one pattern, is there a recurring way of working or responsibility that connects some of these elements?`
        : "Without assuming there is a common thread, is there a recurring way of working or responsibility that connects some elements of your experience?"))
    : null;
  const completion_state:D15BVerificationResult["completion_state"]=accepted.length>0
    ? "COMPLETED_WITH_THREADS"
    : proposed.length===0
      ? "COMPLETED_NO_QUALIFYING_RELATIONSHIP"
      : "ALL_REJECTED";
  const safeCvQuestion=completion_state==="COMPLETED_NO_QUALIFYING_RELATIONSHIP" ? cv_question_back : null;
  return { accepted, rejected, cv_question_back:safeCvQuestion, completion_state };
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
