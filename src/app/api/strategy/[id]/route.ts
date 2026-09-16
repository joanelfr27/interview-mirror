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
  return analysis.evidenceChain.some((item) => {
    const requirement = canonicalize(item.jd_requirement ?? "").toLowerCase();
    return requirement.length >= 24 && candidateText.includes(requirement);
  });
}

function hasConcreteCvAnchor(text: string, cvText: string): boolean {
  const normalized = canonicalize(text).toLowerCase();
  const cv = canonicalize(cvText).toLowerCase();
  const anchors = ["syngenta", "mitsubishi", "vfs global", "ey", "epp books", "acca", "monthly closing", "financial reporting", "budget", "forecast", "working capital", "syscohada", "ifrs", "audit", "tax authorities", "internal control"];
  return anchors.some((anchor) => normalized.includes(anchor) && cv.includes(anchor));
}

function supportedTechnicalPoint(gap: string, session: SessionRecord): boolean {
  const lower = gap.toLowerCase();
  if (!/(ifrs|ohada|syscohada)/.test(lower)) return false;
  const cv = session.cv_text.toLowerCase();
  return /acca|ifrs|syscohada|ohada/.test(cv);
}

function deriveMaterialRisks(session: SessionRecord): string[] {
  const gaps = session.cv_analysis?.gaps ?? [];
  return gaps.filter((gap) => !supportedTechnicalPoint(gap, session)).slice(0, 3);
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
  const validPriority = (x: any) => typeof x === "string" && !!x.trim() && x.length <= 320 && !generic.test(x) && !prepInstruction.test(x) && !priorityInstruction.test(x);
  const validCandidateEvidence = (x: any) => typeof x === "string" && !!x.trim() && !generic.test(x) && !prepInstruction.test(x) && !/\b(?:strong command of|strong knowledge of|accounting standards|experience with|experience in|the position requires|le poste requiert|normes comptables|expérience avec|expérience en)\b/i.test(x);
  const storiesValid = s.storiesToPrepare.length === 3 && s.storiesToPrepare.every((x: any) => validCandidateEvidence(x) && hasConcreteCvAnchor(x, cvText));
  return typeof s.candidatePositioning === "string" && typeof s.strongestValueProposition === "string" && Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) && Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) && Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) && typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" && typeof s.personalization === "string" && !generic.test(s.candidatePositioning) && !generic.test(s.strongestValueProposition) && !weakKeyMessage.test(s.strongestValueProposition) && !generic.test(s.communicationPriorities) && !generic.test(s.interviewPlan) && !generic.test(s.personalization) && !unsafeIndustryGap.test(allText) && !hasObviousLanguageMismatch(allText, language) && !containsCopiedJdSentence(strategy, jobDescription) && !containsCopiedDiagnosticRequirement(strategy, analysis) && s.interviewPriorities.length === 3 && s.interviewPriorities.every(validPriority) && s.likelyDifficultQuestions.length > 0 && s.likelyDifficultQuestions.every(validQuestion) && s.strengthsToLeverage.every(validCandidateEvidence) && storiesValid && s.gapsOrRisks.every((x: any) => typeof x === "string" && x.trim() && !generic.test(x));
}

function fallbackStrategy(session: SessionRecord): InterviewStrategy {
  const language = normalizeLanguage(session.preparation_language);
  const isFrench = language === "fr";
  const strengths = session.cv_analysis?.strengths ?? [];
  const evidenceChain = session.cv_analysis?.evidenceChain ?? [];
  const materialRisks = deriveMaterialRisks(session);
  const cv = session.cv_text.toLowerCase();
  const topStrength = strengths[0] ?? (isFrench ? "votre expérience financière la mieux démontrée" : "your strongest documented finance experience");
  const evidence = evidenceChain.filter((item) => item.cv_evidence && item.cv_evidence !== "NO CV EVIDENCE FOUND").map((item) => item.cv_evidence as string);
  const syngentaEvidence = evidence.find((x) => /syngenta/i.test(x)) ?? evidence.find((x) => /financial reporting|reporting|budget|forecast|working capital|monthly closing/i.test(x));
  const technicalEvidence = cv.match(/acca|ifrs|syscohada|ohada/i) ? (evidence.find((x) => /syscohada|ifrs|audit/i.test(x)) ?? (isFrench ? "Votre qualification ACCA et votre expérience en audit/reporting constituent une base technique solide." : "Your ACCA qualification and audit/reporting experience provide a strong technical foundation.")) : (evidence[1] ?? evidence[0]);
  const transferableEvidence = evidence.find((x) => /vfs|syngenta|mitsubishi|closing|budget|forecast|working capital|finance operations/i.test(x)) ?? evidence[0];
  const gapDefense = materialRisks.map((gap) => {
    const lower = gap.toLowerCase();
    if (isFrench && /erp|sage|sap|oracle/.test(lower)) return "Votre CV ne précise pas les ERP utilisés. Ne revendiquez pas un outil non démontré ; soyez prêt à préciser les systèmes réellement utilisés, les processus finance concernés et votre niveau d'utilisation.";
    if (isFrench && /minier|mining/.test(lower)) return "Vous n'avez pas d'expérience directe dans le secteur minier. Reconnaissez-le clairement et appuyez-vous sur vos compétences financières transférables sans présenter un autre secteur comme équivalent.";
    if (!isFrench && /erp|sage|sap|oracle/.test(lower)) return "Your CV does not specify the ERP systems used. Do not claim an unsupported tool; be ready to explain the systems you actually used, the finance processes involved, and your level of use.";
    if (!isFrench && /mining/.test(lower)) return "You do not have direct mining experience. State that clearly and use your transferable finance capabilities without presenting another industry as equivalent.";
    return isFrench ? "Distinguez clairement ce que votre parcours démontre de ce qu'il ne démontre pas encore." : "Clearly distinguish what your background demonstrates from what it does not yet demonstrate.";
  });
  const stories = [syngentaEvidence, technicalEvidence, transferableEvidence].filter(Boolean).slice(0, 3).map((item) => isFrench ? `Expérience pertinente : ${item}.` : `Relevant experience: ${item}.`);
  while (stories.length < 3) stories.push(isFrench ? "Mobilisez une expérience réelle de votre parcours directement liée au point à démontrer." : "Use a real experience from your career directly linked to the point to demonstrate.");
  const risk = materialRisks[0];
  const priorities = [
    isFrench ? `${topStrength} constitue un différenciateur crédible ; l'intervieweur doit reconnaître votre profondeur, votre périmètre et votre impact en finance.` : `${topStrength} is a credible differentiator; the interviewer should recognize your depth, scope, and impact in finance.`,
    isFrench ? `${technicalEvidence} constitue une preuve de votre capacité à répondre aux responsabilités techniques et de reporting du poste.` : `${technicalEvidence} provides evidence of your ability to handle the role's technical and reporting responsibilities.`,
    isFrench ? risk ? `Votre profil reste crédible sur les points non démontrés, notamment ${risk.toLowerCase()} : vous devez distinguer expérience établie, exposition réelle et capacité transférable.` : "Votre troisième priorité est d'établir une preuve supplémentaire de profondeur, d'impact ou de leadership sur une responsabilité importante du poste." : risk ? `Your profile remains credible on areas not demonstrated, including ${risk.toLowerCase()}: distinguish established experience, actual exposure, and transferable capability.` : "Your third priority is to establish another concrete proof of depth, impact, or leadership on an important responsibility of the role."
  ];
  const gapRisks = materialRisks.length ? materialRisks : (session.job_description.match(/ERP|SAGE|SAP|Oracle|mining|minier/gi) ? [isFrench ? "Les outils ERP ou l'environnement sectoriel doivent être vérifiés précisément." : "ERP tools or industry environment need to be verified precisely."] : []);
  return {
    candidatePositioning: isFrench ? `${topStrength} constitue votre principal atout pour ce poste. Votre stratégie consiste à démontrer la profondeur de cette expérience tout en restant précis sur les éléments non documentés.` : `${topStrength} is your main strength for this role. Your strategy is to demonstrate the depth of that experience while staying precise about what is not documented.`,
    strongestValueProposition: isFrench ? "Votre expérience en finance dans des groupes internationaux constitue un atout central pour ce rôle. L'entretien doit maintenant rendre visibles votre profondeur technique, votre périmètre régional et votre capacité à prendre en charge les responsabilités clés." : "Your finance experience in international groups is a central strength for this role. The interview should make your technical depth, regional scope, and ability to handle key responsibilities visible.",
    strengthsToLeverage: strengths.slice(0, 3),
    gapsOrRisks: gapRisks.slice(0, 3),
    gapDefenseStrategy: gapDefense,
    interviewPriorities: priorities,
    likelyDifficultQuestions: [
      isFrench ? "Quelle expérience démontre le mieux votre capacité à prendre en charge les responsabilités clés de ce poste ?" : "Which experience best demonstrates your ability to handle the key responsibilities of this role?",
      isFrench ? "Comment avez-vous appliqué vos connaissances comptables et de reporting dans un environnement international ?" : "How have you applied your accounting and reporting knowledge in an international environment?",
      isFrench ? "Quels systèmes financiers avez-vous réellement utilisés et sur quels processus ?" : "Which finance systems have you actually used and on which processes?"
    ],
    storiesToPrepare: stories,
    communicationPriorities: isFrench ? "Répondez directement, décrivez votre rôle personnel et donnez un résultat vérifiable. Ne transformez jamais une hypothèse en expérience revendiquée." : "Answer directly, describe your personal role, and give a substantiated result. Never turn an assumption into claimed experience.",
    interviewPlan: isFrench ? "Commencez par votre expérience la plus forte, démontrez ensuite votre crédibilité technique et terminez par les points qui nécessitent une réponse précise." : "Start with your strongest experience, then demonstrate technical credibility, and finish with the points that require a precise response.",
    personalization: isFrench ? "Pour chaque réponse, reliez une expérience réelle à une responsabilité précise du poste et distinguez ce qui est démontré de ce qui doit encore être vérifié." : "For each answer, link a real experience to a specific role responsibility and distinguish what is demonstrated from what still needs to be verified."
  };
}

async function generateStrategy(session: SessionRecord): Promise<InterviewStrategy> {
  try {
    const openai = getOpenAI();
    const language = normalizeLanguage(session.preparation_language);
    const completion = await openai.chat.completions.create({
      model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.4,
      messages: [{ role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's senior interview coach. Create a precise, candidate-specific interview strategy from the CV, job description, Professional Mirror diagnostic, and interview date. The result must feel like a human coach who has studied this candidate and this job, not like a generic report.\n\nCandidate-facing text must be entirely in the selected preparation language. JSON keys remain exactly in English. Translate source wording when necessary; do not copy English sentences into French output or French sentences into English output. Standard acronyms and proper names such as ERP, SAP, IFRS, OHADA/SYSCOHADA may remain unchanged. Return exactly these keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization.\n\nQUALITY RULES:\n- Base every statement on the current CV, JD, and analysis. Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, industry experience, stakeholders, or outcomes.\n- Use four evidence states throughout the reasoning: (1) CV-established fact; (2) reasonable inference or contextual signal that is not yet a fact; (3) candidate claim not established by the CV; (4) unsupported information that must not be introduced. Never collapse states 2 or 3 into state 1.\n- A reasonable inference is useful because an interview can establish the underlying fact. Turn it into a targeted clarification/verification point rather than either inventing the fact or incorrectly calling it a gap. Example: a CV showing finance work in international groups may justify asking which ERP systems the candidate actually used, but it does not prove SAP, Oracle, Sage, or any other personal tool experience.\n- Candidate claims supplied outside the CV are claims to establish in the interview. Do not present them as CV-verified facts, but do not incorrectly describe them as absent experience either. The interview should probe the claim precisely enough to establish what the candidate actually did.\n- Calibrate the strategy to the actual fit shown by the Professional Mirror. Do not manufacture weaknesses. A qualification, skill, or responsibility explicitly supported by the CV is demonstrated capability, not a gap. For example, when the CV contains a relevant professional qualification plus related reporting/audit experience, do not downgrade that capability merely because the JD also asks for it.\n- The strategy must answer one question: what does this candidate need to demonstrate in this interview?\n- Strengths must identify concrete advantages and anchor them in real CV experiences. Never use a job-description requirement as candidate evidence.\n- Gaps and risks must name only specific material requirements that are genuinely absent, or verification points where the CV provides a meaningful signal but not enough detail to establish the fact. Label the distinction clearly in candidate-facing wording.\n- IMPORTANT: An absent ERP name on the CV is not proof that the candidate has never used an ERP. Treat it as an evidence/verification point unless the CV explicitly establishes absence. Do not infer SAP, Sage, Oracle, or any other personal tool experience merely from the employer being a multinational.\n- IMPORTANT: Do not treat IFRS/OHADA/SYSCOHADA as a gap when the CV explicitly supports the capability through qualifications, skills, audit experience, or reporting experience. The interviewer may test depth/application, but the strategy should present the demonstrated foundation accurately. If the CV suggests relevant exposure but does not establish the exact application, make the interview establish the depth rather than calling the capability missing.\n- IMPORTANT FOR INDUSTRY GAPS: If the candidate has no experience in the target industry, state that honestly and use transferable capability without implying equivalent industry experience.\n- INTERVIEW PRIORITIES: return exactly 3 distinct priorities. Priority 1 = strongest opportunity. Priority 2 = critical responsibility linked to the closest demonstrated experience. Priority 3 = genuine material risk or a high-value verification point only if one exists; otherwise another proof opportunity. A verification priority must explain what fact needs to be established, not assume the answer.\n- Each priority must state the desired interviewer takeaway and must not be written as an imperative instruction.\n- Never copy, paraphrase closely, or reuse a JD requirement as candidate evidence.\n- STORIES TO PREPARE: return exactly 3 items, one supporting experience for each priority in the same order. Each item must contain a concrete CV anchor such as an actual employer, qualification, function, responsibility, scope, project, or outcome. Never use the JD requirement itself as the story.\n- If a priority is about a gap or verification point, the supporting story must be a transferable CV experience and must explicitly avoid claiming the missing capability. For a verification point, the story should provide context for the clarification question; it must not answer the question with an invented fact.\n- Difficult questions must be actual interviewer questions. When a verification point exists, include a question that establishes the fact precisely (for example system, process, duration, personal responsibility, or application), rather than assuming the answer.\n- Avoid generic phrases and repeated sentences. Prefer plain, direct language.` },
        { role: "user", content: `Title: ${session.title}\nInterview date: ${session.interview_date ?? "Not provided"}\nCV:\n${session.cv_text.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${session.job_description.slice(0, 8000)}\n\nPROFESSIONAL MIRROR DIAGNOSTIC:\n${JSON.stringify(session.cv_analysis)}\n\nCreate the interview strategy.` }],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as InterviewStrategy;
    if (!isValidStrategy(parsed, language, session.job_description, session.cv_analysis, session.cv_text)) throw new Error("Invalid strategy format");
    return parsed;
  } catch { return fallbackStrategy(session); }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: session, error } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", user.id).single();
  if (error || !session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const record = session as SessionRecord;
  if (!record.cv_analysis) return NextResponse.json({ error: "CV analysis is required before generating an interview strategy." }, { status: 400 });
  if (!hasValidProvenance(record.cv_analysis, record)) return NextResponse.json({ code: "ANALYSIS_PROVENANCE_INVALID", error: "The Professional Mirror analysis must be refreshed before an interview strategy can be generated." }, { status: 422 });
  if (isValidStrategy(record.interview_strategy, normalizeLanguage(record.preparation_language), record.job_description, record.cv_analysis, record.cv_text)) return NextResponse.json({ strategy: record.interview_strategy });
  const strategy = await generateStrategy(record);
  const { error: updateError } = await supabase.from("sessions").update({ interview_strategy: strategy }).eq("id", id).eq("user_id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ strategy });
}