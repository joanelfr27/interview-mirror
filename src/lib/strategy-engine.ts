import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { AtomicFactRequirementRelation, CanonicalJDRequirement, CvAnalysis, EvidenceChainItem, InterviewStrategy, SessionLanguage, SessionRecord } from "@/types";
import type { StrategicPlan } from "@/lib/strategy-plan-types";

// ---------------------------------------------------------------------------
// Internal strategic reasoning model (Pass 1 output). Never exposed to the UI
// or persisted; it only exists to constrain and validate Pass 2 generation.
// ---------------------------------------------------------------------------

export type EvidenceType = "EXPERIENCE" | "RESPONSIBILITY" | "ACHIEVEMENT" | "QUALIFICATION" | "SKILL" | "INDUSTRY_EXPERIENCE" | "TOOL_OR_SYSTEM";
export type EvidenceStatus = "PROVEN" | "PARTIALLY_PROVEN" | "UNKNOWN" | "NOT_DOCUMENTED";

export type EvidenceMapFact = {
  fact_id: string;
  fact: string;
  category: string;
  exact_source_text: string;
  requirement_relations?: AtomicFactRequirementRelation[];
};

export type EvidenceMapNode = {
  node_id: string;
  type: EvidenceType;
  status: EvidenceStatus;
  fact: string;
  jd_requirement: string;
  canonical_jd_requirements?: CanonicalJDRequirement[];
  supporting_facts: EvidenceMapFact[];
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
  const text = `${item.cv_evidence ?? ""}`;
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

  // "No gap identified" is not proof. The evidence node may only be treated as
  // provable when the analysis also carries atomic facts with exact CV source text.
  // This prevents an AI-generated cv_evidence sentence from becoming "PROVEN"
  // merely because gap_identified happens to be "none".
  const hasAtomicEvidence = (item.evidence_facts ?? []).some(
    (fact) => isNonEmptyString(fact.fact) && isNonEmptyString(fact.exact_source_text)
  );
  if (!hasAtomicEvidence) return "UNKNOWN";

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
    const supporting_facts = (item.evidence_facts ?? []).slice(0, 5).map((fact, factIndex) => ({
      fact_id: fact.fact_id || `E${String(index + 1).padStart(2, "0")}-F${factIndex + 1}`,
      fact: truncate(fact.fact ?? "", 18),
      category: fact.category ?? "OTHER",
      exact_source_text: fact.exact_source_text ?? "",
      requirement_relations: (fact.requirement_relations ?? [])
        .filter((relation) => relation?.requirement_id && relation?.exact_cv_source_text)
        .slice(0, 6)
        .map((relation) => ({
          requirement_id: relation.requirement_id,
          relation: relation.relation,
          documented_level: relation.documented_level,
          exact_cv_source_text: relation.exact_cv_source_text
        }))
    })).filter((fact) => fact.fact && fact.exact_source_text);
    return {
      node_id: `E${String(index + 1).padStart(2, "0")}`,
      type,
      status,
      fact,
      jd_requirement: truncate(item.jd_requirement ?? "", 16),
      canonical_jd_requirements: session.cv_analysis?.jdRequirements ?? [],
      supporting_facts,
    };
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
}function hasDifficultQuestionDuplication(strategy: any): boolean {
  const questions = Array.isArray(strategy?.likelyDifficultQuestions) ? strategy.likelyDifficultQuestions : [];
  if (questions.length < 3) return true;
  for (let i = 0; i < questions.length; i++) {
    for (let j = i + 1; j < questions.length; j++) {
      if (typeof questions[i] !== "string" || typeof questions[j] !== "string") return true;
      if (semanticOverlap(questions[i], questions[j]) >= 0.76) return true;
    }
  }
  return false;
}
function hasPriorityRiskDuplication(strategy: any, authoritativeVulnerabilities: string[] = []): boolean {
  const priorities = Array.isArray(strategy?.interviewPriorities) ? strategy.interviewPriorities : [];
  const risks = Array.isArray(strategy?.gapsOrRisks) ? strategy.gapsOrRisks : [];
  if (priorities.length !== 3 || risks.length !== 3) return true;

  // Each point of attention belongs to the corresponding priority. Compare only
  // those aligned pairs; comparing every priority with every risk creates false
  // positives because different tensions can legitimately share role vocabulary.
  for (let i = 0; i < 3; i++) {
    if (typeof priorities[i] !== "string" || typeof risks[i] !== "string") return true;
    // When an authoritative strategic plan supplies the interviewer doubt,
    // preserve that doubt even if it naturally overlaps with its priority.
    // The plan is the source of truth for this relationship; the generic
    // duplication guard remains active for legacy/non-authoritative paths.
    const authoritativeRisk = typeof authoritativeVulnerabilities[i] === "string"
      && authoritativeVulnerabilities[i].trim().length > 0
      && semanticOverlap(risks[i], authoritativeVulnerabilities[i]) >= 0.85;
    if (!authoritativeRisk && semanticOverlap(priorities[i], risks[i]) >= 0.78) return true;
  }
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
function factAnchorWords(fact: string): string[] {
  const stopwords = new Set(["experience", "financial", "finance", "responsibility", "reporting", "management", "accounting", "conformity", "compliance", "professional", "strength", "the", "and", "with", "from", "your", "this", "that", "for", "dans", "avec", "pour", "votre", "vous", "les", "des", "une", "un", "et", "de", "du", "la", "le"]);
  return [...new Set(normalizeForComparison(fact))].filter((word) => word.length >= 5 && !stopwords.has(word));
}

/** Returns the evidence node backing a story only if it is a real, provable fact (never QUALIFICATION-as-experience, never UNKNOWN/NOT_DOCUMENTED). */
function findProvableEvidenceNode(nodeId: string | undefined, evidenceMap: EvidenceMapNode[]): EvidenceMapNode | null {
  if (!nodeId) return null;
  const node = evidenceMap.find((n) => n.node_id === nodeId);
  if (!node) return null;
  if (node.status !== "PROVEN" && node.status !== "PARTIALLY_PROVEN") return null;
  return node;
}
function hasEvidenceNodeAnchor(text: string, node: EvidenceMapNode): boolean {  const anchors = factAnchorWords(node.fact).filter((word) => !STORY_ANCHOR_STOPWORDS.has(word));
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
function hasSpecificPriorityAnchors(strategy: any, cvText: string, jobDescription: string, evidenceMap: EvidenceMapNode[] = [], strategicAnalysis: StrategicAnalysis | null = null): boolean {
  if (!Array.isArray(strategy?.interviewPriorities) || strategy.interviewPriorities.length !== 3) return false;
  if (!cvText.trim() || !jobDescription.trim() || evidenceMap.length < 3) return false;

  const prioritySpecificityStopwords = new Set([
    "candidate", "experience", "professional", "finance", "financial", "accounting",
    "management", "manager", "reporting", "responsibility", "responsibilities",
    "leadership", "skills", "skill", "role", "position", "poste", "expérience",
    "professionnel", "finance", "financier", "comptabilité", "gestion",
    "responsabilité", "responsabilités", "management", "reporting", "compétence",
    "compétences", "vous", "votre", "your", "the", "this", "that", "with", "from",
    "pour", "dans", "avec", "sur", "les", "des", "une", "un", "et", "de", "du", "la", "le"
  ]);

  const distinctiveTokens = (text: string): Set<string> => new Set(
    normalizeForComparison(text).filter((token) => token.length >= 5 && !prioritySpecificityStopwords.has(token))
  );

  const evidenceById = new Map(evidenceMap.map((node) => [node.node_id, node]));

  return strategy.interviewPriorities.every((priority: unknown, index: number) => {
    if (typeof priority !== "string") return false;

    // During fresh generation, the authoritative Pass 1 proof objective identifies
    // the exact evidence node. Persisted public strategies intentionally do not expose
    // node IDs, so cache validation must not guess by array position. Instead, when the
    // authoritative metadata is unavailable, accept only a priority that anchors to
    // BOTH evidence and the JD requirement on the SAME evidence node.
    const primaryNodeId = strategicAnalysis?.proofObjectives?.[index]?.primary_evidence_node_id;
    const candidateNodes = primaryNodeId
      ? [evidenceById.get(primaryNodeId)].filter((node): node is EvidenceMapNode => Boolean(node))
      : evidenceMap;

    const priorityTokens = distinctiveTokens(priority);
    return candidateNodes.some((node) => {
      const boundEvidenceTokens = distinctiveTokens(node.fact);
      const evidenceOverlap = [...boundEvidenceTokens].filter((token) => priorityTokens.has(token));
      const requirementTokens = distinctiveTokens(node.jd_requirement);
      const roleOverlap = [...requirementTokens].filter((token) => priorityTokens.has(token));
      return evidenceOverlap.length >= 1 && roleOverlap.length >= 1;
    });
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
  const authoritativeVulnerabilities = Array.isArray(_strategicAnalysis?.vulnerabilities)
    ? _strategicAnalysis.vulnerabilities
    : [];
  if (hasPriorityRiskDuplication(s, authoritativeVulnerabilities)) return false;
  if (hasDifficultQuestionDuplication(s)) return false;
  if (stories.some((x: string) => hasPresentationArtifacts(x) || hasInternalStrategyInstructions(x))) return false;
  // Final quality gate: each proof priority must be anchored to both the
  // candidate's actual evidence and a distinctive target-role requirement.
  // This replaces the old "sounds strategic" test with a deterministic
  // candidate-specificity/reuse check.
  if (!hasSpecificPriorityAnchors(s, _cvText, _jobDescription, _evidenceMap, _strategicAnalysis)) return false;
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

function validatePass1(raw: any, evidenceMap: EvidenceMapNode[], authoritativePlan: StrategicPlan | null = null): raw is StrategicAnalysis {
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
  if (authoritativePlan) {
    if (authoritativePlan.tensions.length !== 3) return false;
    for (let i = 0; i < 3; i++) {
      if (objectives[i].primary_evidence_node_id !== authoritativePlan.tensions[i].primary_evidence_node_id) return false;
    }
  }
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

type BoundStrategyText = { text: string; evidence_node_id: string; supporting_fact_ids: string[] };
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
  properties: { text: { type: "string" }, evidence_node_id: { type: "string" }, supporting_fact_ids: { type: "array", items: { type: "string" }, minItems: 1 } },
  required: ["text", "evidence_node_id", "supporting_fact_ids"],
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

function structuredResponseFormat(name: string, schema: unknown) {  return { type: "json_schema" as const, json_schema: { name, strict: true, schema: schema as Record<string, unknown> } };
}

async function requestStructuredJson(system: string, user: string, name: string, schema: unknown, temperature = 0.2): Promise<any> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({ model: AI_MODEL, temperature, response_format: structuredResponseFormat(name, schema), messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty structured response: " + name);
  return JSON.parse(raw);
}

function pass1Diagnostics(raw: unknown, evidenceMap: EvidenceMapNode[], authoritativePlan: StrategicPlan | null = null): string[] {
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
  if (failures.length === 0 && !validatePass1(value, evidenceMap, authoritativePlan)) failures.push("Gate 1 rejected strategic reasoning: objective distinctness, evidence status/type consistency, evidence safety, or authoritative-plan binding failed.");
  return [...new Set(failures)];
}

async function runPass1(session: SessionRecord, evidenceMap: EvidenceMapNode[], language: SessionLanguage, diagnostics: string[] = [], authoritativeStrategicPlan = "", authoritativePlan: StrategicPlan | null = null): Promise<unknown> {
  const strategicPlanBlock = authoritativeStrategicPlan
    ? `\n\nAUTHORITATIVE STRATEGIC PLAN — STRATEGIC INTERPRETATION ONLY:\n${authoritativeStrategicPlan}\n\nThe plan controls the three strategic tensions and positioning logic. It is NOT evidence. Candidate facts may come only from the EVIDENCE MAP. Do not import candidate facts from the plan, JD, or prior reasoning.\n`
    : "";
  const diagnosticBlock = diagnostics.length
    ? `\n\nPREVIOUS PASS 1 VALIDATION FAILED. Regenerate the COMPLETE schema and correct these diagnostics:\n- ${diagnostics.join("\n- ")}`
    : "";
  const systemPrompt =
    "You are Interview Mirror's internal strategic reasoning engine. The output is never shown to the candidate. The EVIDENCE MAP is the only authoritative source of candidate facts. Never invent a fact, employer, tool, credential, industry, metric, date, scope, or outcome. NOT_DOCUMENTED and UNKNOWN nodes can only be verification points. QUALIFICATION is not employment experience. Produce EXACTLY 3 genuinely distinct proof objectives, each with a different PROVEN or PARTIALLY_PROVEN primary evidence node. Copy evidence_status and evidence_type exactly. Each objective must be built as ONE dependent strategic reasoning chain, not as independent fields. First determine the specific interviewer belief that must be established for this exact job. Then interrogate that belief from the perspective of a skeptical hiring manager: identify the most credible reason the interviewer could doubt it, based on a tension between the role requirement and the candidate evidence. The vulnerability must be derived from the belief and must NOT merely restate the belief or proof objective. Prefer substantive doubts about scope, ownership, scale, complexity, transferability, recency, or decision authority when supported by the CV/JD; do not invent a concern merely to sound insightful. Then select the single PROVEN or PARTIALLY_PROVEN evidence node that gives the strongest strategic leverage against that specific doubt—not simply the first matching node. Ask which documented fact would best survive an interviewer follow-up and most directly support the belief. Then formulate proof_point, mitigation, communication_angle, and probing_question from that same reasoning chain. The output must make clear: what the interviewer needs to believe, why they might hesitate to believe it, what evidence can resolve that hesitation, and how the candidate should position it. Avoid generic interview advice, generic caveats, and repetition between interviewer_belief and vulnerability. A strong objective should reveal a non-obvious but defensible interviewer concern the candidate may not have anticipated. Return the complete schema. Candidate language: " +
    (language === "fr" ? "French" : "English") +
    strategicPlanBlock +
    diagnosticBlock;
  const userPrompt =
    "Title: " + session.title +
    "\nInterview date: " + (session.interview_date ?? "Not provided") +
    "\n\nEVIDENCE MAP (complete candidate-fact boundary):\n" +
    JSON.stringify(evidenceMap, null, 2) +
    "\n\nIMPORTANT: Do not use the raw CV as a factual source in this stage. The EVIDENCE MAP is the complete candidate-fact boundary." +
    "\n\nJOB DESCRIPTION:\n" +
    session.job_description.slice(0, 6000) +
    "\n\nGenerate the strategic foundation.";
  return requestStructuredJson(systemPrompt, userPrompt, "strategy_pass1", PASS1_SCHEMA, 0.2);
}

export async function generateStrategicAnalysis(session: SessionRecord, authoritativeStrategicPlan = "", authoritativePlan: StrategicPlan | null = null): Promise<{ evidenceMap: EvidenceMapNode[]; analysis: StrategicAnalysis }> {
  const language = normalizeLanguage(session.preparation_language);
  const evidenceMap = buildEvidenceMap(session);

  // V2.3: the authoritative plan has already performed the strategic discovery
  // step. Re-running the same discovery in Pass 1 added latency and introduced
  // a second place where the model could reinterpret the same tension. Convert
  // the validated plan into the internal foundation deterministically.
  if (authoritativePlan) {
    const byId = new Map(evidenceMap.map((node) => [node.node_id, node]));
    const analysis: StrategicAnalysis = {
      positioning: authoritativePlan.candidate_positioning,
      roleMap: authoritativePlan.tensions.map((tension) => ({
        theme: tension.target_requirement,
        interviewer_relevance: tension.interviewer_belief,
      })),
      vulnerabilities: authoritativePlan.tensions.map((tension) => tension.interviewer_doubt),
      proofObjectives: authoritativePlan.tensions.map((tension, index) => {
        const node = byId.get(tension.primary_evidence_node_id);
        if (!node) throw new Error("Authoritative plan references unknown evidence node " + tension.primary_evidence_node_id + ".");
        return {
          id: tension.id,
          interviewer_belief: tension.interviewer_belief,
          why_it_matters: tension.target_requirement,
          primary_evidence_node_id: tension.primary_evidence_node_id,
          evidence_status: node.status,
          evidence_type: node.type,
          proof_point: tension.allowed_positioning,
          vulnerability: tension.interviewer_doubt,
          mitigation: tension.allowed_positioning,
          communication_angle: tension.allowed_positioning,
          probing_question: authoritativePlan.likely_questions[index] ?? ("How would you substantiate " + tension.interviewer_belief + "?"),
        };
      }),
      likelyQuestions: authoritativePlan.likely_questions,
    };

    if (validatePass1(analysis, evidenceMap, authoritativePlan)) {
      console.log("[Strategy Engine V2.3] authoritative plan promoted directly to strategic foundation; Pass 1 model call skipped.");
      return { evidenceMap, analysis };
    }

    console.warn("[Strategy Engine V2.3] deterministic strategic-foundation promotion failed; falling back to legacy Pass 1 validation loop.");
  }

  // Backward-compatible path for callers that do not provide an authoritative
  // plan. V2.3-lite always supplies one, so this path is not on the normal
  // generation route.
  let diagnostics: string[] = [];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await runPass1(session, evidenceMap, language, diagnostics, authoritativeStrategicPlan, authoritativePlan);
      if (validatePass1(raw, evidenceMap, authoritativePlan)) return { evidenceMap, analysis: raw };
      diagnostics = pass1Diagnostics(raw, evidenceMap, authoritativePlan);
      lastError = new Error("Pass 1 Gate 1 failed: " + diagnostics.join(" | "));
    } catch (error) {
      lastError = error;
      diagnostics = [error instanceof Error ? error.message : "Pass 1 structured generation failed."];
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Pass 1 failed after repair cap.");
}

function validateInternalStrategy(strategy: unknown, evidenceMap: EvidenceMapNode[]): strategy is InternalStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any; const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  const isBound = (x: any) => {
    if (!x || typeof x !== "object" || !isNonEmptyString(x.text) || !isNonEmptyString(x.evidence_node_id) || !byId.has(x.evidence_node_id) || !["PROVEN", "PARTIALLY_PROVEN"].includes(byId.get(x.evidence_node_id)!.status)) return false;
    const validIds = new Set((byId.get(x.evidence_node_id)!.supporting_facts ?? []).map((f) => f.fact_id));
    return Array.isArray(x.supporting_fact_ids) && x.supporting_fact_ids.length > 0 && new Set(x.supporting_fact_ids).size === x.supporting_fact_ids.length && x.supporting_fact_ids.every((id: unknown) => typeof id === "string" && validIds.has(id));
  };
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
  const checkBound = (label: string, item: BoundStrategyText) => { const node = byId.get(item?.evidence_node_id); if (!node) failures.push(label + ": unknown evidence_node_id " + item?.evidence_node_id);
    else if (!["PROVEN", "PARTIALLY_PROVEN"].includes(node.status)) failures.push(label + ": evidence node is not provable.");
    else if (!Array.isArray(item?.supporting_fact_ids) || item.supporting_fact_ids.length === 0 || item.supporting_fact_ids.some((id: string) => !node.supporting_facts.some((f) => f.fact_id === id))) failures.push(label + ": supporting_fact_ids must reference atomic facts on the bound evidence node."); };
  checkBound("strongestValueProposition", strategy.strongestValueProposition);
  strategy.strengthsToLeverage.forEach((x, i) => checkBound("strengthsToLeverage[" + i + "]", x));
  strategy.interviewPriorities.forEach((x, i) => checkBound("interviewPriorities[" + i + "]", x));
  strategy.storiesToPrepare.forEach((x, i) => checkBound("storiesToPrepare[" + i + "]", x));
  if (strategy.interviewPriorities.length !== 3) failures.push("interviewPriorities must contain exactly 3 items.");
  if (strategy.storiesToPrepare.length !== 3) failures.push("storiesToPrepare must contain exactly 3 items.");
  if (strategy.interviewPriorities.length === 3 && new Set(strategy.interviewPriorities.map((x) => x.evidence_node_id)).size !== 3) failures.push("interviewPriorities must bind to three distinct primary evidence nodes.");
  return failures;
}

function factIdsForNode(evidenceMap: EvidenceMapNode[], nodeId: string): string[] {
  return (evidenceMap.find((node) => node.node_id === nodeId)?.supporting_facts ?? []).map((fact) => fact.fact_id).slice(0, 3);
}

function alignStrategyToAuthoritativePlan(
  strategy: InternalStrategy,
  evidenceMap: EvidenceMapNode[],
  authoritativePlan: StrategicPlan | null,
  language: SessionLanguage,
): InternalStrategy {
  if (!authoritativePlan || authoritativePlan.tensions.length !== 3) return strategy;

  const fr = language === "fr";
  const tensions = authoritativePlan.tensions;

  // This function is intentionally a BINDING layer, not a text-normalization
  // layer. Pass 2 is responsible for producing the candidate-facing strategic
  // wording. Rewriting valid Pass 2 prose into deterministic templates here
  // destroys the interviewer reasoning that the authoritative plan contains.
  const enforceModeBoundary = (
    text: string,
    tension: StrategicPlan["tensions"][number],
  ): string => {
    const normalized = text.toLowerCase();

    if (tension.mode === "TRANSFERABLE") {
      const directClaim = fr
        ? /expérience\s+(?:minière|dans le secteur|en project finance|des opérations capitalistiques)|maîtrise\s+(?:des|du)|connaissance\s+(?:des|du) normes/.test(normalized)
        : /mining experience|experience in (?:mining|project finance|capital-intensive)|project finance experience|mastery of|knowledge of (?:the )?(?:standards|industry)/.test(normalized);

      if (directClaim) {
        return fr
          ? `Présentez les éléments documentés de votre parcours comme une capacité transférable vers « ${tension.target_requirement} », sans les présenter comme une expérience directe ou une maîtrise établie de ce domaine.`
          : `Present the documented elements of your background as a transferable capability toward “${tension.target_requirement}”, not as direct experience or established mastery of that domain.`;
      }
    }

    if (tension.mode === "VERIFY_GAP") {
      const directClaim = fr
        ? /expérience\s+(?:minière|dans le secteur|en project finance|des opérations capitalistiques)|expérience suffisante|maîtrise\s+(?:des|du)|connaissance\s+(?:des|du) normes/.test(normalized)
        : /sufficient experience|mining experience|project finance experience|experience in capital-intensive|mastery of|knowledge of (?:the )?(?:standards|industry)/.test(normalized);

      if (directClaim) {
        return fr
          ? `Le point à vérifier pendant l'entretien est ce que les éléments documentés de votre parcours permettent réellement d'établir sur « ${tension.target_requirement} ».`
          : `The interview should verify what the documented elements of your background actually establish against “${tension.target_requirement}”.`;
      }
    }

    return text;
  };

  const nodeById = new Map(evidenceMap.map((node) => [node.node_id, node]));

  return {
    ...strategy,
    candidatePositioning:
      strategy.candidatePositioning?.trim() ||
      authoritativePlan.candidate_positioning,

    strongestValueProposition: {
      ...strategy.strongestValueProposition,
      text:
        strategy.strongestValueProposition?.text?.trim() ||
        authoritativePlan.candidate_positioning,
      evidence_node_id:
        strategy.strongestValueProposition?.evidence_node_id ||
        tensions[0].primary_evidence_node_id,
      supporting_fact_ids:
        strategy.strongestValueProposition?.supporting_fact_ids?.length
          ? strategy.strongestValueProposition.supporting_fact_ids
          : (tensions[0].supporting_fact_ids ?? factIdsForNode(evidenceMap, tensions[0].primary_evidence_node_id)),
    },

    // Preserve Pass 2's strategic wording. Only re-bind the authoritative
    // evidence IDs and apply the hard DIRECT/TRANSFERABLE/VERIFY_GAP boundary.
    interviewPriorities: tensions.map((tension, index) => {
      const generated = strategy.interviewPriorities?.[index];
      return {
        text: enforceModeBoundary(
          generated?.text?.trim() || tension.interviewer_belief,
          tension,
        ),
        evidence_node_id: tension.primary_evidence_node_id,
        supporting_fact_ids: tension.supporting_fact_ids?.length
          ? tension.supporting_fact_ids
          : factIdsForNode(nodeById.has(tension.primary_evidence_node_id) ? evidenceMap : evidenceMap, tension.primary_evidence_node_id),
      };
    }),

    storiesToPrepare: tensions.map((tension, index) => {
      const generated = strategy.storiesToPrepare?.[index];
      return {
        text: enforceModeBoundary(
          generated?.text?.trim() || tension.interviewer_doubt,
          tension,
        ),
        evidence_node_id: tension.primary_evidence_node_id,
        supporting_fact_ids: tension.supporting_fact_ids?.length
          ? tension.supporting_fact_ids
          : factIdsForNode(evidenceMap, tension.primary_evidence_node_id),
      };
    }),

    // The authoritative doubt is the semantic source of truth for the point
    // of attention. Unlike the old normalizer, do not rewrite priorities,
    // questions, defenses, or communication sections into generic templates.
    gapsOrRisks: tensions.map((tension) => tension.interviewer_doubt),

    likelyDifficultQuestions:
      strategy.likelyDifficultQuestions?.filter((x) => x?.trim()).slice(0, 3).length === 3
        ? strategy.likelyDifficultQuestions.slice(0, 3)
        : authoritativePlan.likely_questions.slice(0, 3),

    gapDefenseStrategy:
      strategy.gapDefenseStrategy?.filter((x) => x?.trim()).length
        ? strategy.gapDefenseStrategy.slice(0, 3)
        : tensions.map((tension) => tension.allowed_positioning),

    communicationPriorities:
      strategy.communicationPriorities?.trim() ||
      (fr
        ? "Reliez chaque réponse au fait documenté, au doute de l'intervieweur et à la limite exacte de ce que votre parcours permet d'établir."
        : "Connect each answer to the documented fact, the interviewer's doubt, and the exact boundary of what your background establishes."),

    interviewPlan:
      strategy.interviewPlan?.trim() ||
      (fr
        ? "Traitez les trois tensions dans l'ordre : preuve documentée, exemple préparé, doute résiduel et point à confirmer."
        : "Work through the three tensions in order: documented proof, prepared example, residual doubt, and point to verify."),

    personalization:
      strategy.personalization?.trim() ||
      authoritativePlan.candidate_positioning,
  };
}
function strategicModeDiagnostics(strategy: InternalStrategy, authoritativePlan: StrategicPlan | null, language: SessionLanguage): string[] {
  if (!authoritativePlan || authoritativePlan.tensions.length !== 3) return [];
  const failures: string[] = [];
  const fr = language === "fr";
  const tensionByEvidence = new Map(authoritativePlan.tensions.map((t) => [t.primary_evidence_node_id, t]));
  for (let i = 0; i < 3; i++) {
    const tension = authoritativePlan.tensions[i];
    const priority = strategy.interviewPriorities[i]?.text ?? "";
    const story = strategy.storiesToPrepare[i]?.text ?? "";
    const priorityNodeId = strategy.interviewPriorities[i]?.evidence_node_id;
    const storyNodeId = strategy.storiesToPrepare[i]?.evidence_node_id;
    if (priorityNodeId !== tension.primary_evidence_node_id) {
      failures.push("interviewPriorities[" + i + "] is not bound to the authoritative tension evidence node.");
      continue;
    }
    if (storyNodeId !== tension.primary_evidence_node_id) {
      failures.push("storiesToPrepare[" + i + "] is not bound to the authoritative tension evidence node.");
      continue;
    }
    const boundTension = tensionByEvidence.get(priorityNodeId);
    if (!boundTension || boundTension.id !== tension.id) {
      failures.push("interviewPriorities[" + i + "] does not resolve to the expected authoritative tension.");
      continue;
    }
    const combined = (priority + " " + story).toLowerCase();
    if (boundTension.mode === "TRANSFERABLE") {
      const transferMarker = fr
        ? /transpos|transfér|applicable|mobilis|peut être adapté|peut être mobilisé/.test(combined)
        : /transfer|translat|applicable|adapt|can be applied|can be transferred/.test(combined);
      const directClaim = fr
        ? /expérience\s+(?:minière|dans le secteur|mining|de project finance|en project finance|des opérations capitalistiques)|maîtrise\s+(?:du secteur|de project finance)|expertise\s+(?:minière|sectorielle)/.test(combined)
        : /mining experience|experience in (?:mining|project finance|capital-intensive)|project finance experience|mining expertise|sector expertise/.test(combined);
      if (!transferMarker) failures.push("interviewPriorities[" + i + "] is TRANSFERABLE but does not explicitly frame the capability as transferable.");
      if (directClaim) failures.push("interviewPriorities[" + i + "] or storiesToPrepare[" + i + "] converts TRANSFERABLE into a target-domain experience claim.");
    }
    if (boundTension.mode === "VERIFY_GAP") {
      const verifyMarker = fr
        ? /vérifi|à confirmer|reste à établir|n'est pas (?:établi|documenté)|absence|ne permet pas d'affirmer/.test(combined)
        : /verify|confirm|needs to be established|not established|not documented|absence|cannot establish/.test(combined);
      const directClaim = fr
        ? /expérience suffisante|expérience\s+(?:minière|dans le secteur|en project finance|des opérations capitalistiques)|maîtrise\s+(?:des|du)|connaissance\s+(?:des|du) normes/.test(combined)
        : /sufficient experience|mining experience|project finance experience|experience in capital-intensive|mastery of|knowledge of (?:the )?(?:standards|industry)/.test(combined);
      if (!verifyMarker) failures.push("interviewPriorities[" + i + "] is VERIFY_GAP but does not explicitly frame the point as something to verify.");
      if (directClaim) failures.push("interviewPriorities[" + i + "] or storiesToPrepare[" + i + "] converts VERIFY_GAP into an established-experience claim.");
    }
  }
  return [...new Set(failures)];
}

function collectFaithfulnessClaims(strategy: InternalStrategy): Array<{ claim_id: string; text: string; evidence_node_id: string; supporting_fact_ids: string[] }> {
  const claims: Array<{ claim_id: string; text: string; evidence_node_id: string; supporting_fact_ids: string[] }> = [{ claim_id: "strongestValueProposition", text: strategy.strongestValueProposition.text, evidence_node_id: strategy.strongestValueProposition.evidence_node_id, supporting_fact_ids: strategy.strongestValueProposition.supporting_fact_ids }];
  strategy.strengthsToLeverage.forEach((x, i) => claims.push({ claim_id: "strengthsToLeverage[" + i + "]", text: x.text, evidence_node_id: x.evidence_node_id, supporting_fact_ids: x.supporting_fact_ids }));
  strategy.interviewPriorities.forEach((x, i) => claims.push({ claim_id: "interviewPriorities[" + i + "]", text: x.text, evidence_node_id: x.evidence_node_id, supporting_fact_ids: x.supporting_fact_ids }));
  strategy.storiesToPrepare.forEach((x, i) => claims.push({ claim_id: "storiesToPrepare[" + i + "]", text: x.text, evidence_node_id: x.evidence_node_id, supporting_fact_ids: x.supporting_fact_ids }));
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
async function verifyEvidenceFaithfulness(strategy: InternalStrategy, evidenceMap: EvidenceMapNode[], authoritativePlan: StrategicPlan | null = null): Promise<{ ok: boolean; diagnostics: string[] }> {
  const claims = collectFaithfulnessClaims(strategy); const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  const invalid = claims.filter((c) => { const node = byId.get(c.evidence_node_id); const validIds = new Set((node?.supporting_facts ?? []).map((f) => f.fact_id)); return !node || !["PROVEN", "PARTIALLY_PROVEN"].includes(node.status) || !Array.isArray(c.supporting_fact_ids) || c.supporting_fact_ids.length === 0 || c.supporting_fact_ids.some((id) => !validIds.has(id)); });
  if (invalid.length) return { ok: false, diagnostics: invalid.map((c) => c.claim_id + ": invalid or non-provable evidence binding.") };
  const tensionByNode = new Map((authoritativePlan?.tensions ?? []).map((t) => [t.primary_evidence_node_id, t]));
  const payload = claims.map((c) => {
    const tension = tensionByNode.get(c.evidence_node_id);
    return {
      claim_id: c.claim_id,
      claim: c.text,
      evidence_node_id: c.evidence_node_id,
      evidence_fact: byId.get(c.evidence_node_id)!.fact,
      supporting_facts: (byId.get(c.evidence_node_id)!.supporting_facts ?? []).filter((fact) => c.supporting_fact_ids.includes(fact.fact_id)).map((fact) => ({ fact_id: fact.fact_id, fact: fact.fact, category: fact.category, exact_source_text: fact.exact_source_text })),
      strategic_context: tension ? {
        mode: tension.mode,
        target_requirement: tension.target_requirement,
        interviewer_belief: tension.interviewer_belief,
        interviewer_doubt: tension.interviewer_doubt,
        allowed_positioning: tension.allowed_positioning,
        forbidden_inference: tension.forbidden_inference,
      } : null,
    };
  });
  const system = "You are Interview Mirror's evidence-faithfulness verifier. Check whether each candidate-facing statement is faithful to the exact atomic evidence facts and their exact CV source text that it cites while preserving the authoritative strategic context. The evidence facts and their exact_source_text are the hard boundary for candidate-specific facts. Natural paraphrases and directly supported implications are faithful; literal word overlap is not required. Mark false only when the statement asserts or clearly implies an unsupported candidate-specific employer, tool/system usage, standards knowledge, mastery/expertise, industry experience, metric, date, geography, scope, ownership, responsibility, qualification, or outcome. IMPORTANT: strategic statements are allowed to mention the target-role requirement, interviewer doubt, or a missing qualification when they are explicitly framed as a requirement, doubt, transferability issue, or verification point. Do NOT treat mention of a job requirement as candidate experience. For TRANSFERABLE, the statement must preserve transfer/adaptation framing and must not claim target-domain experience. For VERIFY_GAP, the statement may explicitly say the requirement remains to be verified/established and must not present it as candidate experience. A preparation instruction such as “prepare an example” is not itself a factual claim; evaluate only candidate facts asserted inside it. Use the strategic_context to distinguish role requirements from candidate facts. Return exactly one check for every claim_id.";
  const raw = await requestStructuredJson(system, "Evaluate these claims against their bound evidence facts and strategic context:\n" + JSON.stringify(payload, null, 2), "evidence_faithfulness", FAITHFULNESS_SCHEMA, 0);
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

function authoritativePlanFallbackStrategy(session: SessionRecord, evidenceMap: EvidenceMapNode[], plan: StrategicPlan): InterviewStrategy {
  const fr = normalizeLanguage(session.preparation_language) === "fr";
  const byId = new Map(evidenceMap.map((node) => [node.node_id, node]));
  const tensions = (plan.tensions ?? []).slice(0, 3);
  const boundFacts = (tension: StrategicPlan["tensions"][number], node: EvidenceMapNode | undefined): string[] => {
    if (!node) return [];
    const selected = new Set(tension.supporting_fact_ids ?? []);
    return node.supporting_facts.filter((fact) => selected.has(fact.fact_id)).map((fact) => fact.fact).filter(Boolean);
  };
  const factAnchor = (tension: StrategicPlan["tensions"][number], node: EvidenceMapNode | undefined): string =>
    boundFacts(tension, node).map((fact) => truncate(fact, 18)).join("; ") || truncate(node?.fact ?? tension.allowed_positioning, 18);

  const priorities = tensions.map((tension) => {
    const node = byId.get(tension.primary_evidence_node_id);
    const fact = factAnchor(tension, node);
    return fr
      ? `Reliez le fait documenté « ${fact} » à « ${truncate(tension.target_requirement, 18)} » et démontrez ${tension.interviewer_belief.toLowerCase()}.`
      : `Connect the documented fact “${fact}” to “${truncate(tension.target_requirement, 18)}” and demonstrate ${tension.interviewer_belief.toLowerCase()}.`;
  });

  const stories = tensions.map((tension) => {
    const node = byId.get(tension.primary_evidence_node_id);
    const fact = factAnchor(tension, node);
    return fr
      ? `Récupérez un exemple précis sur « ${fact} » qui vous permet de répondre au doute : « ${truncate(tension.interviewer_doubt, 24)} ».`
      : `Retrieve one precise example around “${fact}” that lets you answer the doubt: “${truncate(tension.interviewer_doubt, 24)}”.`;
  });

  const defenses = tensions.map((tension) => tension.allowed_positioning);
  const questions = tensions.map((tension) => {
    const node = byId.get(tension.primary_evidence_node_id);
    const fact = factAnchor(tension, node);
    return fr
      ? `En quoi le fait documenté « ${fact} » vous permet-il de répondre à « ${truncate(tension.target_requirement, 16)} » ?`
      : `How does the documented fact “${fact}” demonstrate your ability against “${truncate(tension.target_requirement, 16)}”?`;
  });

  const gaps = tensions.map((tension) => tension.interviewer_doubt);
  const strengths = tensions.map((tension) => {
    const node = byId.get(tension.primary_evidence_node_id);
    return fr
      ? `Point d'appui documenté : ${factAnchor(tension, node)}.`
      : `Documented evidence anchor: ${factAnchor(tension, node)}.`;
  });

  return {
    candidatePositioning: plan.candidate_positioning,
    strongestValueProposition: (() => {
      const t = tensions[0];
      const node = t ? byId.get(t.primary_evidence_node_id) : undefined;
      const fact = t ? factAnchor(t, node) : (fr ? "les faits documentés du parcours" : "the documented facts in the background");
      return fr
        ? `Votre valeur centrale repose sur le fait documenté « ${fact} », relié à ${truncate(t?.target_requirement ?? "les responsabilités clés du poste", 24)}, sans dépasser ce que votre parcours établit.`
        : `Your central value rests on the documented fact “${fact}”, connected to ${truncate(t?.target_requirement ?? "the role's key responsibilities", 24)}, without exceeding what your background establishes.`;
    })(),
    strengthsToLeverage: strengths,
    gapsOrRisks: gaps,
    gapDefenseStrategy: defenses,
    interviewPriorities: priorities,
    likelyDifficultQuestions: questions,
    storiesToPrepare: stories,
    communicationPriorities: fr
      ? "Pour chaque tension, partez du fait documenté, explicitez votre rôle et reliez-le à l'exigence visée. Ne transformez jamais une capacité transférable ou un point à vérifier en expérience directe."
      : "For each tension, start from the documented fact, make your role explicit, and connect it to the target requirement. Never turn a transferable capability or verification point into direct experience.",
    interviewPlan: fr
      ? "Commencez par votre positionnement central, puis traitez les trois tensions. Pour chacune : fait documenté → exemple préparé → réponse au doute → limite ou point à confirmer."
      : "Start with the central positioning, then address the three tensions. For each: documented fact → prepared example → answer to the doubt → boundary or point to confirm.",
    personalization: fr
      ? `Cette stratégie est construite autour de trois tensions propres à ce poste : ${tensions.map((t) => truncate(t.target_requirement, 12)).join(" ; ")}.`
      : `This strategy is built around three role-specific tensions: ${tensions.map((t) => truncate(t.target_requirement, 12)).join(" ; ")}.`,
    _strategy_status: "AUTHORITATIVE_PLAN_FALLBACK",
  } as InterviewStrategy;
}

function safeInsufficientEvidenceStrategy(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis | null): InterviewStrategy {
  const fr = normalizeLanguage(session.preparation_language) === "fr";
  const provable = evidenceMap.filter((n) => n.status === "PROVEN" || n.status === "PARTIALLY_PROVEN").slice(0, 3);
  const priorities = [0,1,2].map((i) => { const n = provable[i]; return n ? (fr ? "L'entretien doit établir ce que votre expérience sur « " + n.fact + " » permet réellement de démontrer pour ce poste." : "The interview must establish what your experience with “" + n.fact + "” actually demonstrates for this role.") : (fr ? "Les éléments disponibles ne permettent pas encore de formuler une démonstration suffisamment étayée pour ce point." : "The available evidence is not sufficient to formulate a well-supported demonstration for this point."); });
  const stories = [0,1,2].map((i) => { const n = provable[i]; return n ? (fr ? "Préparez un exemple précis lié à « " + n.fact + " » et expliquez votre rôle personnel, la décision et le résultat sans ajouter d'information non établie." : "Prepare one precise example linked to “" + n.fact + "” and explain your personal role, decision and outcome without adding unsupported information.") : (fr ? "Préparez un exemple concret de votre parcours permettant de vérifier ce point." : "Prepare one concrete example from your background that allows this point to be verified."); });
  const gapAnchors = provable.map((n) => truncate(n.jd_requirement, 12)).filter(Boolean);
  const gaps = [0, 1, 2].map((i) => {
    const anchor = gapAnchors[i] ?? (fr ? "cette exigence du poste" : "this role requirement");
    return fr
      ? `Le point à vérifier est le niveau de profondeur, de périmètre ou de contexte démontré sur « ${anchor} », au-delà de la seule présence de cette responsabilité dans le parcours.`
      : `The point to verify is the depth, scope, or context demonstrated against “${anchor}”, beyond simply having a related responsibility in the background.`;
  });
  return { candidatePositioning: fr ? "La stratégie reste volontairement prudente lorsque les documents fournis ne permettent pas d'étayer une affirmation." : "The strategy remains deliberately conservative where the supplied evidence cannot support a stronger claim.", strongestValueProposition: fr ? "Votre message doit rester centré sur les responsabilités que votre parcours permet de démontrer directement." : "Your message should remain centred on responsibilities that your background directly supports.", strengthsToLeverage: provable.map((n) => fr ? "Expérience établie : " + n.fact + "." : "Established experience: " + n.fact + "."), gapsOrRisks: gaps, gapDefenseStrategy: fr
    ? [
        "Ne complétez pas les informations manquantes par une supposition. Donnez votre expérience réelle et son périmètre.",
        "Pour chaque point, distinguez ce que vous avez personnellement pratiqué de ce qui doit encore être vérifié.",
        "Si le contexte du poste diffère de votre parcours, expliquez la capacité transférable sans transformer cette proximité en expérience directe."
      ]
    : [
        "Do not fill evidence gaps with assumptions. Give the experience you actually have and its scope.",
        "For each point, distinguish what you personally practiced from what still needs to be verified.",
        "If the role context differs from your background, explain the transferable capability without turning that proximity into direct experience."
      ], interviewPriorities: priorities, likelyDifficultQuestions: fr ? ["Quel exemple précis de votre parcours permet de vérifier ce point?", "Quel a été exactement votre rôle personnel?", "Quel résultat pouvez-vous documenter?"] : ["Which specific example from your background verifies this point?", "What exactly was your personal role?", "What outcome can you substantiate?"], storiesToPrepare: stories, communicationPriorities: fr ? "Restez factuel : responsabilité personnelle, décision, périmètre et résultat." : "Stay factual: personal responsibility, decision, scope, and outcome.", interviewPlan: fr ? "Commencez par les faits établis, puis utilisez l'entretien pour vérifier les points encore incertains." : "Start with established facts, then use the interview to verify the points that remain uncertain.", personalization: fr ? "État de sécurité : certaines affirmations n'ont pas passé la vérification d'évidence." : "Safety state: some claims did not pass evidence verification.", _strategy_status: "INSUFFICIENT_EVIDENCE" } as InterviewStrategy;
}

async function runPass2(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis, language: SessionLanguage, diagnostics: string[] = [], authoritativeStrategicPlan = "", authoritativePlan: StrategicPlan | null = null): Promise<InternalStrategy> {
  const strategicPlanBlock = authoritativeStrategicPlan
    ? `

AUTHORITATIVE STRATEGIC PLAN — THIS IS THE STRATEGIC SOURCE OF TRUTH:
${authoritativeStrategicPlan}

You are a strategy writer, not a second strategy-discovery engine. Preserve the three tensions, their modes, their doubts, their allowed positioning and their forbidden inferences. Do not replace them with generic strengths. For each interview priority, make the candidate-facing wording reflect the corresponding tension. DIRECT may describe the documented capability; TRANSFERABLE must explicitly frame the capability as transferable and must not claim target-domain experience; VERIFY_GAP must frame the point as something to verify and must not present it as established experience. The strategic plan is NOT candidate evidence. Candidate facts may come only from the bound EVIDENCE MAP node.
`
    : "";
  const diagnosticBlock = diagnostics.length
    ? `

PREVIOUS PASS 2 VALIDATION FAILED. Regenerate the COMPLETE schema and correct these diagnostics. Do not return a partial patch:
- ${diagnostics.join("\n- ")}`
    : "";
  const system = languageInstruction(language) + `

You are Interview Mirror's senior interview strategy writer. A validated strategic foundation and an AUTHORITATIVE STRATEGIC PLAN are provided. Convert them into candidate-facing strategy while preserving the strategic tensions and evidence assignments. Return the complete internal schema.

Rules:
- candidatePositioning is role-specific, not a CV summary.
- LANGUAGE HARD BOUNDARY: every candidate-facing output field must be entirely in the selected preparation language. The JD may be supplied in another language, but never copy raw JD wording into candidate-facing strategy. Translate or paraphrase requirements, doubts and positioning into the selected language.
- Evidence source text may remain verbatim only when it is explicitly presented as a source quotation/evidence reference. Do not silently embed English or French source phrases into otherwise translated strategic prose.
- strongestValueProposition is one central message bound to a real evidence node.
- strengthsToLeverage are established advantages bound to evidence.
- interviewPriorities are EXACTLY 3 in the same order as the authoritative plan's three tensions and bind to their primary evidence.
- Every interview priority must make the candidate-specific bridge explicit: name or clearly paraphrase at least one concrete detail from its bound evidence node and connect that detail to the specific target-role requirement. Do not write a reusable priority such as "highlight your finance experience" or "demonstrate leadership" without the candidate-specific anchor.
- The priority should explain the strategic tension created by this candidate's evidence and this role requirement, not merely restate the gap or requirement.
- storiesToPrepare are EXACTLY 3 in the same order and bind to the same nodes.
- gapsOrRisks must express the three distinct doubts/verification issues from the plan; do not simply repeat interview priorities.
- Each risk must represent the AUTHORITATIVE PLAN's interviewer_doubt for the corresponding tension. Do not turn the priority into a question. Preserve the underlying doubt even when rewriting it for the candidate.
- Avoid reusing the priority's concrete evidence phrase as the main content of the risk. The risk should surface what the interviewer still needs to verify: ownership, scope, scale, recency, depth, industry context, or transferability, as specified by the authoritative doubt.
- gapDefenseStrategy must tell the candidate how to handle that specific doubt and may use the plan's allowed_positioning, but must not simply repeat the priority.
- likelyDifficultQuestions must contain at least 3 realistic questions tied to the plan.
- Do not expose evidence node IDs.
- The bound evidence fact is a hard factual boundary: do not upgrade it into mastery, expertise, ownership, usage, scope, scale, industry experience, standards knowledge, tool/system experience, metrics, dates, employers, responsibilities or outcomes unless that exact fact is documented in the bound evidence node.
- A strategic priority may connect a documented fact to the job requirement, but must not turn the job requirement into a candidate fact.
- NEVER phrase a TRANSFERABLE tension as "experience in" the target domain; explicitly use transferability language such as "transposer", "applicable", or "mobiliser" and name the target-domain experience as not established when relevant.
- NEVER phrase a VERIFY_GAP tension as "sufficient experience", "mastery", or "knowledge"; frame it as a point the interviewer will verify or that the interview must establish.
- A story should be a preparation instruction anchored to the bound fact; it may tell the candidate to explain their actual role, decision or result, but must not assert that role, decision or result unless documented.
- QUALIFICATION is not employment experience.
- Distinguish what must be demonstrated from what could cause doubt.
- Natural paraphrase is encouraged.
- Treat target_requirement in the authoritative plan as a candidate-facing paraphrase, not as permission to copy the exact JD source. If the exact JD source and target_requirement differ in language, always use target_requirement in the candidate-facing output.
${strategicPlanBlock}${diagnosticBlock}`;
  const user = `AUTHORITATIVE STRATEGIC PLAN:
${authoritativeStrategicPlan}

VALIDATED STRATEGIC FOUNDATION:
${JSON.stringify(analysis, null, 2)}

EVIDENCE MAP:
${JSON.stringify(evidenceMap, null, 2)}

Title: ${session.title}
Interview date: ${session.interview_date ?? "Not provided"}

Generate the complete strategy.`;
  const raw = await requestStructuredJson(system, user, "strategy_pass2", PASS2_SCHEMA, 0.2) as InternalStrategy;
  return alignStrategyToAuthoritativePlan(raw, evidenceMap, authoritativePlan, language);
}

async function generateExecutiveStrategy(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis, language: SessionLanguage, authoritativeStrategicPlan = "", authoritativePlan: StrategicPlan | null = null): Promise<InterviewStrategy> {
  let diagnostics: string[] = [];
  // Two attempts are enough because the second call receives the exact deterministic
  // diagnostics from Gate 2A/2B. A third identical retry only adds latency; failure
  // still terminates safely through the deterministic insufficient-evidence path.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const internal = await runPass2(session, evidenceMap, analysis, language, diagnostics, authoritativeStrategicPlan, authoritativePlan);
      if (!validateInternalStrategy(internal, evidenceMap)) { diagnostics = internalDiagnostics(internal, evidenceMap); console.warn("[Strategy Engine V2.2] Pass 2 internal validation failed:", diagnostics); continue; }
      shadowLexicalGroundingReport(internal, evidenceMap);
      const modeDiagnostics = strategicModeDiagnostics(internal, authoritativePlan, language);
      if (modeDiagnostics.length) { diagnostics = modeDiagnostics; console.warn("[Strategy Engine V2.3] strategic mode validation failed:", diagnostics); continue; }
      const faithfulness = await verifyEvidenceFaithfulness(internal, evidenceMap, authoritativePlan);
      if (!faithfulness.ok) { diagnostics = faithfulness.diagnostics; console.warn("[Strategy Engine V2.2] evidence faithfulness failed:", diagnostics); continue; }
      const publicStrategy = publicStrategyFromInternal(internal);
      if (!isValidStrategy(publicStrategy, language, session.job_description, session.cv_analysis, session.cv_text, evidenceMap, analysis)) { diagnostics = ["Gate 2B quality validation failed: duplication, generic phrasing, language mismatch, or public contract issue."]; console.warn("[Strategy Engine V2.2] Gate 2B failed:", diagnostics); continue; }
      return publicStrategy;
    } catch (error) { diagnostics = [error instanceof Error ? error.message : "Pass 2 structured generation failed."]; console.warn("[Strategy Engine V2.2] Pass 2 generation error:", diagnostics); }
  }
  if (authoritativePlan && authoritativePlan.tensions?.length === 3) {
    console.warn("[Strategy Engine V2.3] Pass 2 repair cap reached; using deterministic authoritative-plan fallback.");
    return authoritativePlanFallbackStrategy(session, evidenceMap, authoritativePlan);
  }
  console.warn("[Strategy Engine V2.2] repair cap reached; using safe INSUFFICIENT_EVIDENCE fallback.");
  return safeInsufficientEvidenceStrategy(session, evidenceMap, analysis);
}

export async function runStrategyEngineV2(session: SessionRecord, authoritativeStrategicPlan = "", authoritativePlan: StrategicPlan | null = null): Promise<InterviewStrategy> {
  const language = normalizeLanguage(session.preparation_language);
  const evidenceMap = buildEvidenceMap(session);
  const provableCount = evidenceMap.filter((node) => node.status === "PROVEN" || node.status === "PARTIALLY_PROVEN").length;

  // Deterministic safe path: never force the AI to manufacture three proof objectives
  // when the supplied evidence cannot support them.
  if (evidenceMap.length < 3 || provableCount < 3) {
    console.warn("[Strategy Engine V2.2] insufficient provable evidence; returning deterministic safe strategy.");
    return safeInsufficientEvidenceStrategy(session, evidenceMap, null);
  }

  const result = await generateStrategicAnalysis(session, authoritativeStrategicPlan, authoritativePlan);
  return generateExecutiveStrategy(session, result.evidenceMap, result.analysis, language, authoritativeStrategicPlan, authoritativePlan);
}