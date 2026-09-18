import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { CvAnalysis, EvidenceChainItem, InterviewStrategy, SessionLanguage, SessionRecord } from "@/types";

// ---------------------------------------------------------------------------
// Internal strategic reasoning model (Pass 1 output). Never exposed to the UI
// or persisted; it only exists to constrain and validate Pass 2 generation.
// ---------------------------------------------------------------------------

export type EvidenceType = "EXPERIENCE" | "RESPONSIBILITY" | "ACHIEVEMENT" | "QUALIFICATION" | "SKILL" | "INDUSTRY_EXPERIENCE" | "TOOL_OR_SYSTEM";
export type EvidenceStatus = "PROVEN" | "PARTIALLY_PROVEN" | "UNKNOWN" | "NOT_DOCUMENTED";

export type EvidenceMapNode = {
  node_id: string;
  type: EvidenceType;
  status: EvidenceStatus;
  fact: string;
  jd_requirement: string;
};

export type ProofObjective = {
  id: string;
  interviewer_belief: string;
  why_it_matters: string;
  primary_evidence_node_id: string;
  evidence_status: EvidenceStatus;
  evidence_type: EvidenceType;
  proof_point: string;
  vulnerability: string;
  mitigation: string;
  communication_angle: string;
  probing_question: string;
};

export type RoleMapItem = { theme: string; interviewer_relevance: string };

export type StrategicAnalysis = {
  positioning: string;
  roleMap: RoleMapItem[];
  vulnerabilities: string[];
  proofObjectives: ProofObjective[];
  likelyQuestions: string[];
};

const EVIDENCE_TYPES = new Set<EvidenceType>(["EXPERIENCE", "RESPONSIBILITY", "ACHIEVEMENT", "QUALIFICATION", "SKILL", "INDUSTRY_EXPERIENCE", "TOOL_OR_SYSTEM"]);
const EVIDENCE_STATUSES = new Set<EvidenceStatus>(["PROVEN", "PARTIALLY_PROVEN", "UNKNOWN", "NOT_DOCUMENTED"]);

function canonicalize(value: string): string { return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function truncate(value: string, maxWords = 24): string { return canonicalize(value).split(" ").slice(0, maxWords).join(" ").replace(/[,:;]+$/, ""); }
function isNonEmptyString(x: unknown): x is string { return typeof x === "string" && x.trim().length > 0; }

// ---------------------------------------------------------------------------
// Deterministic Evidence Map construction (code, not AI). This is the single
// source of truth for facts: Pass 1 may only reference these node_ids, never
// invent its own evidence.
// ---------------------------------------------------------------------------

const QUALIFICATION_KEYWORD_PATTERN = /\b(acca|cfa|cpa|cima|cma|dscg|dec|mba|maîtrise|diplôme|diploma|qualification|certifi[ée]|certification)\b/i;
const MASTER_DEGREE_PATTERN = /\bmaster'?s?\s+(?:degree|of|in|en)\b|\btitulaire\s+d['’]un\s+master\b/i;
const TOOL_PATTERN = /\b(sap|oracle|sage|netsuite|hyperion|workday|erp)\b/i;
const INDUSTRY_PATTERN = /\b(mining|minier|agro|fmcg|banking|banque|retail|telecom|construction|pharma|energy|oil|gas|mining|assurance|insurance)\b/i;
const RESPONSIBILITY_PATTERN = /\b(managed|led|responsible for|responsabilit|encadr|supervis|oversaw|piloté|géré)\b/i;
const ACHIEVEMENT_PATTERN = /\b(increased|reduced|improved|saved|achieved|%|million|k€|\$|augment|réduit|amélior)\b/i;
const SKILL_PATTERN = /\b(skill|compétence|proficient|maîtrise de|knowledge of|connaissance)\b/i;
const PARTIAL_EVIDENCE_PATTERN = /\b(partial|partiel(?:le)?s?)\b/i;
const UNCERTAIN_PATTERN = /\b(unclear|incertain|not specified|non précisé|ambigu[eë]?)\b/i;

function classifyEvidenceType(item: EvidenceChainItem): EvidenceType {
  const text = `${item.jd_requirement ?? ""} ${item.cv_evidence ?? ""}`;
  if (QUALIFICATION_KEYWORD_PATTERN.test(text) || MASTER_DEGREE_PATTERN.test(text)) return "QUALIFICATION";
  if (TOOL_PATTERN.test(text)) return "TOOL_OR_SYSTEM";
  if (INDUSTRY_PATTERN.test(text)) return "INDUSTRY_EXPERIENCE";
  if (RESPONSIBILITY_PATTERN.test(text)) return "RESPONSIBILITY";
  if (ACHIEVEMENT_PATTERN.test(text)) return "ACHIEVEMENT";
  if (SKILL_PATTERN.test(text)) return "SKILL";
  return "EXPERIENCE";
}

function classifyEvidenceStatus(item: EvidenceChainItem): EvidenceStatus {
  if (!item.cv_evidence || item.cv_evidence === "NO CV EVIDENCE FOUND") return "NOT_DOCUMENTED";
  const gap = (item.gap_identified ?? "").trim().toLowerCase();
  const hasGapNote = Boolean(gap) && gap !== "none" && gap !== "aucun" && !/no gap|aucun écart/i.test(gap);
  if (PARTIAL_EVIDENCE_PATTERN.test(item.cv_evidence) || (hasGapNote && PARTIAL_EVIDENCE_PATTERN.test(gap))) return "PARTIALLY_PROVEN";
  if (UNCERTAIN_PATTERN.test(item.cv_evidence)) return "UNKNOWN";
  if (hasGapNote) return "PARTIALLY_PROVEN";
  return "PROVEN";
}

export function buildEvidenceMap(session: SessionRecord): EvidenceMapNode[] {
  const chain = session.cv_analysis?.evidenceChain ?? [];
  return chain.slice(0, 10).map((item, index) => {
    const status = classifyEvidenceStatus(item);
    const type = classifyEvidenceType(item);
    const fact = status === "NOT_DOCUMENTED" || status === "UNKNOWN"
      ? `Not established by the CV for: ${truncate(item.jd_requirement ?? "", 16)}`
      : truncate(item.cv_evidence ?? item.jd_requirement ?? "", 28);
    return { node_id: `E${String(index + 1).padStart(2, "0")}`, type, status, fact, jd_requirement: truncate(item.jd_requirement ?? "", 16) };
  });
}

function normalizeForComparison(text: string): string[] {
  const stop = new Set(["the", "your", "this", "that", "with", "from", "into", "about", "what", "which", "where", "when", "and", "les", "des", "une", "un", "votre", "vous", "avec", "dans", "pour", "que", "qui", "sur", "est", "sont", "ce", "cette", "ces", "et", "ou", "mais", "d", "l", "de"]);
  return canonicalize(text).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((x) => x.length >= 4 && !stop.has(x));
}
export function semanticOverlap(a: string, b: string): number {
  const aa = new Set(normalizeForComparison(a)); const bb = new Set(normalizeForComparison(b));
  if (!aa.size || !bb.size) return 0;
  let common = 0; aa.forEach((word) => { if (bb.has(word)) common++; });
  return common / Math.min(aa.size, bb.size);
}

function qualificationTerms(evidenceMap: EvidenceMapNode[]): string[] {
  const terms = new Set<string>(["acca"]);
  for (const node of evidenceMap) {
    if (node.type !== "QUALIFICATION") continue;
    const m = node.fact.match(/\b(ACCA|CFA|CPA|CIMA|CMA|DSCG|DEC|MBA|Master)\b/i);
    terms.add((m?.[1] ?? node.fact.split(" ")[0]).toLowerCase());
  }
  return [...terms].filter(Boolean);
}
function hasQualificationExperienceMisuse(text: string, evidenceMap: EvidenceMapNode[]): boolean {
  const lower = text.toLowerCase();
  return qualificationTerms(evidenceMap).some((term) => new RegExp(`\\b(?:votre exp[ée]rience ${term}|${term} experience|exp[ée]rience chez ${term}|worked at ${term}|exp[ée]rience professionnelle ${term})\\b`, "i").test(lower));
}

const KNOWN_TOOLS = ["sap", "oracle", "sage", "netsuite", "hyperion", "workday"];
function hasToolClaimMisuse(text: string, evidenceMap: EvidenceMapNode[]): boolean {
  const lower = text.toLowerCase();
  const provenTools = evidenceMap.filter((n) => n.type === "TOOL_OR_SYSTEM" && (n.status === "PROVEN" || n.status === "PARTIALLY_PROVEN")).map((n) => n.fact.toLowerCase());
  return KNOWN_TOOLS.some((tool) => {
    const claim = new RegExp(`\\b(?:votre exp[ée]rience (?:du |de |d')?${tool}|${tool} experience|exp[ée]rience ${tool}|maîtrise (?:de |d')?${tool})\\b`, "i");
    if (!claim.test(lower)) return false;
    return !provenTools.some((fact) => fact.includes(tool));
  });
}
function hasIndustryClaimMisuse(text: string, evidenceMap: EvidenceMapNode[]): boolean {
  const provenIndustry = evidenceMap.some((n) => n.type === "INDUSTRY_EXPERIENCE" && (n.status === "PROVEN" || n.status === "PARTIALLY_PROVEN"));
  if (provenIndustry) return false;
  return /\b(votre exp[ée]rience (?:du |dans le |sectorielle)|your industry experience|your sector experience)\b/i.test(text) && INDUSTRY_PATTERN.test(text);
}
function hasObviousLanguageMismatch(text: string, language: SessionLanguage): boolean {
  if (language === "fr") return /\b(?:strong command of|strong knowledge of|your experience|use your|prepare an|what you|if asked|the interviewer|the role|your strongest|evidence to use|accounting standards|experience with|experience in|the position requires|the role requires)\b/i.test(text);
  return /\b(?:votre expérience|utilisez votre|préparez|ce que vous|si l'on vous|l'intervieweur|le poste|vos points forts|preuves à utiliser|normes comptables|expérience avec|expérience en|le poste requiert|le rôle requiert)\b/i.test(text);
}
function hasCrossSectionDuplication(strategy: any): boolean {
  const priorities = Array.isArray(strategy?.interviewPriorities) ? strategy.interviewPriorities : [];
  const defenses = Array.isArray(strategy?.gapDefenseStrategy) ? strategy.gapDefenseStrategy : [];
  const stories = Array.isArray(strategy?.storiesToPrepare) ? strategy.storiesToPrepare : [];
  for (const priority of priorities) for (const defense of defenses) if (typeof priority === "string" && typeof defense === "string" && semanticOverlap(priority, defense) >= 0.72) return true;
  for (let i = 0; i < priorities.length; i++) for (let j = i + 1; j < priorities.length; j++) if (semanticOverlap(priorities[i], priorities[j]) >= 0.78) return true;
  for (let i = 0; i < stories.length; i++) for (let j = i + 1; j < stories.length; j++) if (typeof stories[i] === "string" && typeof stories[j] === "string" && semanticOverlap(stories[i], stories[j]) >= 0.72) return true;
  return false;
}
function containsCopiedJdSentence(strategy: unknown, jobDescription: string): boolean {
  if (!strategy || typeof strategy !== "object" || !jobDescription) return false;
  const s = strategy as any;
  const allText = [s.candidatePositioning, s.strongestValueProposition, s.communicationPriorities, s.interviewPlan, s.personalization, ...s.strengthsToLeverage ?? [], ...s.gapsOrRisks ?? [], ...s.gapDefenseStrategy ?? [], ...s.interviewPriorities ?? [], ...s.likelyDifficultQuestions ?? [], ...s.storiesToPrepare ?? []].filter((x: any) => typeof x === "string").join(" ").toLowerCase();
  const sourceSentences = jobDescription.split(/[.!?\n]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 35);
  return sourceSentences.some((sentence) => allText.includes(sentence));
}
function containsCopiedDiagnosticRequirement(strategy: unknown, analysis: CvAnalysis | null): boolean {
  if (!strategy || !analysis?.evidenceChain?.length) return false;
  const s = strategy as any;
  const candidateText = [...s.strengthsToLeverage ?? [], ...s.storiesToPrepare ?? [], ...s.interviewPriorities ?? []].filter((x: any) => typeof x === "string").join(" ").toLowerCase();
  return analysis.evidenceChain.some((item) => { const requirement = canonicalize(item.jd_requirement ?? "").toLowerCase(); return requirement.length >= 24 && candidateText.includes(requirement); });
}
const STORY_ANCHOR_STOPWORDS = new Set(["experience", "financial", "finance", "responsibility", "reporting", "management", "accounting", "conformity", "compliance", "professional", "strength"]);

/** Returns the evidence node backing a story only if it is a real, provable fact (never QUALIFICATION-as-experience, never UNKNOWN/NOT_DOCUMENTED). */
function findProvableEvidenceNode(nodeId: string | undefined, evidenceMap: EvidenceMapNode[]): EvidenceMapNode | null {
  if (!nodeId) return null;
  const node = evidenceMap.find((n) => n.node_id === nodeId);
  if (!node) return null;
  if (node.status !== "PROVEN" && node.status !== "PARTIALLY_PROVEN") return null;
  return node;
}
function hasEvidenceNodeAnchor(text: string, node: EvidenceMapNode): boolean {
  const anchors = factAnchorWords(node.fact).filter((word) => !STORY_ANCHOR_STOPWORDS.has(word));
  if (!anchors.length) return false;
  const normalized = canonicalize(text).toLowerCase();
  return anchors.some((anchor) => normalized.includes(anchor));
}
/**
 * Deterministic, evidence-map-driven replacement for the old fixed-keyword CV anchor check.
 * When the Pass 1 proof objectives are available, each story is checked against the exact
 * primary evidence node assigned to that objective (by index). Otherwise (e.g. re-validating
 * an already-persisted strategy where Pass 1 reasoning isn't stored), it falls back to
 * requiring a match against *some* provable (PROVEN/PARTIALLY_PROVEN) evidence node.
 */
function storyBackedByEvidence(text: string, index: number, evidenceMap: EvidenceMapNode[], strategicAnalysis: StrategicAnalysis | null): boolean {
  const primaryNodeId = strategicAnalysis?.proofObjectives?.[index]?.primary_evidence_node_id;
  if (primaryNodeId) {
    const node = findProvableEvidenceNode(primaryNodeId, evidenceMap);
    return Boolean(node && hasEvidenceNodeAnchor(text, node));
  }
  return evidenceMap.some((node) => (node.status === "PROVEN" || node.status === "PARTIALLY_PROVEN") && hasEvidenceNodeAnchor(text, node));
}
function extractSourceAnchors(source: string): string[] {
  const anchors = new Set<string>(); const normalized = canonicalize(source);
  for (const match of normalized.matchAll(/\b[A-Z][A-Za-zÀ-ÿ0-9&.-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ0-9&.-]{2,}){0,3}\b/g)) anchors.add(canonicalize(match[0]).toLowerCase());
  for (const match of normalized.matchAll(/\b[A-Z]{2,}[A-Z0-9/-]*\b/g)) anchors.add(match[0].toLowerCase());
  const genericWords = new Set(["the", "your", "with", "from", "this", "that", "experience", "responsibility", "responsibilities", "financial", "finance", "accounting", "management", "reporting", "budget", "forecast", "audit", "tax", "compliance", "leadership", "manager", "l'expérience", "expérience", "responsabilité", "responsabilités", "comptabilité", "gestion", "reporting", "budget", "prévision", "audit", "fiscalité", "conformité", "management", "avec", "dans", "pour", "votre", "vous"]);
  for (const sentence of normalized.split(/[.!?\n]+/)) { const words = sentence.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((word) => word.length >= 5 && !genericWords.has(word)); for (let i = 0; i < words.length - 1; i++) { const phrase = `${words[i]} ${words[i + 1]}`; if (phrase.length >= 12) anchors.add(phrase); } }
  return [...anchors].filter((anchor) => anchor.length >= 3 && !genericWords.has(anchor));
}
function hasSpecificityAnchor(text: string, source: string): boolean { const normalized = canonicalize(text).toLowerCase(); return extractSourceAnchors(source).some((anchor) => normalized.includes(anchor)); }

/**
 * Gate 2 must verify candidate-specificity, but exact phrase matching against the
 * entire CV/JD is too brittle for natural language. The deterministic evidence
 * map is already the stronger traceability source, so priority validation uses
 * an evidence-token anchor plus a role anchor instead of requiring literal
 * CV/JD phrases.
 */
function hasSpecificPriorityAnchors(strategy: any, cvText: string, jobDescription: string, evidenceMap: EvidenceMapNode[] = []): boolean {
  if (!Array.isArray(strategy?.interviewPriorities) || strategy.interviewPriorities.length !== 3) return false;
  const roleAnchors = extractSourceAnchors(jobDescription);
  const roleTokens = new Set(roleAnchors.flatMap((anchor) => normalizeForComparison(anchor)));
  return strategy.interviewPriorities.every((priority: unknown, index: number) => {
    if (typeof priority !== "string") return false;
    const priorityTokens = new Set(normalizeForComparison(priority));
    const node = evidenceMap[index];
    const evidenceTokens = node ? new Set(normalizeForComparison(node.fact)) : new Set<string>();
    const evidenceLinked = [...evidenceTokens].some((token) => priorityTokens.has(token));
    const roleLinked = [...roleTokens].some((token) => priorityTokens.has(token));
    return evidenceLinked && roleLinked;
  });
}

function hasPresentationArtifacts(text: string): boolean { return /\b(?:expérience pertinente|point d'ancrage|evidence anchor)\s*:/i.test(text); }
function hasBrokenSentenceConstruction(text: string): boolean { return /\.\s+[a-zà-ÿ]/.test(text) || /,\s+est\s+(?:votre|un|une|le|la|un point|votre principal)\b/i.test(text); }
function hasInternalStrategyInstructions(text: string): boolean {
  return /\b(?:une expérience réelle du parcours doit servir|this experience should serve as an anchor|serve as the corresponding strategic anchor|point stratégique correspondant|_reasoning|proof[_ ]objective|evidence[_ ]node|primary[_ ]evidence)\b/i.test(text);
}

export function isValidStrategy(strategy: unknown, language: SessionLanguage, _jobDescription = "", _analysis: CvAnalysis | null = null, _cvText = "", _evidenceMap: EvidenceMapNode[] = [], _strategicAnalysis: StrategicAnalysis | null = null): strategy is InterviewStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any;
  const allText = [s.candidatePositioning, s.strongestValueProposition, s.communicationPriorities, s.interviewPlan, s.personalization, ...(s.strengthsToLeverage ?? []), ...(s.gapsOrRisks ?? []), ...(s.gapDefenseStrategy ?? []), ...(s.interviewPriorities ?? []), ...(s.likelyDifficultQuestions ?? []), ...(s.storiesToPrepare ?? [])].filter((x: unknown) => typeof x === "string").join(" ");
  const generic = /\b(clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|prepare examples|prepare simple examples|préparez des exemples|be ready|show your|connect your experience|reliez votre expérience|based on the cv|à partir du cv)\b/i;
  const internal = /\b(?:evidence_node_id|primary_evidence|proof_objective|evidence map|proof objective|node_id|_reasoning)\b/i;
  const languageMismatch = language === "fr" ? /\b(?:your experience|the interviewer|the role|your strongest|use this example|what you need to demonstrate|if the topic comes up)\b/i : /\b(?:votre expérience|l'intervieweur|le poste|vos points forts|utilisez cet exemple|ce que vous devez démontrer|si le sujet est abordé)\b/i;
  const validStrings = (value: unknown) => Array.isArray(value) && value.every((x) => typeof x === "string" && x.trim().length > 0 && !generic.test(x));
  const priorities = Array.isArray(s.interviewPriorities) ? s.interviewPriorities : [];
  const stories = Array.isArray(s.storiesToPrepare) ? s.storiesToPrepare : [];
  const defenses = Array.isArray(s.gapDefenseStrategy) ? s.gapDefenseStrategy : [];
  if (typeof s.candidatePositioning !== "string" || typeof s.strongestValueProposition !== "string" || typeof s.communicationPriorities !== "string" || typeof s.interviewPlan !== "string" || typeof s.personalization !== "string" || !validStrings(s.strengthsToLeverage) || !validStrings(s.gapsOrRisks) || !validStrings(defenses) || !validStrings(priorities) || !validStrings(s.likelyDifficultQuestions) || !validStrings(stories) || priorities.length !== 3 || stories.length !== 3 || s.gapsOrRisks.length > 3 || s.likelyDifficultQuestions.length === 0) return false;
  if (generic.test(allText) || internal.test(allText) || languageMismatch.test(allText)) return false;
  if (hasCrossSectionDuplication(s)) return false;
  if (stories.some((x: string) => hasPresentationArtifacts(x) || hasInternalStrategyInstructions(x))) return false;
  return true;
}
function validateObjectiveShape(o: any): o is ProofObjective {
  return o && typeof o === "object"
    && isNonEmptyString(o.id)
    && isNonEmptyString(o.interviewer_belief)
    && isNonEmptyString(o.why_it_matters)
    && isNonEmptyString(o.primary_evidence_node_id)
    && EVIDENCE_STATUSES.has(o.evidence_status)
    && EVIDENCE_TYPES.has(o.evidence_type)
    && isNonEmptyString(o.proof_point)
    && isNonEmptyString(o.vulnerability)
    && isNonEmptyString(o.mitigation)
    && isNonEmptyString(o.communication_angle)
    && isNonEmptyString(o.probing_question);
}

function validateRoleMapItem(item: any): item is RoleMapItem {
  return item && typeof item === "object" && isNonEmptyString(item.theme) && isNonEmptyString(item.interviewer_relevance);
}

function validatePass1(raw: any, evidenceMap: EvidenceMapNode[]): raw is StrategicAnalysis {
  if (!raw || typeof raw !== "object") return false;
  if (!isNonEmptyString(raw.positioning)) return false;
  if (!Array.isArray(raw.roleMap) || raw.roleMap.length === 0 || !raw.roleMap.every(validateRoleMapItem)) return false;
  if (!Array.isArray(raw.vulnerabilities) || !raw.vulnerabilities.every(isNonEmptyString)) return false;
  if (!Array.isArray(raw.likelyQuestions) || raw.likelyQuestions.length === 0 || !raw.likelyQuestions.every(isNonEmptyString)) return false;
  if (!Array.isArray(raw.proofObjectives) || raw.proofObjectives.length !== 3) return false;
  if (!raw.proofObjectives.every(validateObjectiveShape)) return false;
  const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  const objectives = raw.proofObjectives as ProofObjective[];
  const primaryIds = objectives.map((o) => o.primary_evidence_node_id);
  if (new Set(primaryIds).size !== 3) return false;
  for (const objective of objectives) {
    const node = byId.get(objective.primary_evidence_node_id);
    if (!node) return false;
    if (node.status === "NOT_DOCUMENTED" || node.status === "UNKNOWN") return false;
    if (node.status !== objective.evidence_status || node.type !== objective.evidence_type) return false;
  }
  const allText = [raw.positioning, ...objectives.flatMap((o) => [o.interviewer_belief, o.why_it_matters, o.proof_point, o.communication_angle, o.mitigation, o.vulnerability])].join(" ");
  if (hasQualificationExperienceMisuse(allText, evidenceMap)) return false;
  if (hasToolClaimMisuse(allText, evidenceMap)) return false;
  if (hasIndustryClaimMisuse(allText, evidenceMap)) return false;
  for (let i = 0; i < objectives.length; i++) for (let j = i + 1; j < objectives.length; j++) {
    const overlap = semanticOverlap(`${objectives[i].interviewer_belief} ${objectives[i].proof_point}`, `${objectives[j].interviewer_belief} ${objectives[j].proof_point}`);
    if (overlap >= 0.6) return false;
  }
  return true;
}

type BoundStrategyText = { text: string; evidence_node_id: string };
type InternalStrategy = {
  candidatePositioning: string;
  strongestValueProposition: BoundStrategyText;
  strengthsToLeverage: BoundStrategyText[];
  gapsOrRisks: string[];
  gapDefenseStrategy: string[];
  interviewPriorities: BoundStrategyText[];
  likelyDifficultQuestions: string[];
  storiesToPrepare: BoundStrategyText[];
  communicationPriorities: string;
  interviewPlan: string;
  personalization: string;
};
type FaithfulnessCheck = { claim_id: string; faithful: boolean; unsupported_details: string[] };

const PASS1_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    positioning: { type: "string" },
    roleMap: { type: "array", items: { type: "object", additionalProperties: false, properties: { theme: { type: "string" }, interviewer_relevance: { type: "string" } }, required: ["theme", "interviewer_relevance"] } },
    vulnerabilities: { type: "array", items: { type: "string" } },
    proofObjectives: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      id: { type: "string" }, interviewer_belief: { type: "string" }, why_it_matters: { type: "string" }, primary_evidence_node_id: { type: "string" },
      evidence_status: { type: "string", enum: ["PROVEN", "PARTIALLY_PROVEN", "UNKNOWN", "NOT_DOCUMENTED"] },
      evidence_type: { type: "string", enum: ["EXPERIENCE", "RESPONSIBILITY", "ACHIEVEMENT", "QUALIFICATION", "SKILL", "INDUSTRY_EXPERIENCE", "TOOL_OR_SYSTEM"] },
      proof_point: { type: "string" }, vulnerability: { type: "string" }, mitigation: { type: "string" }, communication_angle: { type: "string" }, probing_question: { type: "string" }
    }, required: ["id", "interviewer_belief", "why_it_matters", "primary_evidence_node_id", "evidence_status", "evidence_type", "proof_point", "vulnerability", "mitigation", "communication_angle", "probing_question"] } },
    likelyQuestions: { type: "array", items: { type: "string" } },
  },
  required: ["positioning", "roleMap", "vulnerabilities", "proofObjectives", "likelyQuestions"],
} as const;

const BOUND_TEXT_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { text: { type: "string" }, evidence_node_id: { type: "string" } },
  required: ["text", "evidence_node_id"],
} as const;

const PASS2_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    candidatePositioning: { type: "string" }, strongestValueProposition: BOUND_TEXT_SCHEMA,
    strengthsToLeverage: { type: "array", items: BOUND_TEXT_SCHEMA }, gapsOrRisks: { type: "array", items: { type: "string" } }, gapDefenseStrategy: { type: "array", items: { type: "string" } },
    interviewPriorities: { type: "array", items: BOUND_TEXT_SCHEMA }, likelyDifficultQuestions: { type: "array", items: { type: "string" } },
    storiesToPrepare: { type: "array", items: BOUND_TEXT_SCHEMA }, communicationPriorities: { type: "string" }, interviewPlan: { type: "string" }, personalization: { type: "string" },
  },
  required: ["candidatePositioning", "strongestValueProposition", "strengthsToLeverage", "gapsOrRisks", "gapDefenseStrategy", "interviewPriorities", "likelyDifficultQuestions", "storiesToPrepare", "communicationPriorities", "interviewPlan", "personalization"],
} as const;

const FAITHFULNESS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { checks: { type: "array", items: { type: "object", additionalProperties: false, properties: { claim_id: { type: "string" }, faithful: { type: "boolean" }, unsupported_details: { type: "array", items: { type: "string" } } }, required: ["claim_id", "faithful", "unsupported_details"] } } },
  required: ["checks"],
} as const;

function structuredResponseFormat(name: string, schema: unknown) {
  return { type: "json_schema" as const, json_schema: { name, strict: true, schema: schema as Record<string, unknown> } };
}

async function requestStructuredJson(system: string, user: string, name: string, schema: unknown, temperature = 0.2): Promise<any> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({ model: AI_MODEL, temperature, response_format: structuredResponseFormat(name, schema), messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty structured response: " + name);
  return JSON.parse(raw);
}

function pass1Diagnostics(raw: unknown, evidenceMap: EvidenceMapNode[]): string[] {
  const failures: string[] = [];
  if (!raw || typeof raw !== "object") return ["Pass 1 did not return an object."];
  const value = raw as any;
  if (!Array.isArray(value.proofObjectives)) failures.push("proofObjectives must be an array of exactly 3 objects.");
  else {
    if (value.proofObjectives.length !== 3) failures.push("proofObjectives count was " + value.proofObjectives.length + "; it must be exactly 3.");
    const ids = value.proofObjectives.map((o: any) => o?.primary_evidence_node_id).filter(Boolean);
    if (new Set(ids).size !== ids.length) failures.push("Each proof objective must use a different primary_evidence_node_id.");
    const known = new Set(evidenceMap.map((n) => n.node_id));
    for (const id of ids) if (!known.has(id)) failures.push("Unknown evidence node " + id + ".");
  }
  if (!Array.isArray(value.roleMap) || value.roleMap.length === 0) failures.push("roleMap must contain at least one role mapping.");
  if (!Array.isArray(value.likelyQuestions) || value.likelyQuestions.length === 0) failures.push("likelyQuestions must contain at least one realistic question.");
  if (Array.isArray(value.proofObjectives)) for (let i = 0; i < value.proofObjectives.length; i++) if (!validateObjectiveShape(value.proofObjectives[i])) failures.push("proofObjectives[" + i + "] has missing or invalid required fields.");
  if (failures.length === 0 && !validatePass1(value, evidenceMap)) failures.push("Gate 1 rejected strategic reasoning: objective distinctness, evidence status/type consistency, or evidence safety failed.");
  return [...new Set(failures)];
}

async function runPass1(session: SessionRecord, evidenceMap: EvidenceMapNode[], language: SessionLanguage, diagnostics: string[] = []): Promise<unknown> {
  const diagnosticBlock = diagnostics.length ? "\n\nPREVIOUS PASS 1 VALIDATION FAILED. Regenerate the COMPLETE schema and correct these diagnostics:\n- " + diagnostics.join("\n- ") : "";
  const systemPrompt = "You are Interview Mirror's internal strategic reasoning engine. The output is never shown to the candidate. The EVIDENCE MAP is the only authoritative source of candidate facts. Never invent a fact, employer, tool, credential, industry, metric, date, scope, or outcome. NOT_DOCUMENTED and UNKNOWN nodes can only be verification points. QUALIFICATION is not employment experience. Produce EXACTLY 3 genuinely distinct proof objectives, each with a different PROVEN or PARTIALLY_PROVEN primary evidence node. Copy evidence_status and evidence_type exactly. Each objective must be built as ONE dependent strategic reasoning chain, not as independent fields. First determine the specific interviewer belief that must be established for this exact job. Then interrogate that belief from the perspective of a skeptical hiring manager: identify the most credible reason the interviewer could doubt it, based on a tension between the role requirement and the candidate evidence. The vulnerability must be derived from the belief and must NOT merely restate the belief or proof objective. Prefer substantive doubts about scope, ownership, scale, complexity, transferability, recency, or decision authority when supported by the CV/JD; do not invent a concern merely to sound insightful. Then select the single PROVEN or PARTIALLY_PROVEN evidence node that gives the strongest strategic leverage against that specific doubt—not simply the first matching node. Ask which documented fact would best survive an interviewer follow-up and most directly support the belief. Then formulate proof_point, mitigation, communication_angle, and probing_question from that same reasoning chain. The output must make clear: what the interviewer needs to believe, why they might hesitate to believe it, what evidence can resolve that hesitation, and how the candidate should position it. Avoid generic interview advice, generic caveats, and repetition between interviewer_belief and vulnerability. A strong objective should reveal a non-obvious but defensible interviewer concern the candidate may not have anticipated. Return the complete schema. Candidate language: " + (language === "fr" ? "French" : "English") + diagnosticBlock;
  const userPrompt = "Title: " + session.title + "\nInterview date: " + (session.interview_date ?? "Not provided") + "\n\nEVIDENCE MAP:\n" + JSON.stringify(evidenceMap, null, 2) + "\n\nCV context (do not extract facts outside the evidence map):\n" + session.cv_text.slice(0, 8000) + "\n\nJOB DESCRIPTION:\n" + session.job_description.slice(0, 6000) + "\n\nGenerate the strategic foundation.";
  return requestStructuredJson(systemPrompt, userPrompt, "strategy_pass1", PASS1_SCHEMA, 0.2);
}

export async function generateStrategicAnalysis(session: SessionRecord): Promise<{ evidenceMap: EvidenceMapNode[]; analysis: StrategicAnalysis }> {
  const language = normalizeLanguage(session.preparation_language);
  const evidenceMap = buildEvidenceMap(session);
  
  let diagnostics: string[] = []; let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await runPass1(session, evidenceMap, language, diagnostics);
      if (validatePass1(raw, evidenceMap)) return { evidenceMap, analysis: raw };
      diagnostics = pass1Diagnostics(raw, evidenceMap);
      lastError = new Error("Pass 1 Gate 1 failed: " + diagnostics.join(" | "));
    } catch (error) { lastError = error; diagnostics = [error instanceof Error ? error.message : "Pass 1 structured generation failed."]; }
  }
  throw lastError instanceof Error ? lastError : new Error("Pass 1 failed after repair cap.");
}

function validateInternalStrategy(strategy: unknown, evidenceMap: EvidenceMapNode[]): strategy is InternalStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any; const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  const isBound = (x: any) => x && typeof x === "object" && isNonEmptyString(x.text) && isNonEmptyString(x.evidence_node_id) && byId.has(x.evidence_node_id) && ["PROVEN", "PARTIALLY_PROVEN"].includes(byId.get(x.evidence_node_id)!.status);
  if (typeof s.candidatePositioning !== "string" || !isBound(s.strongestValueProposition) || !Array.isArray(s.strengthsToLeverage) || !Array.isArray(s.gapsOrRisks) || !Array.isArray(s.gapDefenseStrategy) || !Array.isArray(s.interviewPriorities) || !Array.isArray(s.likelyDifficultQuestions) || !Array.isArray(s.storiesToPrepare) || typeof s.communicationPriorities !== "string" || typeof s.interviewPlan !== "string" || typeof s.personalization !== "string") return false;
  if (s.interviewPriorities.length !== 3 || s.storiesToPrepare.length !== 3) return false;
  if (s.strengthsToLeverage.length > 3 || s.gapsOrRisks.length > 3 || s.gapDefenseStrategy.length > 3 || s.likelyDifficultQuestions.length < 3) return false;
  if (!s.strengthsToLeverage.every(isBound) || !s.interviewPriorities.every(isBound) || !s.storiesToPrepare.every(isBound)) return false;
  const priorityIds = s.interviewPriorities.map((x: BoundStrategyText) => x.evidence_node_id);
  const storyIds = s.storiesToPrepare.map((x: BoundStrategyText) => x.evidence_node_id);
  if (new Set(priorityIds).size !== 3) return false;
  for (let i = 0; i < 3; i++) if (priorityIds[i] !== storyIds[i]) return false;
  return true;
}

function internalDiagnostics(strategy: InternalStrategy, evidenceMap: EvidenceMapNode[]): string[] {
  const failures: string[] = []; const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  const checkBound = (label: string, item: BoundStrategyText) => { const node = byId.get(item?.evidence_node_id); if (!node) failures.push(label + ": unknown evidence_node_id " + item?.evidence_node_id); else if (!["PROVEN", "PARTIALLY_PROVEN"].includes(node.status)) failures.push(label + ": evidence node is not provable."); };
  checkBound("strongestValueProposition", strategy.strongestValueProposition);
  strategy.strengthsToLeverage.forEach((x, i) => checkBound("strengthsToLeverage[" + i + "]", x));
  strategy.interviewPriorities.forEach((x, i) => checkBound("interviewPriorities[" + i + "]", x));
  strategy.storiesToPrepare.forEach((x, i) => checkBound("storiesToPrepare[" + i + "]", x));
  if (strategy.interviewPriorities.length !== 3) failures.push("interviewPriorities must contain exactly 3 items.");
  if (strategy.storiesToPrepare.length !== 3) failures.push("storiesToPrepare must contain exactly 3 items.");
  if (strategy.interviewPriorities.length === 3 && new Set(strategy.interviewPriorities.map((x) => x.evidence_node_id)).size !== 3) failures.push("interviewPriorities must bind to three distinct primary evidence nodes.");
  return failures;
}

function collectFaithfulnessClaims(strategy: InternalStrategy): Array<{ claim_id: string; text: string; evidence_node_id: string }> {
  const claims: Array<{ claim_id: string; text: string; evidence_node_id: string }> = [{ claim_id: "strongestValueProposition", text: strategy.strongestValueProposition.text, evidence_node_id: strategy.strongestValueProposition.evidence_node_id }];
  strategy.strengthsToLeverage.forEach((x, i) => claims.push({ claim_id: "strengthsToLeverage[" + i + "]", text: x.text, evidence_node_id: x.evidence_node_id }));
  strategy.interviewPriorities.forEach((x, i) => claims.push({ claim_id: "interviewPriorities[" + i + "]", text: x.text, evidence_node_id: x.evidence_node_id }));
  strategy.storiesToPrepare.forEach((x, i) => claims.push({ claim_id: "storiesToPrepare[" + i + "]", text: x.text, evidence_node_id: x.evidence_node_id }));
  return claims;
}

function shadowLexicalGroundingReport(strategy: InternalStrategy, evidenceMap: EvidenceMapNode[]): void {
  const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  const claims = collectFaithfulnessClaims(strategy);
  const report = claims.map((claim) => {
    const node = byId.get(claim.evidence_node_id);
    return { claim_id: claim.claim_id, evidence_node_id: claim.evidence_node_id, lexical_overlap: node ? semanticOverlap(claim.text, node.fact) : 0 };
  });
  console.log("[Strategy Engine V2.2][shadow][legacy-lexical-grounding]", JSON.stringify(report));
}
async function verifyEvidenceFaithfulness(strategy: InternalStrategy, evidenceMap: EvidenceMapNode[]): Promise<{ ok: boolean; diagnostics: string[] }> {
  const claims = collectFaithfulnessClaims(strategy); const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  const invalid = claims.filter((c) => { const node = byId.get(c.evidence_node_id); return !node || !["PROVEN", "PARTIALLY_PROVEN"].includes(node.status); });
  if (invalid.length) return { ok: false, diagnostics: invalid.map((c) => c.claim_id + ": invalid or non-provable evidence binding.") };
  const payload = claims.map((c) => ({ claim_id: c.claim_id, claim: c.text, evidence_node_id: c.evidence_node_id, evidence_fact: byId.get(c.evidence_node_id)!.fact }));
  const system = "You are Interview Mirror's evidence-faithfulness verifier. Check whether each candidate-facing claim is supported by the exact evidence fact it cites. Natural paraphrases and directly supported implications are faithful; literal word overlap is not required. Mark false if the claim adds an unsupported specific employer, tool, metric, date, geography, scope, responsibility, qualification, or outcome. Return exactly one check for every claim_id.";
  const raw = await requestStructuredJson(system, "Evaluate these claims against their bound evidence facts:\n" + JSON.stringify(payload, null, 2), "evidence_faithfulness", FAITHFULNESS_SCHEMA, 0);
  const checks = Array.isArray(raw?.checks) ? raw.checks as FaithfulnessCheck[] : []; const byClaim = new Map(checks.map((c) => [c.claim_id, c])); const diagnostics: string[] = [];
  for (const claim of claims) { const check = byClaim.get(claim.claim_id); if (!check) diagnostics.push(claim.claim_id + ": verifier returned no check."); else if (!check.faithful) diagnostics.push(claim.claim_id + ": unsupported details: " + (check.unsupported_details?.join("; ") || "unspecified")); }
  if (checks.length !== claims.length) diagnostics.push("Faithfulness verifier did not return exactly one check per bound claim.");
  return { ok: diagnostics.length === 0, diagnostics };
}

function publicStrategyFromInternal(strategy: InternalStrategy, status?: "INSUFFICIENT_EVIDENCE"): InterviewStrategy {
  return {
    candidatePositioning: strategy.candidatePositioning, strongestValueProposition: strategy.strongestValueProposition.text,
    strengthsToLeverage: strategy.strengthsToLeverage.map((x) => x.text), gapsOrRisks: strategy.gapsOrRisks, gapDefenseStrategy: strategy.gapDefenseStrategy,
    interviewPriorities: strategy.interviewPriorities.map((x) => x.text), likelyDifficultQuestions: strategy.likelyDifficultQuestions, storiesToPrepare: strategy.storiesToPrepare.map((x) => x.text),
    communicationPriorities: strategy.communicationPriorities, interviewPlan: strategy.interviewPlan, personalization: strategy.personalization,
    ...(status ? { _strategy_status: status } : {}),
  } as InterviewStrategy;
}

function safeInsufficientEvidenceStrategy(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis | null): InterviewStrategy {
  const fr = normalizeLanguage(session.preparation_language) === "fr";
  const provable = evidenceMap.filter((n) => n.status === "PROVEN" || n.status === "PARTIALLY_PROVEN").slice(0, 3);
  const priorities = [0,1,2].map((i) => { const n = provable[i]; return n ? (fr ? "L'entretien doit établir ce que votre expérience sur « " + n.fact + " » permet réellement de démontrer pour ce poste." : "The interview must establish what your experience with “" + n.fact + "” actually demonstrates for this role.") : (fr ? "Les éléments disponibles ne permettent pas encore de formuler une démonstration suffisamment étayée pour ce point." : "The available evidence is not sufficient to formulate a well-supported demonstration for this point."); });
  const stories = [0,1,2].map((i) => { const n = provable[i]; return n ? (fr ? "Préparez un exemple précis lié à « " + n.fact + " » et expliquez votre rôle personnel, la décision et le résultat sans ajouter d'information non établie." : "Prepare one precise example linked to “" + n.fact + "” and explain your personal role, decision and outcome without adding unsupported information.") : (fr ? "Préparez un exemple concret de votre parcours permettant de vérifier ce point." : "Prepare one concrete example from your background that allows this point to be verified."); });
  const gaps = fr ? ["Certaines affirmations stratégiques ne peuvent pas être confirmées par les éléments disponibles.", "L'entretien devra vérifier les points pour lesquels le CV ne fournit pas de preuve directe."] : ["Some strategic claims cannot be confirmed from the available evidence.", "The interview should verify points for which the CV provides no direct evidence."];
  return { candidatePositioning: fr ? "La stratégie reste volontairement prudente lorsque les documents fournis ne permettent pas d'étayer une affirmation." : "The strategy remains deliberately conservative where the supplied evidence cannot support a stronger claim.", strongestValueProposition: fr ? "Votre message doit rester centré sur les responsabilités que votre parcours permet de démontrer directement." : "Your message should remain centred on responsibilities that your background directly supports.", strengthsToLeverage: provable.map((n) => fr ? "Expérience établie : " + n.fact + "." : "Established experience: " + n.fact + "."), gapsOrRisks: gaps, gapDefenseStrategy: fr ? ["Ne complétez pas les informations manquantes par une supposition. Donnez votre expérience réelle et son périmètre.", "Si un point est demandé, distinguez ce que vous avez personnellement fait de ce qui reste à vérifier."] : ["Do not fill evidence gaps with assumptions. Give the experience you actually have and its scope.", "If a point is challenged, distinguish what you personally did from what still needs to be verified."], interviewPriorities: priorities, likelyDifficultQuestions: fr ? ["Quel exemple précis de votre parcours permet de vérifier ce point?", "Quel a été exactement votre rôle personnel?", "Quel résultat pouvez-vous documenter?"] : ["Which specific example from your background verifies this point?", "What exactly was your personal role?", "What outcome can you substantiate?"], storiesToPrepare: stories, communicationPriorities: fr ? "Restez factuel : responsabilité personnelle, décision, périmètre et résultat." : "Stay factual: personal responsibility, decision, scope, and outcome.", interviewPlan: fr ? "Commencez par les faits établis, puis utilisez l'entretien pour vérifier les points encore incertains." : "Start with established facts, then use the interview to verify the points that remain uncertain.", personalization: fr ? "État de sécurité : certaines affirmations n'ont pas passé la vérification d'évidence." : "Safety state: some claims did not pass evidence verification.", _strategy_status: "INSUFFICIENT_EVIDENCE" } as InterviewStrategy;
}

async function runPass2(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis, language: SessionLanguage, diagnostics: string[] = []): Promise<InternalStrategy> {
  const diagnosticBlock = diagnostics.length ? "\n\nPREVIOUS PASS 2 VALIDATION FAILED. Regenerate the COMPLETE schema and correct these diagnostics. Do not return a partial patch:\n- " + diagnostics.join("\n- ") : "";
  const system = languageInstruction(language) + "\n\nYou are Interview Mirror's senior interview strategy engine. A validated strategic foundation is provided. Convert it into candidate-facing strategy while preserving evidence assignments. Return the complete internal schema.\n\nRules: candidatePositioning is role-specific, not a CV summary. strongestValueProposition is one central message bound to a real evidence node. strengthsToLeverage are established advantages bound to evidence. interviewPriorities are EXACTLY 3 in the same order as proof objectives and bind to their primary evidence. storiesToPrepare are EXACTLY 3 in the same order and bind to the same nodes. gapsOrRisks are vulnerabilities/verification points, not proven capability. gapDefenseStrategy must address doubt rather than restate a priority. likelyDifficultQuestions must contain at least 3 realistic questions. Do not expose evidence node IDs. Never invent tools, industry experience, metrics, dates, scope, employers, responsibilities or outcomes. QUALIFICATION is not employment experience. Distinguish what must be demonstrated from what could cause doubt. Natural paraphrase is encouraged.\n\n" + diagnosticBlock;
  const user = "VALIDATED STRATEGIC FOUNDATION:\n" + JSON.stringify(analysis, null, 2) + "\n\nEVIDENCE MAP:\n" + JSON.stringify(evidenceMap, null, 2) + "\n\nTitle: " + session.title + "\nInterview date: " + (session.interview_date ?? "Not provided") + "\n\nGenerate the complete strategy.";
  return requestStructuredJson(system, user, "strategy_pass2", PASS2_SCHEMA, 0.25) as Promise<InternalStrategy>;
}

async function generateExecutiveStrategy(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis, language: SessionLanguage): Promise<InterviewStrategy> {
  let diagnostics: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const internal = await runPass2(session, evidenceMap, analysis, language, diagnostics);
      if (!validateInternalStrategy(internal, evidenceMap)) { diagnostics = internalDiagnostics(internal, evidenceMap); continue; }
      shadowLexicalGroundingReport(internal, evidenceMap);
      const faithfulness = await verifyEvidenceFaithfulness(internal, evidenceMap);
      if (!faithfulness.ok) { diagnostics = faithfulness.diagnostics; continue; }
      const publicStrategy = publicStrategyFromInternal(internal);
      if (!isValidStrategy(publicStrategy, language, session.job_description, session.cv_analysis, session.cv_text, evidenceMap, analysis)) { diagnostics = ["Gate 2B quality validation failed: duplication, generic phrasing, language mismatch, or public contract issue."]; continue; }
      return publicStrategy;
    } catch (error) { diagnostics = [error instanceof Error ? error.message : "Pass 2 structured generation failed."]; }
  }
  console.warn("[Strategy Engine V2.2] repair cap reached; using safe INSUFFICIENT_EVIDENCE fallback.");
  return safeInsufficientEvidenceStrategy(session, evidenceMap, analysis);
}

export async function runStrategyEngineV2(session: SessionRecord): Promise<InterviewStrategy> {
  const language = normalizeLanguage(session.preparation_language);
  const evidenceMap = buildEvidenceMap(session);
  const provableCount = evidenceMap.filter((node) => node.status === "PROVEN" || node.status === "PARTIALLY_PROVEN").length;

  // Deterministic safe path: never force the AI to manufacture three proof objectives
  // when the supplied evidence cannot support them.
  if (evidenceMap.length < 3 || provableCount < 3) {
    console.warn("[Strategy Engine V2.2] insufficient provable evidence; returning deterministic safe strategy.");
    return safeInsufficientEvidenceStrategy(session, evidenceMap, null);
  }

  const result = await generateStrategicAnalysis(session);
  return generateExecutiveStrategy(session, result.evidenceMap, result.analysis, language);
}