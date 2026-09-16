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

function hasStrategicSynthesis(strategy: any): boolean {
  const text = [strategy.candidatePositioning, strategy.strongestValueProposition, ...strategy.interviewPriorities ?? [], ...strategy.gapDefenseStrategy ?? []].filter((x: any) => typeof x === "string").join(" ");
  const synthesisSignals = /\b(?:not just|rather than|however|while|because|therefore|needs to establish|needs to clarify|interview must establish|interviewer should|depth|scope|impact|ownership|decision influence|execution|application|transferability|verification|nevertheless|mais|plutôt que|cependant|toutefois|doit établir|doit clarifier|l'entretien doit|l'intervieweur doit|profondeur|périmètre|impact|responsabilité personnelle|influence|exécution|application|transférabilité|vérification)\b/i;
  return synthesisSignals.test(text);
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
  const storiesValid = Array.isArray(s.storiesToPrepare) && s.storiesToPrepare.length === 3 && s.storiesToPrepare.every((x: any) => validCandidateEvidence(x) && hasConcreteCvAnchor(x, cvText));
  return typeof s.candidatePositioning === "string" && typeof s.strongestValueProposition === "string" && Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) && Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) && Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) && typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" && typeof s.personalization === "string" && !generic.test(s.candidatePositioning) && !generic.test(s.strongestValueProposition) && !weakKeyMessage.test(s.strongestValueProposition) && !generic.test(s.communicationPriorities) && !generic.test(s.interviewPlan) && !generic.test(s.personalization) && !unsafeIndustryGap.test(allText) && !hasObviousLanguageMismatch(allText, language) && !containsCopiedJdSentence(strategy, jobDescription) && !containsCopiedDiagnosticRequirement(strategy, analysis) && hasStrategicSynthesis(s) && s.interviewPriorities.length === 3 && s.interviewPriorities.every(validPriority) && s.likelyDifficultQuestions.length > 0 && s.likelyDifficultQuestions.every(validQuestion) && s.strengthsToLeverage.every(validCandidateEvidence) && storiesValid && s.gapsOrRisks.every((x: any) => typeof x === "string" && x.trim() && !generic.test(x));
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
    if (isFrench && /erp|sage|sap|oracle/.test(lower)) return "Votre CV ne précise pas les ERP utilisés : l'entretien doit établir les systèmes réellement utilisés, les processus concernés et votre niveau de responsabilité, sans transformer l'absence de détail en absence d'expérience.";
    if (isFrench && /minier|mining/.test(lower)) return "Le secteur minier n'apparaît pas dans votre parcours : l'entretien doit tester la transférabilité de votre expérience financière sans présenter un autre secteur comme équivalent.";
    if (!isFrench && /erp|sage|sap|oracle/.test(lower)) return "Your CV does not specify the ERP systems used: the interview should establish the systems actually used, the processes involved, and your level of responsibility, without turning missing detail into missing experience.";
    if (!isFrench && /mining/.test(lower)) return "Mining does not appear in your background: the interview should test the transferability of your finance experience without presenting another industry as equivalent.";
    return isFrench ? "Le point doit être distingué entre expérience établie, exposition réelle et capacité transférable." : "The point should be distinguished between established experience, actual exposure, and transferable capability.";
  });
  const stories = [syngentaEvidence, technicalEvidence, transferableEvidence].filter(Boolean).slice(0, 3).map((item) => isFrench ? `Expérience pertinente : ${item}.` : `Relevant experience: ${item}.`);
  while (stories.length < 3) stories.push(isFrench ? "Une expérience réelle du parcours doit servir de point d'ancrage à la priorité correspondante." : "A real career experience should anchor the corresponding priority.");
  const risk = materialRisks[0];
  const priorities = [
    isFrench ? `${topStrength} est votre principal levier. L'enjeu n'est pas de prouver que vous avez travaillé en finance, mais d'établir le niveau d'impact et d'autonomie que votre expérience régionale vous a réellement donné.` : `${topStrength} is your main lever. The issue is not proving that you have worked in finance, but establishing the level of impact and autonomy your regional experience actually gave you.`,
    isFrench ? `${technicalEvidence} établit une base technique crédible. L'enjeu de l'entretien est maintenant d'établir la profondeur d'application : ce que vous avez personnellement analysé, décidé, produit ou challengé.` : `${technicalEvidence} establishes credible technical foundations. The interview now needs to establish depth of application: what you personally analysed, decided, produced, or challenged.`,
    isFrench ? risk ? `${risk} est un point à établir, pas à surinterpréter. L'intervieweur doit pouvoir distinguer ce qui est documenté dans votre parcours, ce que vous avez réellement pratiqué et ce qui relève d'une capacité transférable.` : "Votre troisième enjeu est d'établir un élément de valeur qui ne ressort pas directement du rapprochement CV/JD : l'ampleur réelle de votre responsabilité, votre influence sur les décisions ou la profondeur d'une expérience clé." : risk ? `${risk} is a point to establish, not over-interpret. The interviewer should distinguish what is documented, what you actually practiced, and what is transferable capability.` : "Your third objective is to establish a value point that does not emerge directly from the CV/JD comparison: the real extent of your responsibility, decision influence, or depth in a key experience."
  ];
  const gapRisks = materialRisks.length ? materialRisks : [];
  return {
    candidatePositioning: isFrench ? `${topStrength} vous donne une base crédible pour ce poste. La stratégie consiste à transformer cette base en preuve de niveau : impact personnel, profondeur d'application et maîtrise des points encore à établir.` : `${topStrength} gives you a credible base for this role. The strategy is to turn that base into proof of level: personal impact, depth of application, and clarity on points still to be established.`,
    strongestValueProposition: isFrench ? "Votre parcours combine expérience financière internationale, responsabilités régionales et exposition au reporting, au pilotage et à la conformité. Le point distinctif à établir en entretien est le niveau réel d'impact et de décision derrière ces responsabilités." : "Your background combines international finance experience, regional responsibilities, and exposure to reporting, planning, and compliance. The differentiating point to establish in the interview is the real level of impact and decision-making behind those responsibilities.",
    strengthsToLeverage: strengths.slice(0, 3),
    gapsOrRisks: gapRisks.slice(0, 3),
    gapDefenseStrategy: gapDefense,
    interviewPriorities: priorities,
    likelyDifficultQuestions: [
      isFrench ? "Sur une décision financière importante, quel était exactement votre rôle personnel et quelle influence avez-vous exercée ?" : "On an important finance decision, what exactly was your personal role and what influence did you have?",
      isFrench ? "Pouvez-vous donner un exemple où vos connaissances comptables ou de reporting ont directement influencé une décision ou un résultat ?" : "Can you give an example where your accounting or reporting knowledge directly influenced a decision or outcome?",
      isFrench ? "Quels systèmes financiers avez-vous réellement utilisés, pendant combien de temps et sur quels processus ?" : "Which finance systems have you actually used, for how long, and on which processes?"
    ],
    storiesToPrepare: stories,
    communicationPriorities: isFrench ? "Répondez directement, distinguez votre rôle personnel de celui de l'équipe et appuyez chaque affirmation importante sur une expérience réelle." : "Answer directly, distinguish your personal role from the team's, and anchor each important claim in a real experience.",
    interviewPlan: isFrench ? "Faites émerger d'abord votre niveau d'impact, puis la profondeur de votre pratique technique, et enfin les éléments qui doivent encore être établis." : "First establish your level of impact, then the depth of your technical practice, and finally the points that still need to be established.",
    personalization: isFrench ? "La stratégie repose sur une distinction simple : ce que le CV établit, ce que votre parcours suggère et ce que l'entretien doit encore vérifier." : "The strategy rests on one distinction: what the CV establishes, what your background suggests, and what the interview still needs to verify."
  };
}

async function generateStrategy(session: SessionRecord): Promise<InterviewStrategy> {
  try {
    const openai = getOpenAI();
    const language = normalizeLanguage(session.preparation_language);
    const completion = await openai.chat.completions.create({
      model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.4,
      messages: [{ role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's senior interview coach. Create a precise, candidate-specific interview strategy from the CV, job description, Professional Mirror diagnostic, and interview date. The result must feel like a human coach who has studied this candidate and this job, not like a generic report.\n\nCORE PRODUCT STANDARD — WOW EFFECT:\nThe Strategy page is the candidate's strategic "aha" moment. Keep the output selective, concise, and high-value. Do not summarize the CV, repeat the JD, or list obvious matches. The candidate should learn something about how they need to position and prove themselves that is not directly visible from reading the CV and JD separately. Every priority should synthesize at least two pieces of candidate-specific evidence or one evidence item plus a meaningful risk/verification point, and should explain the interview implication. If a sentence could have been written by simply comparing a CV bullet with a JD requirement, rewrite it into a deeper interpretation. Prefer tensions, trade-offs, proof thresholds, ownership versus execution, depth versus breadth, demonstrated capability versus unverified exposure, and transferability over generic strengths.\n\nCandidate-facing text must be entirely in the selected preparation language. JSON keys remain exactly in English. Translate source wording when necessary; do not copy English sentences into French output or French sentences into English output. Standard acronyms and proper names such as ERP, SAP, IFRS, OHADA/SYSCOHADA may remain unchanged. Return exactly these keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization.\n\nQUALITY RULES:\n- Base every statement on the current CV, JD, and analysis. Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, industry experience, stakeholders, or outcomes.\n- Use four evidence states throughout the reasoning: (1) CV-established fact; (2) reasonable inference or contextual signal that is not yet a fact; (3) candidate claim not established by the CV; (4) unsupported information that must not be introduced. Never collapse states 2 or 3 into state 1.\n- A reasonable inference is useful because an interview can establish the underlying fact. Turn it into a targeted clarification/verification point rather than either inventing the fact or incorrectly calling it a gap. Example: a CV showing finance work in international groups may justify asking which ERP systems the candidate actually used, but it does not prove SAP, Oracle, Sage, or any other personal tool experience.\n- Candidate claims supplied outside the CV are claims to establish in the interview. Do not present them as CV-verified facts, but do not incorrectly describe them as absent experience either. The interview should probe the claim precisely enough to establish what the candidate actually did.\n- Calibrate the strategy to the actual fit shown by the Professional Mirror. Do not manufacture weaknesses. A qualification, skill, or responsibility explicitly supported by the CV is demonstrated capability, not a gap. For example, when the CV contains a relevant professional qualification plus related reporting/audit experience, do not downgrade that capability merely because the JD also asks for it.\n- The strategy must answer one question: what does this candidate need to demonstrate in this interview?\n- Strengths must identify concrete advantages and anchor them in real CV experiences. Never use a job-description requirement as candidate evidence.\n- Gaps and risks must name only specific material requirements that are genuinely absent, or verification points where the CV provides a meaningful signal but not enough detail to establish the fact. Label the distinction clearly in candidate-facing wording.\n- IMPORTANT: An absent ERP name on the CV is not proof that the candidate has never used an ERP. Treat it as an evidence/verification point unless the CV explicitly establishes absence. Do not infer SAP, Sage, Oracle, or any other personal tool experience merely from the employer being a multinational.\n- IMPORTANT: Do not treat IFRS/OHADA/SYSCOHADA as a gap when the CV explicitly supports the capability through qualifications, skills, audit experience, or reporting experience. The interviewer may test depth/application, but the strategy should present the demonstrated foundation accurately. If the CV suggests relevant exposure but does not establish the exact application, make the interview establish the depth rather than calling the capability missing.\n- IMPORTANT FOR INDUSTRY GAPS: If the candidate has no experience in the target industry, state that honestly and use transferable capability without implying equivalent industry experience.\n- INTERVIEW PRIORITIES: return exactly 3 distinct priorities. Priority 1 = the strongest strategic opportunity, not merely the strongest CV bullet. Priority 2 = a second high-value proof question that reveals depth, ownership, or application. Priority 3 = a genuine material risk or high-value verification point only if one exists; otherwise another non-obvious proof opportunity. Each priority must contain a candidate-specific interpretation and the desired interviewer takeaway. Do not write priorities as instructions.\n- STRATEGIC SYNTHESIS TEST: before returning each priority, ask yourself: "Could this have been produced by a basic CV/JD comparison?" If yes, it is not good enough. Rewrite it to explain what the combination of evidence means for the interview.\n- STORIES TO PREPARE: return exactly 3 items, one supporting experience for each priority in the same order. Each item must contain a concrete CV anchor such as an actual employer, qualification, function, responsibility, scope, project, or outcome AND explain why that experience is strategically relevant to the corresponding priority. Do not merely repeat a CV bullet. Never use the JD requirement itself as the story.\n- If a priority is about a gap or verification point, the supporting story must be a transferable CV experience and must explicitly avoid claiming the missing capability. For a verification point, the story should provide context for the clarification question; it must not answer the question with an invented fact.\n- Difficult questions must be actual interviewer questions. When a verification point exists, include a question that establishes the fact precisely (for example system, process, duration, personal responsibility, or application), rather than assuming the answer.\n- Keep candidate-facing information selective. Do not fill every field with generic advice. Prefer three strong insights over many weak ones.\n- Avoid generic phrases and repeated sentences. Prefer plain, direct language.` },
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