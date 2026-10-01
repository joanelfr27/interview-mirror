import type { AtomicEvidence, EvidenceLedger } from "@/lib/canonical-evidence-model";
import type { MirrorMaturity } from "@/lib/professional-mirror";
import { AI_MODEL, createOpenAICompletion } from "@/lib/openai";
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
  rejected: Array<{ proposal_id: string; reasons: string[]; diagnostic_headline?: string }>;
  cv_question_back: string | null;
  completion_state: "COMPLETED_WITH_THREADS" | "COMPLETED_NO_QUALIFYING_RELATIONSHIP" | "ALL_REJECTED" | "ERROR";
};

const OWNERSHIP_RANK: Record<AtomicEvidence["subject"]["ownership"], number> = {
  UNKNOWN: 0,
  SUPERVISED: 1,
  TEAM: 1,
  SHARED: 2,
  INDIVIDUAL: 3,
};

const OWNERSHIP_ESCALATION = /(?<!\p{L})(led|lead|leading|owned|owner|ownership|managed|manager|managing|directed|headed|responsible for|pilot(?:e|é|ée|és|ées|er|ait|aient))(?!\p{L})/iu;
const OWNERSHIP_PREMISE = /(?:^|[.!?]\\s*)(?:since|as|given that|because|after)\\s+you\\s+/iu;
const OUTCOME_ESCALATION = /\b(improved|increased|reduced|saved|grew|accelerated|optimized|optimised|successful|successfully|delivered|delivering|achieved|ensuring|ensures|guaranteeing|guarantees|effective|effectively|réduit|réduite|réduits|réduites|réduire|diminué|diminuée|amélioré|améliorée|augmenté|augmentée|garantissant|garantit|garantir|efficace|efficacement)\b/iu;
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

const PROPER_NOUN_STOP_WORDS = new Set([
  "and","or","of","the","through","its","for","to","in","with","across","during","a","an",
  "et","ou","de","du","des","la","le","les","pour","avec","dans","un","une",
  "finance","change","operating","rhythm","customer","portal","rollout","user","feedback",
  "integration","accounting","systems","support","process","processes","delivery","delays",
  "you","your","vous","votre","vos","ce","cet","cette","ces",
]);
const SENTENCE_INITIAL_VERB_MORPHOLOGY=/(?:ing|ed|ant|ent|é|ée|és|ées)$/iu;
const ENTITY_PREPOSITIONS=new Set(["for","with","at","in","from","chez","avec","à","a","dans","pour"]);
const SUPPORT_LEVEL_VERBS=new Set([
  "assist","assisted","assisting","support","supported","supporting","help","helped","helping",
  "contribute","contributed","contributing","participate","participated","participating",
  "collect","collected","collecting","organise","organised","organising","organize","organized","organizing",
  "follow","followed","following","aid","aided","aiding",
  "participait","participer","participé","participée","participés","participées",
  "aidait","aider","aidé","aidée","aidés","aidées","organisait","organiser","organisé","organisée","organisés","organisées",
  "suivait","suivre","suivi","suivie","suivis","suivies","assistait","assister","assisté","assistée","assistés","assistées",
  "soutenait","soutenir","soutenu","soutenue","soutenus","soutenues","contribuait","contribuer","contribué","contribuée","contribués","contribuées",
]);
const OWNERSHIP_LEVEL_VERBS=new Set([
  "provide","provided","providing","deliver","delivered","delivering","lead","led","leading",
  "manage","managed","managing","own","owned","owning","direct","directed","directing","run","ran","running",
  "gérer","gère","gérez","géré","gérée","gérés","gérées","gérant",
  "piloter","pilote","piloté","pilotée","pilotés","pilotées","pilotant",
  "diriger","dirige","dirigé","dirigée","dirigés","dirigées","dirigeant",
  "assurer","assure","assuré","assurée","assurés","assurées","assurant",
]);

function lexicalWords(value:string):string[]{
  return (normalized(value).match(/[\p{L}][\p{L}'’.-]*/gu)??[]).map(word=>word.replace(/[.'’-]/gu,""));
}

function unsupportedOwnershipVerbUpgrades(headline:string,source:string):string[]{
  const sourceWords=new Set(lexicalWords(source));
  const headlineWords=lexicalWords(headline);
  const sourceHasSupport=[...sourceWords].some(word=>SUPPORT_LEVEL_VERBS.has(word));
  const sourceHasOwnership=[...sourceWords].some(word=>OWNERSHIP_LEVEL_VERBS.has(word));
  // Fail closed only for the unambiguous class: the cited evidence expresses
  // support/participation and contains no ownership-level action at all.
  if(!sourceHasSupport||sourceHasOwnership) return [];
  return [...new Set(headlineWords.filter(word=>OWNERSHIP_LEVEL_VERBS.has(word)&&!sourceWords.has(word)))];
}

/** High-confidence entity guard only. Capitalisation alone is presentation, not entity evidence. */
function unsupportedProperNouns(claim:string,source:string):string[]{
  const sourceNorm=normalized(source);
  const words=claim.trim().match(/[\p{L}][\p{L}'’.-]*/gu)??[];
  const unsupported:string[]=[];
  for(let i=0;i<words.length;i++){
    const word=words[i]!;
    if(!(word.length > 0 && word[0] === word[0]!.toLocaleUpperCase() && word[0] !== word[0]!.toLocaleLowerCase())) continue;
    const norm=normalized(word);
    if(PROPER_NOUN_STOP_WORDS.has(norm)||sourceNorm.includes(norm)) continue;
    if(i===0){
      if(SENTENCE_INITIAL_VERB_MORPHOLOGY.test(norm)) continue;
      unsupported.push(word); // first-token morphology rule: non-verb capitalised token is entity-like
      continue;
    }
    const prev=normalized(words[i-1]??"");
    const next=words[i+1];
    const consecutive=!!next && (next.length > 0 && next[0] === next[0]!.toLocaleUpperCase() && next[0] !== next[0]!.toLocaleLowerCase()) && !PROPER_NOUN_STOP_WORDS.has(normalized(next));
    if(ENTITY_PREPOSITIONS.has(prev)||consecutive||!isFullyTitleCaseHeadline(claim)) unsupported.push(word);
  }
  return [...new Set(unsupported)];
}

function isFullyTitleCaseHeadline(value:string):boolean {
  const words=value.match(/[\p{L}][\p{L}'’.-]*/gu)??[];
  const lexical=words.filter(word=>!PROPER_NOUN_STOP_WORDS.has(normalized(word)));
  return lexical.length>=2&&lexical.every(word=>word.length > 0 && word[0] === word[0]!.toLocaleUpperCase() && word[0] !== word[0]!.toLocaleLowerCase());
}

function obviousHeadlineLanguageMismatch(expected:"en"|"fr",value:string):boolean {
  const n=` ${normalized(value)} `;
  const fr=/\\b(?:avec|entre|des|les|une|analyse|délais|processus|participation|déploiement)\\b/u.test(n);
  const en=/\\b(?:with|between|the|and|analysis|delays|process|participation|deployment|supporting|connecting)\\b/u.test(n);
  return expected==="fr" ? en&&!fr : fr&&!en;
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
  options: { headlineSource?: "model" | "deterministic_floor"; questionSource?: "model" | "deterministic_floor" } = {},
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
  const ownershipVerbUpgrades=unsupportedOwnershipVerbUpgrades(proposal.headline,source);
  if(ownershipVerbUpgrades.length>0){
    errors.push(`headline introduces unsupported ownership-level verb(s): ${ownershipVerbUpgrades.join(", ")}; cited evidence contains only weaker support/participation wording for that activity`);
  }
  // Candidate-facing model headlines are contractually anchored with You/Vous.
  // Do not classify the sentence-opening token as an entity; inspect only the
  // substantive remainder. Deterministic floors remain code-built.
  const headlineForEntityCheck=proposal.headline.replace(/^\s*(?:You|Vous)\b[\s,:;—–-]*/u,"");
  const unsupportedHeadlineEntities=options.headlineSource==="deterministic_floor" ? [] : unsupportedProperNouns(headlineForEntityCheck,source);
  if(unsupportedHeadlineEntities.length>0){
    errors.push(`headline introduces an unsupported named entity or place: headline=${JSON.stringify(proposal.headline)} flagged_tokens=${JSON.stringify(unsupportedHeadlineEntities)}`);
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
    if (options.questionSource !== "deterministic_floor" && unsupportedProperNouns(question, source).length > 0) errors.push("question_back asserts an unsupported named entity or place");
    if (OWNERSHIP_PREMISE.test(question) && OWNERSHIP_ESCALATION.test(question) && !OWNERSHIP_ESCALATION.test(source)) errors.push("question_back asserts unsupported ownership premise");
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
      rejected.push({ proposal_id: proposal.id, reasons: errors, diagnostic_headline: proposal.headline });
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
  const response = await createOpenAICompletion({
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
  return parseD15BCandidateDiscoveryContent(response.choices[0]?.message?.content);
}

export function parseD15BCandidateDiscoveryContent(content:string|null|undefined):D15BCandidateSet[]{
  if(!content?.trim()) throw new Error("candidate discovery returned empty model content");
  const parsed = JSON.parse(content) as { candidates?: D15BCandidateSet[] };
  if(!Array.isArray(parsed.candidates)) throw new Error("candidate discovery returned invalid candidates payload");
  return parsed.candidates;
}

async function interpretD15BCandidateSet(ledger: EvidenceLedger, candidate: D15BCandidateSet): Promise<string> {
  const atoms = citedAtomsForVerifier(ledger, candidate.evidence_ids);
  const response = await createOpenAICompletion({
    model: AI_MODEL,
    temperature: 0,
    response_format: jsonSchemaFormat("d15_b_interpretation", INTERPRETATION_SCHEMA),
    messages: [
      { role: "system", content: `Write ONE concise candidate-facing professional insight from ONLY the supplied evidence atoms.
Address the candidate directly. If source_language is "en", the headline MUST begin exactly with "You ". If source_language is "fr", it MUST begin exactly with "Vous ". Never output the other language.
State what the cross-line pattern MEANS about how the candidate works; do not simply concatenate, enumerate, or relabel the activities. The insight must reveal a relationship/function that no single cited line states alone while remaining a reasonable reading of the lines together.
Good shape: "You work where a new system meets the people who have to use it." Bad shape: "You combine rollout support with feedback collection and training assistance."
Do not explain why the pattern is beneficial, valuable, effective, strategic, successful, improved, enhanced, enabled, strengthened, optimized, or what effect it may have unless that exact effect is explicitly stated in the cited evidence.
Do not add purpose or causality with phrases such as "to improve", "to enhance", "enabling", "supporting better", "driving", or equivalent French constructions unless the cited evidence explicitly states that purpose/effect.
Do not invent or upgrade ownership, outcome, metric, date, duration, scale, scope, seniority, entity, place, tool, responsibility, purpose, benefit, or causality.
The headline is interpretation, never evidence. Return JSON only.` },
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
  const response = await createOpenAICompletion({
    model: AI_MODEL,
    temperature: 0,
    response_format: jsonSchemaFormat("d15_b_claim_verification", VERIFIER_SCHEMA),
    messages: [
      {
        role: "system",
        content: `You are the independent D15-B claim verifier. You receive ONLY cited canonical evidence atoms and one candidate-facing claim.
Judge whether the claim stays within those atoms. Do not use outside knowledge or infer from titles or typical duties.
Reject ownership upgrades, invented outcomes, metrics, dates/durations, named entities/places, seniority/scope, tools, responsibilities, purpose links, or causal claims. Be strict about semantic upgrades even when they are linguistically subtle: support/assist wording does not entail providing/owning the activity; coordination/organisation does not entail managing it; and two separately documented activities do not entail that one was done to solve, improve, enable, or cause the other.
For HEADLINE, verify ONLY factual entailment and truth-boundary safety. Semantic synthesis is allowed when every substantive factual assertion is grounded in the cited atoms. Do not reject a headline merely because it is broad, interpretive, generic, or not insightful; SIGNIFICANCE is evaluated separately.
For SIGNIFICANCE, the relationship is EXPECTED not to be stated in any single cited line; discovering that cross-line relationship is the point of a semantic thread. Truth, factual entailment, invented facts, ownership, outcomes and causality are checked separately by deterministic guards and the HEADLINE verifier. DO NOT reject because the lines fail to say that they are connected, fail to say that one leads to/supports/influences another, or merely appear as separate CV bullets.

Apply these THREE tests:
(a) RELATIONAL MEANING: Is the proposed connection more than naming, listing, paraphrasing, or assigning a general category to the activities?
(b) REASONABLE SYNTHESIS: Would a reasonable reader, seeing these cited lines together, accept this connection as a fair synthesis of how the activities relate?
(c) ROLE-TITLE SPECIFICITY: Reject if the headline would be equally true of most people holding the candidate's ordinary job title or function. A generic duty-summary such as "You provide administrative support" or "You keep a manager's day running" is not a Mirror insight. Accept only when the cited lines together reveal a more specific recurring relationship, interface, pattern, or way of working than the role title itself implies.
Return supported=true if and only if (a) and (b) are yes AND the proposal passes (c).

Worked examples (illustrative only; these are not benchmark cases):
1. REJECT / generic receptionist duties. Lines: "Greeted clients at reception." + "Managed the main phone line." + "Ordered office stationery." Headline: "You keep front-desk administration running." => supported=false. This is a generic duty summary that would be equally true of many receptionists.
2. ACCEPT / warehouse tool-to-user interface. Lines: "Introduced a new stock-tracking tool in the warehouse." + "Trained warehouse staff to use the tool." + "Collected staff feedback after go-live." Headline: "You work where a new operational tool meets the people who have to use it." => supported=true. The lines reveal a specific implementation-to-user relationship beyond a generic warehouse-supervision title.
3. ACCEPT / accountant recurring around audit change. Lines: "Prepared account reconciliations for the annual audit." + "Mapped ledger balances during a finance-system migration." + "Reconciled migrated balances for auditor review." Headline: "Your accounting work repeatedly connects financial-system change with audit-ready evidence." => supported=true. The recurring relationship between system change, reconciliation and audit evidence is more specific than generic accounting work.

The lines themselves do NOT need to contain an explicit linking sentence, causal statement, or explanation of interconnection. Do not ask for one. Do not re-run factual entailment here.
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

export function deterministicOwnershipQuestion(ledger: EvidenceLedger, proposal: D15BSemanticThreadProposal): string | null {
  const atoms = citedAtomsForVerifier(ledger, proposal.evidence_ids);
  const quotes = atoms.map((atom) => atom.source_quote).join(" ");
  const support = /\b(support(?:ed|ing)?|assist(?:ed|ing)?|help(?:ed|ing)?|participat(?:e|ed|ing)|contribut(?:e|ed|ing)|sout(?:enir|enu|enue|enus|enues)|appuy(?:er|é|ée|és|ées)|assist(?:er|é|ée|és|ées)|particip(?:er|é|ée|és|ées|ait|aient)|contribu(?:er|é|ée|és|ées|ait|aient))\b/iu.test(quotes);
  if (!support) return null;
  const language = sourceLanguageForEvidence(ledger, proposal.evidence_ids);
  return language === "fr"
    ? "Dans ce travail, qu’avez-vous personnellement pris en charge, et qu’avez-vous plutôt soutenu ou accompagné ?"
    : "In this work, what did you personally own or do, and what did you mainly support or assist with?";
}

export function deterministicOutcomeQuestion(ledger: EvidenceLedger, proposal:D15BSemanticThreadProposal):string {
  return sourceLanguageForEvidence(ledger,proposal.evidence_ids)==="fr"
    ? "Cela a-t-il changé quelque chose de mesurable ? Si oui, quoi ?"
    : "Did this change anything measurable? If so, what?";
}

async function enrichD15BQuestion(ledger: EvidenceLedger, proposal: D15BSemanticThreadProposal): Promise<string | null> {
  const atoms = citedAtomsForVerifier(ledger, proposal.evidence_ids);
  const response = await createOpenAICompletion({
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

export function verifyD15BDeterministicFloorForTest(ledger: EvidenceLedger, proposal:D15BSemanticThreadProposal):string[] {
  return deterministicProposalErrors(ledger,proposal,{headlineSource:"deterministic_floor"});
}

export function deterministicHeadlineFloor(ledger: EvidenceLedger, proposal:D15BSemanticThreadProposal):string {
  const atoms=citedAtomsForVerifier(ledger,proposal.evidence_ids);
  const language=sourceLanguageForEvidence(ledger,proposal.evidence_ids);
  const objects=[...new Set(atoms.map(atom=>atom.object.trim()).filter(Boolean))].slice(0,3);
  if(objects.length===0) return language==="fr" ? "Éléments professionnels documentés" : "Documented professional activities";
  return language==="fr"
    ? `Lien documenté entre ${objects.join(" et ")}`
    : `Documented connection between ${objects.join(" and ")}`;
}

async function repairGuardRejectedHeadlineOnce(
  ledger: EvidenceLedger,
  proposal: D15BSemanticThreadProposal,
  guardReasons: string[],
): Promise<string | null> {
  const language=sourceLanguageForEvidence(ledger,proposal.evidence_ids);
  const atoms=citedAtomsForVerifier(ledger,proposal.evidence_ids);
  const response=await createOpenAICompletion({
    model:AI_MODEL,temperature:0,response_format:jsonSchemaFormat("d15_b_guard_headline_repair",{
      type:"object",additionalProperties:false,properties:{headline:{type:"string"}},required:["headline"],
    }),
    messages:[
      {role:"system",content:`Rewrite only the presentation of an already-discovered semantic relationship after deterministic truth guards rejected its headline. Preserve the SAME relationship and use ONLY the cited atoms; do not add, remove, or reinterpret evidence. Write one concise candidate-facing headline in ${language==="fr"?"French":"English"}. It MUST begin exactly with ${language==="fr"?'"Vous "':'"You "'}. Remove every problem identified in guard_reasons. Do not add outcomes, ownership, scope, dates, numbers, entities, seniority, causality, or responsibilities not explicitly supported by the cited atoms. Do not discover a new relationship. Return JSON only.`},
      {role:"user",content:JSON.stringify({rejected_headline:proposal.headline,guard_reasons:guardReasons,cited_atoms:atoms})},
    ],
  });
  try{
    const parsed=JSON.parse(response.choices[0]?.message?.content||"{}") as {headline?:unknown};
    return typeof parsed.headline==="string"&&parsed.headline.trim()?parsed.headline.trim():null;
  }catch{return null;}
}

async function repairHeadlineOnce(ledger:EvidenceLedger,proposal:D15BSemanticThreadProposal):Promise<string|null>{
  const language=sourceLanguageForEvidence(ledger,proposal.evidence_ids);
  const atoms=citedAtomsForVerifier(ledger,proposal.evidence_ids);
  const response=await createOpenAICompletion({
    model:AI_MODEL,temperature:0,response_format:jsonSchemaFormat("d15_b_headline_repair",{
      type:"object",additionalProperties:false,properties:{headline:{type:"string"}},required:["headline"],
    }),
    messages:[
      {role:"system",content:`Repair only the presentation of an already-discovered relationship. Write one concise candidate-facing headline in ${language==="fr"?"French":"English"}. It MUST begin exactly with ${language==="fr"?'"Vous "':'"You "'}. Say what the cross-line pattern means rather than listing or concatenating the activities. Use only the cited atoms. Do not add outcomes, ownership, scale, dates, entities, seniority, causality, or responsibilities. Preserve the relationship; do not discover a new one. Return JSON only.`},
      {role:"user",content:JSON.stringify({rejected_headline:proposal.headline,cited_atoms:atoms})},
    ],
  });
  try{
    const parsed=JSON.parse(response.choices[0]?.message?.content||"{}") as {headline?:unknown};
    return typeof parsed.headline==="string"&&parsed.headline.trim()?parsed.headline.trim():null;
  }catch{return null;}
}

export async function verifyD15BSignificanceByMajority(
  ledger: EvidenceLedger,
  evidenceIds: string[],
  claim: string,
): Promise<{supported:boolean;reason:string}> {
  const verdicts:D15BClaimVerification[]=[];
  for(let i=0;i<3;i++) verdicts.push(await verifyD15BClaimIndependently(ledger,evidenceIds,claim,"SIGNIFICANCE"));
  const yes=verdicts.filter(verdict=>verdict.supported).length;
  return {
    supported:yes>=2,
    reason:`2-of-3 significance vote: ${verdicts.map(verdict=>verdict.supported).join(",")} — ${verdicts.map(verdict=>verdict.reason).join(" | ")}`,
  };
}

export async function runD15BSemanticThreadEngine(ledger: EvidenceLedger): Promise<D15BVerificationResult> {
  let proposed:D15BSemanticThreadProposal[];
  try {
    proposed = await proposeD15BSemanticThreads(ledger);
  } catch (error) {
    const reason=error instanceof Error ? error.message : String(error);
    return { accepted:[], rejected:[{proposal_id:"ENGINE",reasons:[`ENGINE_ERROR: ${reason}`]}], cv_question_back:null, completion_state:"ERROR" };
  }
  // A correct semantic grouping must not be lost solely because its model-written
  // headline overclaims. Give presentation-only guard failures one constrained rewrite,
  // then run the exact same deterministic guards again. Evidence IDs never change.
  const guardRepaired:D15BSemanticThreadProposal[]=[];
  for(const proposal of proposed){
    const initialErrors=deterministicProposalErrors(ledger,proposal);
    const presentationOnly=initialErrors.length>0 && initialErrors.every(reason =>
      reason.startsWith("headline ")
    );
    if(!presentationOnly){
      guardRepaired.push(proposal);
      continue;
    }
    const repaired=await repairGuardRejectedHeadlineOnce(ledger,proposal,initialErrors);
    guardRepaired.push(repaired ? {...proposal,headline:repaired} : proposal);
  }
  const deterministic = verifyD15BSemanticThreadProposals(ledger, guardRepaired);
  const accepted: D15BVerifiedThread[] = [];
  const rejected = [...deterministic.rejected];

  for (const proposal of deterministic.accepted) {
    let workingProposal={...proposal};
    if(isFullyTitleCaseHeadline(workingProposal.headline) || obviousHeadlineLanguageMismatch(sourceLanguageForEvidence(ledger,workingProposal.evidence_ids),workingProposal.headline)){
      const floor=deterministicHeadlineFloor(ledger,workingProposal);
      const floorProposal={...workingProposal,headline:floor};
      const floorErrors=deterministicProposalErrors(ledger,floorProposal,{headlineSource:"deterministic_floor"});
      if(floorErrors.length){
        rejected.push({proposal_id:proposal.id,reasons:[`PRESENTATION_UNREPAIRABLE: Title Case headline floor failed deterministic truth guards: ${floorErrors.join(" | ")}`]});
        continue;
      }
      workingProposal=floorProposal;
    }
    let headline = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, workingProposal.headline, "HEADLINE");
    if (!headline.supported) {
      const repaired=await repairHeadlineOnce(ledger,workingProposal);
      if(repaired){
        const repairedProposal={...workingProposal,headline:repaired};
        const guardErrors=deterministicProposalErrors(ledger,repairedProposal);
        const repairedCheck=guardErrors.length ? {supported:false,reason:guardErrors.join(" | ")} : await verifyD15BClaimIndependently(ledger,proposal.evidence_ids,repaired,"HEADLINE");
        if(repairedCheck.supported){ workingProposal=repairedProposal; headline=repairedCheck; }
      }
    }
    if (!headline.supported) {
      const floor=deterministicHeadlineFloor(ledger,workingProposal);
      const floorProposal={...workingProposal,headline:floor};
      const floorErrors=deterministicProposalErrors(ledger,floorProposal,{headlineSource:"deterministic_floor"});
      if(floorErrors.length){
        rejected.push({proposal_id:proposal.id,reasons:[`PRESENTATION_UNREPAIRABLE: headline floor failed deterministic truth guards: ${floorErrors.join(" | ")}`]});
        continue;
      }
      workingProposal=floorProposal;
      headline={supported:true,reason:"reviewed deterministic headline floor"};
    }
    const significance = await verifyD15BSignificanceByMajority(ledger, workingProposal.evidence_ids, workingProposal.headline);
    if (!significance.supported) {
      rejected.push({ proposal_id: proposal.id, reasons: [`significance majority rejected: ${significance.reason}`] });
      continue;
    }
    if (workingProposal.question_back) {
      const question = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, workingProposal.question_back, "QUESTION_BACK");
      if (!question.supported) {
        rejected.push({ proposal_id: proposal.id, reasons: [`independent question verifier rejected: ${question.reason}`] });
        continue;
      }
    }
    const preferredQuestion = deterministicOwnershipQuestion(ledger, workingProposal) ?? await enrichD15BQuestion(ledger, workingProposal);
    let generatedQuestion = preferredQuestion ?? deterministicOutcomeQuestion(ledger,workingProposal);
    let questionCheck = await verifyD15BClaimIndependently(ledger, proposal.evidence_ids, generatedQuestion, "QUESTION_BACK");
    if (!questionCheck.supported) {
      // Reviewed deterministic floor: support/assist/participate evidence gets
      // ownership clarification first; otherwise ask premise-free outcome.
      generatedQuestion = deterministicOwnershipQuestion(ledger, workingProposal) ?? deterministicOutcomeQuestion(ledger,workingProposal);
      const floorErrors = deterministicProposalErrors(ledger, { ...workingProposal, question_back: generatedQuestion }, { questionSource:"deterministic_floor" });
      if (floorErrors.length) {
        rejected.push({ proposal_id: proposal.id, reasons: [`PRESENTATION_UNREPAIRABLE: question floor failed deterministic truth guards: ${floorErrors.join(" | ")}`] });
        continue;
      }
      // Exact reviewed floors are deterministic policy, not LLM claims. Their
      // safety is enforced above by the same deterministic truth guards.
      questionCheck = { supported:true, reason:"reviewed deterministic question floor" };
    }
    if (!questionCheck.supported) {
      rejected.push({ proposal_id: proposal.id, reasons: [`PRESENTATION_UNREPAIRABLE: question repair failed: ${questionCheck.reason}`] });
      continue;
    }
    accepted.push({ ...workingProposal, question_back: generatedQuestion });
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
