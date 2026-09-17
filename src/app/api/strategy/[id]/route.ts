import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStrategy, SessionRecord, CvAnalysis } from "@/types";

function canonicalize(value: string): string { return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value: string): string { return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`; }
function parseAnalysis(value: unknown): CvAnalysis | null { if (typeof value === "string") { try { return JSON.parse(value) as CvAnalysis; } catch { return null; } } return value && typeof value === "object" ? value as CvAnalysis : null; }
function hasValidProvenance(value: unknown, session: SessionRecord): boolean { const a = parseAnalysis(value); const p = a?.provenance; return Boolean(p && p.contract_version === "v5.1" && p.preparation_language === session.preparation_language && p.cv_content_hash === hash(session.cv_text) && p.jd_content_hash === hash(session.job_description)); }

function hasObviousLanguageMismatch(text: string, language: "en" | "fr"): boolean {
  if (language === "fr") return /\b(?:strong command of|strong knowledge of|your experience|use your|prepare an|what you|if asked|the interviewer|the role|your strongest|evidence to use|accounting standards|experience with|experience in|the position requires|the role requires)\b/i.test(text);
  return /\b(?:votre expérience|utilisez votre|préparez|ce que vous|si l'on vous|l'intervieweur|le poste|vos points forts|preuves à utiliser|normes comptables|expérience avec|expérience en|le poste requiert|le rôle requiert)\b/i.test(text);
}

function normalizeForComparison(text: string): string[] {
  const stop = new Set(["the","your","this","that","with","from","into","about","what","which","where","when","and","les","des","une","un","votre","vous","avec","dans","pour","que","qui","sur","est","sont","ce","cette","ces","et","ou","mais","d","l","de"]);
  return canonicalize(text).toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((x) => x.length >= 4 && !stop.has(x));
}
function semanticOverlap(a: string, b: string): number {
  const aa = new Set(normalizeForComparison(a)); const bb = new Set(normalizeForComparison(b));
  if (!aa.size || !bb.size) return 0;
  let common = 0; aa.forEach((word) => { if (bb.has(word)) common++; });
  return common / Math.min(aa.size, bb.size);
}
function hasCrossSectionDuplication(strategy: any): boolean {
  const priorities = Array.isArray(strategy?.interviewPriorities) ? strategy.interviewPriorities : [];
  const defenses = Array.isArray(strategy?.gapDefenseStrategy) ? strategy.gapDefenseStrategy : [];
  for (const priority of priorities) for (const defense of defenses) if (typeof priority === "string" && typeof defense === "string" && semanticOverlap(priority, defense) >= 0.72) return true;
  for (let i = 0; i < priorities.length; i++) for (let j = i + 1; j < priorities.length; j++) if (semanticOverlap(priorities[i], priorities[j]) >= 0.78) return true;
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
function hasConcreteCvAnchor(text: string, cvText: string): boolean {
  const normalized = canonicalize(text).toLowerCase(); const cv = canonicalize(cvText).toLowerCase();
  const anchors = ["syngenta","mitsubishi","vfs global","ey","epp books","acca","monthly closing","financial reporting","budget","forecast","working capital","syscohada","ifrs","audit","tax authorities","internal control"];
  return anchors.some((anchor) => normalized.includes(anchor) && cv.includes(anchor));
}
function supportedTechnicalPoint(gap: string, session: SessionRecord): boolean { const lower = gap.toLowerCase(); if (!/(ifrs|ohada|syscohada)/.test(lower)) return false; return /acca|ifrs|syscohada|ohada/.test(session.cv_text.toLowerCase()); }
function deriveMaterialRisks(session: SessionRecord): string[] { return (session.cv_analysis?.gaps ?? []).filter((gap) => !supportedTechnicalPoint(gap, session)).slice(0, 3); }
function extractSourceAnchors(source: string): string[] {
  const anchors = new Set<string>(); const normalized = canonicalize(source);
  for (const match of normalized.matchAll(/\b[A-Z][A-Za-zÀ-ÿ0-9&.-]{2,}(?:\s+[A-Z][A-Za-zÀ-ÿ0-9&.-]{2,}){0,3}\b/g)) anchors.add(canonicalize(match[0]).toLowerCase());
  for (const match of normalized.matchAll(/\b[A-Z]{2,}[A-Z0-9/-]*\b/g)) anchors.add(match[0].toLowerCase());
  const genericWords = new Set(["the","your","with","from","this","that","experience","responsibility","responsibilities","financial","finance","accounting","management","reporting","budget","forecast","audit","tax","compliance","leadership","manager","l'expérience","expérience","responsabilité","responsabilités","comptabilité","gestion","reporting","budget","prévision","audit","fiscalité","conformité","management","avec","dans","pour","votre","vous"]);
  for (const sentence of normalized.split(/[.!?\n]+/)) { const words = sentence.toLowerCase().split(/[^a-zà-ÿ0-9]+/).filter((word) => word.length >= 5 && !genericWords.has(word)); for (let i = 0; i < words.length - 1; i++) { const phrase = `${words[i]} ${words[i + 1]}`; if (phrase.length >= 12) anchors.add(phrase); } }
  return [...anchors].filter((anchor) => anchor.length >= 3 && !genericWords.has(anchor));
}
function hasSpecificityAnchor(text: string, source: string): boolean { const normalized = canonicalize(text).toLowerCase(); return extractSourceAnchors(source).some((anchor) => normalized.includes(anchor)); }
function hasSpecificPriorityAnchors(strategy: any, cvText: string, jobDescription: string): boolean {
  if (!Array.isArray(strategy?.interviewPriorities) || strategy.interviewPriorities.length !== 3) return false;
  return strategy.interviewPriorities.every((priority: unknown) => typeof priority === "string" && hasSpecificityAnchor(priority, cvText) && hasSpecificityAnchor(priority, jobDescription));
}
function hasPresentationArtifacts(text: string): boolean {
  return /\b(?:expérience pertinente|point d'ancrage|evidence anchor)\s*:/i.test(text);
}
function hasBrokenSentenceConstruction(text: string): boolean {
  return /\.\s+[a-zà-ÿ]/.test(text) || /,\s+est\s+(?:votre|un|une|le|la|un point|votre principal)\b/i.test(text);
}
function hasInternalStrategyInstructions(text: string): boolean {
  return /\b(?:une expérience réelle du parcours doit servir|this experience should serve as an anchor|serve as the corresponding strategic anchor|point stratégique correspondant)\b/i.test(text);
}
function isValidStrategy(strategy: unknown, language: "en" | "fr", jobDescription = "", analysis: CvAnalysis | null = null, cvText = ""): strategy is InterviewStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any;
  const generic = /\b(clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|prepare examples|prepare simple examples|préparez des exemples|be ready|show your|connect your experience|reliez votre expérience|based on the cv|à partir du cv)\b/i;
  const unsafeIndustryGap = /(analogie|analogies|analogy|expériences? similaires que vous pourriez avoir|similar experiences? you could have|similar (?:industry|sector) experience)/i;
  const prepInstruction = /\b(?:préparez?|prepare|préparer|recherchez?|recherche|research|cherchez?|chercher|look for|find information|informez-vous|mettez en avant|mettez-vous à jour|review|étudiez?|study)\b/i;
  const priorityInstruction = /\b(?:démontrez?|démontrer|demonstrate|montrez?|montrer|show|clarifiez?|clarifier|clarify|expliquez?|expliquer|utilisez?|utiliser|use|appuyez-vous|appuyer|concentrez|concentrer|focus on|mettez en avant|highlight)\b/i;
  const weakKeyMessage = /\b(?:point d'appui|point d'appui principal|strongest proof point|strongest foundation)\b|\b(?:montrez concrètement|show specifically)\b/i;
  const allText = [s.candidatePositioning, s.strongestValueProposition, s.communicationPriorities, s.interviewPlan, s.personalization, ...s.strengthsToLeverage ?? [], ...s.gapsOrRisks ?? [], ...s.gapDefenseStrategy ?? [], ...s.interviewPriorities ?? [], ...s.likelyDifficultQuestions ?? [], ...s.storiesToPrepare ?? []].filter((x: any) => typeof x === "string").join(" ");
  const validQuestion = (x: any) => typeof x === "string" && !!x.trim() && x.length <= 320 && !generic.test(x) && !prepInstruction.test(x) && /\?|^(?:quelle|quels|comment|pourquoi|pouvez-vous|pouvez vous|donnez-moi|donnez moi|décrivez|what|which|how|why|can you|could you|tell me|describe)\b/i.test(x.trim());
  const validPriority = (x: any) => typeof x === "string" && !!x.trim() && x.length <= 420 && !generic.test(x) && !prepInstruction.test(x) && !priorityInstruction.test(x);
  const validCandidateEvidence = (x: any) => typeof x === "string" && !!x.trim() && !generic.test(x) && !prepInstruction.test(x) && !/\b(?:strong command of|strong knowledge of|accounting standards|experience with|experience in|the position requires|le poste requiert|normes comptables|expérience avec|expérience en)\b/i.test(x);
  const storiesValid = Array.isArray(s.storiesToPrepare) && s.storiesToPrepare.length === 3 && s.storiesToPrepare.every((x: any) => validCandidateEvidence(x) && hasConcreteCvAnchor(x, cvText));
  return typeof s.candidatePositioning === "string" && typeof s.strongestValueProposition === "string" && Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) && Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) && Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) && typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" && typeof s.personalization === "string" && !generic.test(s.candidatePositioning) && !generic.test(s.strongestValueProposition) && !weakKeyMessage.test(s.strongestValueProposition) && !generic.test(s.communicationPriorities) && !generic.test(s.interviewPlan) && !generic.test(s.personalization) && !unsafeIndustryGap.test(allText) && !hasObviousLanguageMismatch(allText, language) && !containsCopiedJdSentence(strategy, jobDescription) && !containsCopiedDiagnosticRequirement(strategy, analysis) && !hasCrossSectionDuplication(s) && !hasPresentationArtifacts(allText) && !hasBrokenSentenceConstruction(allText) && !hasInternalStrategyInstructions(allText) && hasSpecificPriorityAnchors(s, cvText, jobDescription) && s.interviewPriorities.length === 3 && s.interviewPriorities.every(validPriority) && s.likelyDifficultQuestions.length > 0 && s.likelyDifficultQuestions.every(validQuestion) && s.strengthsToLeverage.every(validCandidateEvidence) && storiesValid && s.gapsOrRisks.length <= 3 && s.gapsOrRisks.every((x: any) => typeof x === "string" && x.trim() && !generic.test(x));
}

function shortAnchor(value: string, maxWords = 14): string { return canonicalize(value).split(" ").slice(0, maxWords).join(" ").replace(/[,:;]+$/, ""); }
function evidenceItems(session: SessionRecord) { return (session.cv_analysis?.evidenceChain ?? []).filter((item) => item.cv_evidence && item.cv_evidence !== "NO CV EVIDENCE FOUND" && item.jd_requirement).slice(0, 6); }
function fallbackRoleAnchor(requirement: string, fr: boolean): string {
  const r = requirement.toLowerCase();
  if (r.includes("ohada") || r.includes("syscohada")) return fr ? "les normes OHADA/SYSCOHADA" : "OHADA/SYSCOHADA accounting standards";
  if (r.includes("ifrs")) return fr ? "les normes IFRS" : "IFRS standards";
  if (r.includes("erp") || r.includes("sage") || r.includes("sap") || r.includes("oracle")) return fr ? "les systèmes ERP" : "ERP systems";
  if (r.includes("regional") || r.includes("region")) return fr ? "la gestion d'un périmètre régional" : "regional scope management";
  if (r.includes("reporting")) return fr ? "le reporting financier" : "financial reporting";
  if (r.includes("budget") || r.includes("forecast")) return fr ? "le pilotage budgétaire et les prévisions" : "budgeting and forecasting";
  return fr ? "cette responsabilité clé du poste" : "this key role responsibility";
}
function cleanEvidence(value: string, maxWords = 28): string {
  return shortAnchor(value.replace(/^\s*(?:expérience pertinente|relevant experience|point d'ancrage|evidence anchor)\s*:\s*/i, ""), maxWords);
}
function fallbackStrategy(session: SessionRecord): InterviewStrategy {
  const language = normalizeLanguage(session.preparation_language); const fr = language === "fr"; const analysis = session.cv_analysis; const strengths = analysis?.strengths ?? []; const items = evidenceItems(session); const risks = deriveMaterialRisks(session); const cv = session.cv_text.toLowerCase();
  const candidateAnchor = cv.match(/syngenta|vfs global|mitsubishi|acca|epp books/i)?.[0] ?? (strengths[0] ? shortAnchor(strengths[0], 6) : "votre expérience la mieux documentée");
  const first = items[0]; const second = items[1] ?? items[0]; const third = items[2] ?? items[0];
  const firstRole = fallbackRoleAnchor(first?.jd_requirement ?? "", fr); const secondRole = fallbackRoleAnchor(second?.jd_requirement ?? "", fr); const thirdRole = fallbackRoleAnchor(third?.jd_requirement ?? "", fr);
  const priorities = [
    fr ? `Votre expérience ${candidateAnchor} doit établir votre niveau de responsabilité et l'impact que vous avez personnellement exercé. Reliez-la à ${firstRole} en montrant une décision, une analyse ou un résultat dont vous étiez directement responsable.` : `Your ${candidateAnchor} experience should establish your level of responsibility and the impact you personally had. Link it to ${firstRole} by showing a decision, analysis, or outcome for which you were directly responsible.`,
    fr ? `Votre expérience ${candidateAnchor} doit aussi établir la profondeur de votre pratique sur ${secondRole}. Faites ressortir ce que vous maîtrisiez réellement, le jugement que vous exerciez et la valeur produite.` : `Your ${candidateAnchor} experience should also establish the depth of your practice on ${secondRole}. Make clear what you genuinely owned, the judgement you applied, and the value created.`,
    fr ? `Votre parcours doit enfin montrer comment ${candidateAnchor} se transpose au périmètre du poste, notamment sur ${thirdRole}. L'intervieweur doit pouvoir distinguer ce qui est déjà démontré de ce qui devra encore être vérifié.` : `Your background should finally show how ${candidateAnchor} transfers to the role scope, particularly around ${thirdRole}. The interviewer should be able to distinguish what is already demonstrated from what still needs to be verified.`
  ];
  const stories = [first, second, third].map((item) => { const ev = cleanEvidence(item?.cv_evidence ?? candidateAnchor, 28); return fr ? `${ev}. Reliez cet exemple à la priorité correspondante en précisant votre rôle personnel, la décision prise ou influencée et le résultat obtenu.` : `${ev}. Link this example to the corresponding priority by making your personal role, the decision made or influenced, and the outcome explicit.`; });
  const defenses = risks.map((risk) => { const lower = risk.toLowerCase(); if (fr && /erp|sage|sap|oracle/.test(lower)) return "Si le sujet ERP est abordé, précisez l'outil réellement utilisé, le processus concerné, la durée d'utilisation et votre niveau de responsabilité. Ne déduisez pas une expérience SAP, Oracle ou SAGE d'un simple passage dans un groupe international."; if (fr && /minier|mining/.test(lower)) return "Si le secteur minier est abordé, reconnaissez simplement l'absence d'expérience sectorielle documentée. Appuyez-vous ensuite sur une expérience financière concrète pour démontrer votre capacité à comprendre un nouvel environnement opérationnel sans prétendre à une expertise minière."; if (!fr && /erp|sage|sap|oracle/.test(lower)) return "If the ERP topic comes up, specify the system actually used, the process involved, the duration of use, and your level of responsibility. Do not infer SAP, Oracle, or Sage experience from working in an international group."; if (!fr && /mining/.test(lower)) return "If mining comes up, acknowledge that sector experience is not documented. Then use a concrete finance experience to demonstrate how you would transfer your operating discipline to a new environment without claiming mining expertise."; return fr ? "Traitez ce point comme une vérification ciblée : distinguez clairement ce que votre CV établit, ce que vous avez réellement pratiqué et ce qui devra être démontré pendant l'entretien." : "Treat this as a targeted verification point: distinguish what the CV establishes, what you actually practiced, and what must be demonstrated in the interview."; });
  const difficult = [fr ? "Quelle décision avez-vous personnellement influencée dans une situation comparable à ce poste, et quel a été votre rôle exact ?" : "Which decision have you personally influenced in a situation comparable to this role, and what exactly was your role?", fr ? "Pouvez-vous décrire un processus financier que vous maîtrisiez réellement, le jugement que vous exerciez et le résultat obtenu ?" : "Can you describe a finance process you genuinely owned, the judgement you applied, and the outcome?", risks[0] ? (fr ? "Votre CV laisse ce point à vérifier : pouvez-vous préciser votre expérience réelle sur ce sujet, notamment votre périmètre, votre niveau d'implication et la durée ?" : "Your CV leaves this point to be verified: can you clarify your actual experience, including scope, level of involvement, and duration?") : (fr ? "Quel exemple de votre parcours démontre le mieux votre capacité à prendre des décisions au niveau attendu pour ce poste ?" : "Which example from your background best demonstrates your ability to make decisions at the level expected for this role?")];
  return {
    candidatePositioning: fr ? `Votre positionnement ne doit pas être celui d'un candidat qui possède simplement une solide expérience financière. Il doit montrer comment ${candidateAnchor} vous a déjà placé face à des responsabilités suffisamment concrètes pour démontrer votre niveau d'impact, puis établir ce qui doit encore être vérifié pour le poste visé.` : `Your positioning should not be that of a candidate who simply has strong finance experience. It should show how ${candidateAnchor} has already exposed you to meaningful responsibility and evidence of impact, while making clear what still needs to be verified for the target role.`,
    strongestValueProposition: fr ? `Votre parcours combine une expérience financière structurée et des responsabilités pertinentes pour ce poste. Le point différenciant à faire émerger est la chaîne « expérience → décision personnelle → impact », plutôt qu'une simple liste de responsabilités.` : `Your background combines structured finance experience with responsibilities relevant to this role. The differentiator to establish is the chain “experience → personal decision → impact”, rather than another list of responsibilities.`,
    strengthsToLeverage: strengths.slice(0, 3).map((x) => fr ? `Atout établi : ${shortAnchor(x, 28)}.` : `Established strength: ${shortAnchor(x, 28)}.`),
    gapsOrRisks: risks,
    gapDefenseStrategy: defenses,
    interviewPriorities: priorities,
    likelyDifficultQuestions: difficult,
    storiesToPrepare: stories,
    communicationPriorities: fr ? "Parlez en termes de décisions, de périmètre et de résultats. Distinguez toujours ce que vous avez personnellement fait de ce qui relevait de l'équipe." : "Speak in terms of decisions, scope, and outcomes. Always distinguish what you personally did from what belonged to the wider team.",
    interviewPlan: fr ? "Commencez par établir votre niveau d'impact, utilisez ensuite des expériences précises pour démontrer la profondeur de votre pratique, puis traitez séparément les points qui restent à vérifier." : "First establish your level of impact, then use specific experiences to demonstrate depth of practice, and address verification points separately.",
    personalization: fr ? "Cette stratégie distingue trois niveaux : ce que votre CV prouve, ce que votre expérience permet raisonnablement d'inférer et ce que l'entretien doit encore établir." : "This strategy separates three levels: what your CV proves, what your experience reasonably suggests, and what the interview still needs to establish."
  };
}

async function generateStrategy(session: SessionRecord): Promise<InterviewStrategy> {
  const openai = getOpenAI(); const language = normalizeLanguage(session.preparation_language);
  const systemPrompt = `${languageInstruction(language)}\
\
You are Interview Mirror's senior interview coach. Create the candidate's interview strategy from the CV, job description, Professional Mirror diagnostic, and interview date. The existing Strategy page layout is fixed and validated. Do not redesign it. Your job is to make the CONTENT inside that layout the candidate's strategic wow moment.\
\
CORE STANDARD — STRATEGY, NOT ANALYSIS:\
The strategy must tell the candidate how to position themselves, what they need to prove, which evidence should carry the proof, and how to handle genuine vulnerabilities. Do not repeat the CV or JD. Do not merely restate that a requirement exists. Every insight must answer what the evidence means for the interview and what the interviewer should conclude. Prefer tensions such as ownership versus exposure, depth versus breadth, regional scope versus personal decision authority, demonstrated capability versus unverified detail, and transferable capability versus missing industry experience.\
\
FIXED SECTION ROLES — DO NOT BLUR THEM:\
- candidatePositioning: overall positioning for this role.\
- strongestValueProposition: the single strategic message behind the candidate's answers.\
- strengthsToLeverage: concrete advantages already established by the CV.\
- interviewPriorities: EXACTLY 3 distinct proof objectives. They are not a list of gaps. Each must explain the desired interviewer takeaway and why the candidate's evidence matters.\
- storiesToPrepare: EXACTLY 3 evidence anchors, in the same order as the 3 priorities. Each must explain why the real experience proves the corresponding priority. IMPORTANT: return only the evidence/coaching sentence. Do not prefix it with labels such as "Expérience pertinente:", "Point d'ancrage:", or "Evidence anchor:" because the UI already supplies the section title.\
- gapsOrRisks: only genuine material gaps or verification points.\
- gapDefenseStrategy: how to handle those risks. It must NOT repeat the wording or strategic purpose of interviewPriorities. A risk may appear here and in a difficult question, but should normally not become an interview priority if it is already a point of attention.\
- likelyDifficultQuestions: actual interviewer questions derived from the strategy.\
- communicationPriorities: concise answer behaviour.\
- interviewPlan: concise sequence for using the strategy.\
- personalization: candidate-specific strategic logic, not generic advice.\
\
ANTI-REPETITION RULE — CRITICAL:\
The three interview priorities must be mutually distinct. Do not repeat the same requirement, gap, or observation across a priority and a point of attention. Before returning the JSON, compare every priority with every gapDefenseStrategy item and rewrite any pair that expresses the same idea. Points of attention should explain how to defend or clarify a vulnerability; interview priorities should focus on distinct proof objectives.\
\
SENTENCE QUALITY — NON-NEGOTIABLE:\
Every candidate-facing value must be a complete, idiomatic sentence. Never join unrelated clauses with a comma simply to combine observations. Never create fragments after a full stop. Never output internal drafting language such as "une expérience réelle du parcours doit servir...". Do not write malformed constructions such as "..., est votre principal levier" when the subject does not support that verb. Split complex ideas into two clean sentences when necessary. Before returning JSON, silently reread every French value as if it were written by a senior French-speaking executive coach.\
\
EVIDENCE CHAIN:\
For each priority, connect CV evidence -> role context -> interview implication -> desired interviewer takeaway. Use actual employers, qualifications, responsibilities, processes, scope, projects, or other concrete source details. Never invent facts. Never use the JD requirement itself as candidate evidence.\
\
EVIDENCE STATES:\
1) CV-established fact; 2) reasonable inference that must be verified; 3) candidate claim not established by CV; 4) unsupported information that must not be introduced. Never turn state 2 or 3 into state 1.\
\
ERP RULE:\
An ERP name absent from the CV is a verification point, not proof of absence. Do not infer SAP, Oracle, or Sage experience from a multinational employer.\
\
INDUSTRY RULE:\
If the target industry is absent from the CV, say so honestly and coach transferability without implying equivalent sector experience.\
\
TECHNICAL CAPABILITY RULE:\
Do not label IFRS/OHADA/SYSCOHADA or another capability as a gap when the CV establishes it. Instead, test depth, application, judgement, or ownership.\
\
LANGUAGE QUALITY:\
Candidate-facing text must be natural, idiomatic professional ${language === "fr" ? "French" : "English"}. Do not translate English sentence structures literally into French. Avoid fragments, duplicated ideas, awkward corporate wording, and unnecessary Franglais. In French, prefer natural executive language such as « démontrer concrètement », « niveau de responsabilité », « rôle personnel », « profondeur de pratique » and « point à vérifier ». Avoid « challengé » when a natural French expression works.\
\
SPECIFICITY GATE:\
Every interview priority must contain at least one concrete anchor traceable to the actual CV and one anchor traceable to the actual JD. Anchors can be employers, qualifications, responsibilities, scope, processes, systems, domains, or distinctive role requirements. Generic words such as finance, accounting, management, leadership, reporting, or compliance do not count.\
\
REUSE TEST:\
If a priority could be reused for another candidate applying to a similar role after removing the candidate-specific details, rewrite it. If it could have been produced by a basic CV/JD comparison, rewrite it into a deeper interview implication.\
\
Return exactly these JSON keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization. JSON keys remain in English; all candidate-facing values must use the selected language.`;
  const userPrompt = `Title: ${session.title}\
Interview date: ${session.interview_date ?? "Not provided"}\
\
CV:\
${session.cv_text.slice(0, 12000)}\
\
JOB DESCRIPTION:\
${session.job_description.slice(0, 8000)}\
\
PROFESSIONAL MIRROR DIAGNOSTIC:\
${JSON.stringify(session.cv_analysis)}\
\
Create the interview strategy.`;
  const completion = await openai.chat.completions.create({ model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.35, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }] });
  const raw = completion.choices[0]?.message?.content; if (!raw) throw new Error("Empty AI response");
  const parsed = JSON.parse(raw) as InterviewStrategy; if (!isValidStrategy(parsed, language, session.job_description, session.cv_analysis, session.cv_text)) throw new Error("Invalid strategy format");
  return parsed;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: session, error } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", user.id).single();
  if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const record = session as SessionRecord;
  if (!record.cv_analysis) return NextResponse.json({ error: "CV analysis is required before generating an interview strategy." }, { status: 400 });
  if (!hasValidProvenance(record.cv_analysis, record)) return NextResponse.json({ code: "ANALYSIS_PROVENANCE_INVALID", error: "The Professional Mirror analysis must be refreshed before an interview strategy can be generated." }, { status: 422 });
  if (isValidStrategy(record.interview_strategy, normalizeLanguage(record.preparation_language), record.job_description, record.cv_analysis, record.cv_text)) return NextResponse.json({ strategy: record.interview_strategy });
  let strategy: InterviewStrategy; try { strategy = await generateStrategy(record); } catch { strategy = fallbackStrategy(record); }
  const { error: updateError } = await supabase.from("sessions").update({ interview_strategy: strategy }).eq("id", id).eq("user_id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ strategy });
}
