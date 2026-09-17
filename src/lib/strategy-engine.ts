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

export function isValidStrategy(strategy: unknown, language: SessionLanguage, jobDescription = "", analysis: CvAnalysis | null = null, cvText = "", evidenceMap: EvidenceMapNode[] = [], strategicAnalysis: StrategicAnalysis | null = null): strategy is InterviewStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any;
  const generic = /\b(clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|prepare examples|prepare simple examples|préparez des exemples|be ready|show your|connect your experience|reliez votre expérience|based on the cv|à partir du cv)\b/i;
  const unsafeIndustryGap = /(analogie|analogies|analogy|expériences? similaires que vous pourriez avoir|similar experiences? you could have|similar (?:industry|sector) experience)/i;
  const prepInstruction = /\b(?:préparez?|prepare|préparer|recherchez?|recherche|research|cherchez?|chercher|look for|find information|informez-vous|mettez en avant|mettez-vous à jour|review|étudiez?|study)\b/i;
  const priorityInstruction = /\b(?:démontrez?|démontrer|demonstrate|montrez?|montrer|show|clarifiez?|clarifier|clarify|expliquez?|expliquer|utilisez?|utiliser|use|appuyez-vous|appuyer|concentrez|concentrer|focus on|mettez en avant|highlight)\b/i;
  const weakKeyMessage = /\b(?:point d'appui|point d'appui principal|strongest proof point|strongest foundation)\b|\b(?:montrez concrètement|show specifically)\b/i;
  const allText = [s.candidatePositioning, s.strongestValueProposition, s.communicationPriorities, s.interviewPlan, s.personalization, ...s.strengthsToLeverage ?? [], ...s.gapsOrRisks ?? [], ...s.gapDefenseStrategy ?? [], ...s.interviewPriorities ?? [], ...s.likelyDifficultQuestions ?? [], ...s.storiesToPrepare ?? []].filter((x: any) => typeof x === "string").join(" ");
  const validQuestion = (x: any) => typeof x === "string" && !!x.trim() && x.length <= 320 && !generic.test(x) && !prepInstruction.test(x) && /\?|^(?:quelle|quels|comment|pourquoi|pouvez-vous|pouvez vous|donnez-moi|donnez moi|décrivez|what|which|how|why|can you|could you|tell me|describe)\b/i.test(x.trim());
  // interviewPriorities legitimately expresses what the interview must establish using verbs like "démontrer"/"expliquer"/"préparer", so this field skips prepInstruction/priorityInstruction while keeping the generic-phrasing and length guards (evidence/role grounding is enforced separately by alignsWithAnalysis).
  const validPriority = (x: any) => typeof x === "string" && !!x.trim() && x.length <= 420 && !generic.test(x);
  const validCandidateEvidence = (x: any) => typeof x === "string" && !!x.trim() && !generic.test(x) && !prepInstruction.test(x) && !/\b(?:strong command of|strong knowledge of|accounting standards|experience with|experience in|the position requires|le poste requiert|normes comptables|expérience avec|expérience en)\b/i.test(x);
  // storiesToPrepare legitimately contains preparation instructions ("Préparez", "Mettez en avant", etc.), so this field skips the prepInstruction check while keeping every other anti-hallucination guard.
  const validStoryText = (x: any) => typeof x === "string" && !!x.trim() && !generic.test(x) && !/\b(?:strong command of|strong knowledge of|accounting standards|experience with|experience in|the position requires|le poste requiert|normes comptables|expérience avec|expérience en)\b/i.test(x);

  // Named checks (diagnostic-only decomposition; combined result is unchanged).
  const checks = {
    requiredShapes: typeof s.candidatePositioning === "string" && typeof s.strongestValueProposition === "string" && Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) && Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) && Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) && typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" && typeof s.personalization === "string",
    genericPositioningAndValueProp: !generic.test(s.candidatePositioning) && !generic.test(s.strongestValueProposition) && !weakKeyMessage.test(s.strongestValueProposition),
    commPlanPersonalization: !generic.test(s.communicationPriorities) && !generic.test(s.interviewPlan) && !generic.test(s.personalization),
    industryGapProtection: !unsafeIndustryGap.test(allText),
    languageMismatch: !hasObviousLanguageMismatch(allText, language),
    copiedJd: !containsCopiedJdSentence(strategy, jobDescription),
    copiedDiagnostic: !containsCopiedDiagnosticRequirement(strategy, analysis),
    crossSectionDuplication: !hasCrossSectionDuplication(s),
    presentationArtifacts: !hasPresentationArtifacts(allText),
    brokenSentenceConstruction: !hasBrokenSentenceConstruction(allText),
    internalStrategyInstructions: !hasInternalStrategyInstructions(allText),
    qualificationMisuse: !hasQualificationExperienceMisuse(allText, evidenceMap),
    toolMisuse: !hasToolClaimMisuse(allText, evidenceMap),
    industryMisuse: !hasIndustryClaimMisuse(allText, evidenceMap),
    priorityCount: Array.isArray(s.interviewPriorities) && s.interviewPriorities.length === 3,
    priorityValidity: Array.isArray(s.interviewPriorities) && s.interviewPriorities.every(validPriority),
    difficultQuestionValidity: Array.isArray(s.likelyDifficultQuestions) && s.likelyDifficultQuestions.length > 0 && s.likelyDifficultQuestions.every(validQuestion),
    strengthsValidity: Array.isArray(s.strengthsToLeverage) && s.strengthsToLeverage.every(validCandidateEvidence),
    storiesValidity: Array.isArray(s.storiesToPrepare) && s.storiesToPrepare.length === 3 && s.storiesToPrepare.every((x: any, i: number) => validStoryText(x) && storyBackedByEvidence(x, i, evidenceMap, strategicAnalysis)),
    gapsValidity: Array.isArray(s.gapsOrRisks) && s.gapsOrRisks.length <= 3 && s.gapsOrRisks.every((x: any) => typeof x === "string" && x.trim() && !generic.test(x)),
  };
  const result = Object.values(checks).every(Boolean);
  if (!result) {
    const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
    console.log("[Gate2][isValidStrategy] failed checks:", failed);

    if (!checks.priorityValidity && Array.isArray(s.interviewPriorities)) {
      s.interviewPriorities.forEach((x: any, i: number) => {
        if (validPriority(x)) return;
        const isString = typeof x === "string";
        const trimmedOk = isString && !!x.trim();
        const lengthOk = isString && x.length <= 420;
        const genericMatch = isString ? x.match(generic)?.[0] ?? null : null;
        const prepMatch = isString ? x.match(prepInstruction)?.[0] ?? null : null;
        const priorityMatch = isString ? x.match(priorityInstruction)?.[0] ?? null : null;
        console.log(`[Gate2][isValidStrategy][priorityValidity] index=${i} isString=${isString} trimmedOk=${trimmedOk} lengthOk=${lengthOk} genericMatch=${genericMatch} prepInstructionMatch=${prepMatch} priorityInstructionMatch=${priorityMatch}`);
      });
    }
    if (!checks.strengthsValidity && Array.isArray(s.strengthsToLeverage)) {
      s.strengthsToLeverage.forEach((x: any, i: number) => {
        if (validCandidateEvidence(x)) return;
        const isString = typeof x === "string";
        const trimmedOk = isString && !!x.trim();
        const genericMatch = isString ? x.match(generic)?.[0] ?? null : null;
        const prepMatch = isString ? x.match(prepInstruction)?.[0] ?? null : null;
        const jdEchoMatch = isString ? x.match(/\b(?:strong command of|strong knowledge of|accounting standards|experience with|experience in|the position requires|le poste requiert|normes comptables|expérience avec|expérience en)\b/i)?.[0] ?? null : null;
        console.log(`[Gate2][isValidStrategy][strengthsValidity] index=${i} isString=${isString} trimmedOk=${trimmedOk} genericMatch=${genericMatch} prepInstructionMatch=${prepMatch} jdEchoMatch=${jdEchoMatch}`);
      });
    }
    if (!checks.storiesValidity && Array.isArray(s.storiesToPrepare)) {
      s.storiesToPrepare.forEach((x: any, i: number) => {
        const isString = typeof x === "string";
        const evidenceOk = isString && validStoryText(x);
        const backedByEvidence = isString && storyBackedByEvidence(x, i, evidenceMap, strategicAnalysis);
        if (evidenceOk && backedByEvidence) return;
        const primaryNodeId = strategicAnalysis?.proofObjectives?.[i]?.primary_evidence_node_id ?? null;
        const node = findProvableEvidenceNode(primaryNodeId ?? undefined, evidenceMap);
        const genericMatch = isString ? x.match(generic)?.[0] ?? null : null;
        const prepMatch = isString ? x.match(prepInstruction)?.[0] ?? null : null;
        console.log(`[Gate2][isValidStrategy][storiesValidity] index=${i} isString=${isString} evidenceCheckOk=${evidenceOk} evidenceBackedOk=${backedByEvidence} primaryNodeId=${primaryNodeId} nodeFoundAndProvable=${Boolean(node)} genericMatch=${genericMatch} prepInstructionMatch=${prepMatch}`);
      });
    }
  }
  return result;
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

async function runPass1(session: SessionRecord, evidenceMap: EvidenceMapNode[], language: SessionLanguage): Promise<unknown> {
  const openai = getOpenAI();
  const systemPrompt = `You are Interview Mirror's internal strategic reasoning engine. Your output is NEVER shown to the candidate; it is a structured analysis consumed by another process. Do not write polished prose. Do not write in ${language === "fr" ? "French" : "English"} specifically — keep this JSON in plain analytical English regardless of the candidate's language.\n\nYou are given a fixed, code-generated EVIDENCE MAP. It is the ONLY source of candidate facts. You may reference these node_ids but must NEVER invent a new node, a new fact, a new employer, a new tool, or a new industry.\n\nRULES:\n- A node with status NOT_DOCUMENTED or UNKNOWN can only ever be used as a vulnerability/verification point. It can NEVER be the primary_evidence_node_id of a proof objective and never described as an established capability.\n- A node with type QUALIFICATION (e.g. a professional credential) is not employment experience. Never phrase it as \"experience at X\" or \"worked at X\".\n- A node with type TOOL_OR_SYSTEM that is NOT_DOCUMENTED must not be implied as used by the candidate.\n- A node with type INDUSTRY_EXPERIENCE that is NOT_DOCUMENTED must not be implied as the candidate's own sector experience.\n- Produce EXACTLY 3 proof objectives. Each must represent a genuinely different belief the interviewer must form about the candidate (do not force categories like Technical/Operational/Leadership — derive the real 3 objectives from this CV and this JD). Each objective's primary_evidence_node_id MUST be different from the other two.\n- Each objective must contain: id, interviewer_belief (what the interviewer must believe), why_it_matters (why that belief matters for this exact role), primary_evidence_node_id (must exist in the evidence map, status PROVEN or PARTIALLY_PROVEN only), evidence_status (copy exactly from the map), evidence_type (copy exactly from the map), proof_point (what this evidence actually proves), vulnerability (what could make the interviewer doubt this belief), mitigation (how to honestly address the doubt), communication_angle (how the candidate should talk about it), probing_question (a question the interviewer might realistically ask to test this belief).\n- Avoid generic interview advice. Every field must be traceable to this specific CV and this specific JD.\n\nReturn strict JSON with keys: positioning (string), roleMap (array of { theme, interviewer_relevance }), vulnerabilities (string[]), proofObjectives (array of exactly 3 objects as specified above), likelyQuestions (string[]).`;
  const userPrompt = `Title: ${session.title}\nInterview date: ${session.interview_date ?? "Not provided"}\n\nEVIDENCE MAP (the only facts you may use):\n${JSON.stringify(evidenceMap, null, 2)}\n\nCV (for context only, do not extract new facts beyond the evidence map):\n${session.cv_text.slice(0, 8000)}\n\nJOB DESCRIPTION:\n${session.job_description.slice(0, 6000)}\n\nProduce the structured strategic reasoning JSON.`;
  const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.3, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Pass 1 AI response");
  return JSON.parse(raw);
}

export async function generateStrategicAnalysis(session: SessionRecord): Promise<{ evidenceMap: EvidenceMapNode[]; analysis: StrategicAnalysis }> {
  const language = normalizeLanguage(session.preparation_language);
  const evidenceMap = buildEvidenceMap(session);
  if (evidenceMap.length < 3) throw new Error("Insufficient evidence to run the strategic reasoning engine");
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runPass1(session, evidenceMap, language);
      if (validatePass1(raw, evidenceMap)) return { evidenceMap, analysis: raw };
      lastError = new Error("Pass 1 reasoning failed Gate 1 validation");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Strategic analysis failed");
}

function factAnchorWords(fact: string): string[] {
  return canonicalize(fact).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((w) => w.length >= 5);
}

/** Deterministic traceability backstop: require each priority/story to reference at least one meaningful token from its assigned evidence fact. */
function alignsWithAnalysis(strategy: InterviewStrategy, analysis: StrategicAnalysis, evidenceMap: EvidenceMapNode[]): boolean {
  if (strategy.storiesToPrepare.length !== 3 || strategy.interviewPriorities.length !== 3) {
    console.log("[Gate2][alignsWithAnalysis] failed: storiesToPrepare/interviewPriorities length !== 3");
    return false;
  }
  const byId = new Map(evidenceMap.map((n) => [n.node_id, n]));
  for (let i = 0; i < 3; i++) {
    const nodeId = analysis.proofObjectives[i].primary_evidence_node_id;
    const node = byId.get(nodeId);
    if (!node) {
      console.log(`[Gate2][alignsWithAnalysis] index=${i} nodeId=${nodeId} result=FAIL reason=node-not-found`);
      return false;
    }
    const anchors = factAnchorWords(node.fact).filter((word) => !["experience", "financial", "finance", "responsibility", "reporting", "management", "accounting", "conformity", "compliance", "professional", "strength"].includes(word));
    if (!anchors.length) {
      console.log(`[Gate2][alignsWithAnalysis] index=${i} nodeId=${nodeId} anchorCount=0 result=SKIP(no-anchors)`);
      continue;
    }
    const storyLower = canonicalize(strategy.storiesToPrepare[i]).toLowerCase();
    const priorityLower = canonicalize(strategy.interviewPriorities[i]).toLowerCase();
    const inStory = anchors.some((a) => storyLower.includes(a));
    const inPriority = anchors.some((a) => priorityLower.includes(a));
    console.log(`[Gate2][alignsWithAnalysis] index=${i} nodeId=${nodeId} anchorCount=${anchors.length} anchorInStory=${inStory} anchorInPriority=${inPriority}`);
    if (!inStory || !inPriority) return false;
  }
  return true;
}

async function runPass2(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis, language: SessionLanguage): Promise<unknown> {
  const openai = getOpenAI();
  const systemPrompt = `${languageInstruction(language)}\n\nYou are Interview Mirror's senior interview coach. You have ALREADY completed a validated strategic analysis (provided below). Your only job now is to convert that VALIDATED reasoning into polished, candidate-facing text inside the existing, frozen Strategy page contract. Do not redo the reasoning, do not add a 4th objective, do not swap the primary evidence assigned to each objective, and do not invent any fact beyond the evidence map.\n\nFIXED SECTION ROLES:\n- candidatePositioning: overall positioning for this role, built from the provided \"positioning\" reasoning. Not a CV summary.\n- strongestValueProposition: the single strategic message behind the candidate's answers.\n- strengthsToLeverage: concrete advantages already established by the CV evidence map (status PROVEN or PARTIALLY_PROVEN only).\n- interviewPriorities: EXACTLY 3 items, in the SAME ORDER as the 3 proof objectives given below. Each must express the interviewer_belief and why_it_matters for that objective, and MUST include an identifiable concrete detail from that objective's primary evidence fact so it stays traceably anchored to real evidence, in natural prose (not a list of fields).\n- storiesToPrepare: EXACTLY 3 items, in the SAME ORDER as the 3 proof objectives. Each MUST be built from that objective's primary evidence fact and must explicitly reference identifiable wording from that fact. Each must explain what it proves and use the objective's communication_angle.\n- gapsOrRisks: build from the given vulnerabilities and from any NOT_DOCUMENTED/UNKNOWN evidence nodes not already used as primary evidence. Never claim these as proven capability.\n- gapDefenseStrategy: the honest mitigation for each risk (use the objectives' mitigation fields and the vulnerabilities list). Must not restate an interviewPriorities item.\n- likelyDifficultQuestions: derive from the objectives' probing_question fields and the likelyQuestions list.\n- communicationPriorities, interviewPlan, personalization: concise, candidate-specific, derived from the reasoning, not generic advice.\n\nCRITICAL RULES (do not violate):\n- A QUALIFICATION (e.g. a professional credential) is never an employer or work experience. Use phrasing like \"qualification\" or \"formation\", never \"experience at/chez X\".\n- Never claim an ERP/tool (SAP, Oracle, Sage, etc.) unless a corresponding evidence node is PROVEN or PARTIALLY_PROVEN.\n- Never claim target-industry experience unless a corresponding evidence node is PROVEN or PARTIALLY_PROVEN; otherwise honestly frame it as a transferability/verification point.\n- Never expose internal field names (node ids, \"primary evidence\", \"proof objective\", etc.) in candidate-facing text.\n- Write natural, idiomatic, professional ${language === "fr" ? "French" : "English"}. Avoid literal translation patterns and fragments.\n\nReturn exactly these JSON keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization.`;
  const userPrompt = `VALIDATED STRATEGIC REASONING (do not alter its structure or evidence assignments):\n${JSON.stringify(analysis, null, 2)}\n\nEVIDENCE MAP:\n${JSON.stringify(evidenceMap, null, 2)}\n\nTitle: ${session.title}\nInterview date: ${session.interview_date ?? "Not provided"}\n\nWrite the final candidate-facing interview strategy JSON.`;
  const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.35, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty Pass 2 AI response");
  return JSON.parse(raw);
}

export async function generateExecutiveStrategy(session: SessionRecord, evidenceMap: EvidenceMapNode[], analysis: StrategicAnalysis, language: SessionLanguage): Promise<InterviewStrategy> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runPass2(session, evidenceMap, analysis, language);
      const shapeValid = isValidStrategy(raw, language, session.job_description, session.cv_analysis, session.cv_text, evidenceMap, analysis);
      const aligned = shapeValid && alignsWithAnalysis(raw as InterviewStrategy, analysis, evidenceMap);
      console.log(`[Gate2][generateExecutiveStrategy] attempt=${attempt} isValidStrategy=${shapeValid} alignsWithAnalysis=${shapeValid ? aligned : "skipped"}`);
      if (shapeValid && aligned) return raw as InterviewStrategy;
      lastError = new Error("Pass 2 output failed Gate 2 validation");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Executive strategy generation failed");
}

export async function runStrategyEngineV2(session: SessionRecord): Promise<InterviewStrategy> {
  const language = normalizeLanguage(session.preparation_language);
  const { evidenceMap, analysis } = await generateStrategicAnalysis(session);
  return generateExecutiveStrategy(session, evidenceMap, analysis, language);
}
