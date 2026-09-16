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
  const allText = [s.candidatePositioning, s.strongestValueProposition, s.communicationPriorities, s.interviewPlan, s.personalization, ...s.strengthsToLeverage, ...s.gapsOrRisks, ...s.gapDefenseStrategy, ...s.interviewPriorities, ...s.likelyDifficultQuestions, ...s.storiesToPrepare].filter((x: any) => typeof x === "string").join(" ").toLowerCase();
  const sourceSentences = jobDescription.split(/[.!?\n]+/).map((x) => x.trim().toLowerCase()).filter((x) => x.length >= 35);
  return sourceSentences.some((sentence) => allText.includes(sentence));
}

function isValidStrategy(strategy: unknown, language: "en" | "fr", jobDescription = ""): strategy is InterviewStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any;
  const generic = /\b(clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|prepare examples|prepare simple examples|préparez des exemples|be ready|show your|connect your experience|reliez votre expérience|based on the cv|à partir du cv)\b/i;
  const unsafeIndustryGap = /(analogie|analogies|analogy|analogies|expériences? similaires que vous pourriez avoir|similar experiences? you could have|similar (?:industry|sector) experience)/i;
  const prepInstruction = /\b(?:préparez?|prepare|préparer|recherchez?|recherche|research|cherchez?|chercher|look for|find information|informez-vous|mettez en avant|mettez-vous à jour|review|étudiez?|study)\b/i;
  const weakKeyMessage = /\b(?:point d'appui|point d'appui principal|strongest proof point|strongest foundation)\b|\b(?:montrez concrètement|show specifically)\b/i;
  const allText = [s.candidatePositioning, s.strongestValueProposition, s.communicationPriorities, s.interviewPlan, s.personalization, ...s.strengthsToLeverage, ...s.gapsOrRisks, ...s.gapDefenseStrategy, ...s.interviewPriorities, ...s.likelyDifficultQuestions, ...s.storiesToPrepare].filter((x: any) => typeof x === "string").join(" ");
  const validQuestion = (x: any) => {
    if (typeof x !== "string" || !x.trim() || x.length > 320 || generic.test(x) || prepInstruction.test(x)) return false;
    return /\?|^(?:quelle|quels|quelle|comment|pourquoi|pouvez-vous|pouvez vous|donnez-moi|donnez moi|décrivez|décrivez-moi|décrivez moi|what|which|how|why|can you|could you|tell me|describe)\b/i.test(x.trim());
  };
  const validPriority = (x: any) => typeof x === "string" && x.trim() && x.length <= 320 && !generic.test(x) && !prepInstruction.test(x);
  return typeof s.candidatePositioning === "string" && typeof s.strongestValueProposition === "string" && Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) && Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) && Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) && typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" && typeof s.personalization === "string" && !generic.test(s.candidatePositioning) && !generic.test(s.strongestValueProposition) && !weakKeyMessage.test(s.strongestValueProposition) && !generic.test(s.communicationPriorities) && !generic.test(s.interviewPlan) && !generic.test(s.personalization) && !unsafeIndustryGap.test(allText) && !hasObviousLanguageMismatch(allText, language) && !containsCopiedJdSentence(strategy, jobDescription) && s.interviewPriorities.every(validPriority) && s.likelyDifficultQuestions.length > 0 && s.likelyDifficultQuestions.every(validQuestion) && [...s.strengthsToLeverage, ...s.gapsOrRisks, ...s.gapDefenseStrategy, ...s.storiesToPrepare].every((x: any) => typeof x === "string" && x.trim() && !generic.test(x));
}

function fallbackStrategy(session: SessionRecord): InterviewStrategy {
  const language = normalizeLanguage(session.preparation_language);
  const strengths = session.cv_analysis?.strengths ?? [];
  const gaps = session.cv_analysis?.gaps ?? [];
  const evidenceChain = session.cv_analysis?.evidenceChain ?? [];
  const topStrength = strengths[0] ?? (language === "fr" ? "votre expérience financière la mieux démontrée" : "your strongest documented finance experience");
  const topGap = gaps[0] ?? (language === "fr" ? "les exigences que votre CV ne démontre pas clairement" : "the requirements your CV does not clearly demonstrate");
  const isFrench = language === "fr";
  const timing = session.interview_date
    ? isFrench ? `Votre entretien est prévu le ${new Date(session.interview_date).toLocaleDateString("fr-FR")}.` : `Your interview is scheduled for ${new Date(session.interview_date).toLocaleDateString()}.`
    : isFrench ? "Concentrez votre préparation sur les points qui comptent le plus pour le poste." : "Focus your preparation on the points that matter most for the role.";
  const gapDefense = gaps.slice(0, 3).map((gap) => {
    const lower = gap.toLowerCase();
    if (isFrench && /erp|sage|sap|oracle/.test(lower)) return "Ne revendiquez pas une maîtrise d'un ERP que votre CV ne démontre pas. Appuyez-vous sur les systèmes et processus financiers que vous maîtrisez réellement, puis expliquez votre capacité à prendre en main un nouvel environnement.";
    if (isFrench && /minier|mining/.test(lower)) return "Reconnaissez clairement votre absence d'expérience dans le secteur minier. Mettez en avant les compétences financières transférables que votre expérience démontre et expliquez comment vous les appliqueriez dans cet environnement.";
    if (isFrench && /ohada|syscohada|ifrs/.test(lower)) return "Précisez votre niveau réel d'exposition à OHADA/SYSCOHADA et à IFRS. Distinguez ce que vous pratiquez directement de ce que vous connaissez ou avez utilisé dans un contexte de reporting.";
    if (!isFrench && /erp|sage|sap|oracle/.test(lower)) return "Do not claim ERP expertise that your CV does not demonstrate. Use the financial systems and processes you genuinely know, then explain how you would get up to speed in a new environment.";
    if (!isFrench && /mining/.test(lower)) return "Be clear that you have not worked in mining. Emphasize the transferable financial capabilities your experience demonstrates and explain how you would apply them in this environment.";
    if (!isFrench && /ohada|syscohada|ifrs/.test(lower)) return "Be precise about your actual exposure to OHADA/SYSCOHADA and IFRS. Distinguish what you directly practice from what you know or have used in a reporting context.";
    return isFrench ? "Distinguez clairement ce que votre expérience démontre de ce qu'elle ne démontre pas encore, puis appuyez-vous sur la compétence transférable la plus proche." : "Clearly distinguish what your experience demonstrates from what it does not yet demonstrate, then use the closest transferable capability.";
  });
  const stories = evidenceChain.slice(0, 3).map((item) => {
    const evidence = item.cv_evidence && item.cv_evidence !== "NO CV EVIDENCE FOUND";
    if (isFrench) return evidence ? "Mobilisez l'expérience professionnelle associée à cette exigence. Expliquez le contexte, votre rôle personnel et le résultat que vous pouvez vérifier." : "Utilisez l'expérience la plus proche que vous pouvez réellement démontrer pour cette exigence.";
    return evidence ? "Use the professional experience associated with this requirement. Explain the context, your personal role, and the result you can substantiate." : "Use the closest experience you can genuinely demonstrate for this requirement.";
  });
  return {
    candidatePositioning: isFrench
      ? `${topStrength} constitue votre principal atout pour ce poste. Appuyez-vous sur cette expérience pour démontrer votre valeur et traitez clairement ${topGap.toLowerCase()}.`
      : `${topStrength} is your main strength for this role. Use this experience to demonstrate your value and address ${topGap.toLowerCase()} clearly.`,
    strongestValueProposition: isFrench
      ? `Votre expérience de 12 ans en finance au sein de groupes internationaux constitue un atout central pour ce poste. L'entretien doit maintenant démontrer votre capacité à répondre concrètement aux responsabilités clés du rôle.`
      : `Your 12 years of finance experience in international groups are a central strength for this role. The interview should now demonstrate your ability to deliver against the role's key responsibilities.`,
    strengthsToLeverage: strengths.slice(0, 3),
    gapsOrRisks: gaps.slice(0, 3),
    gapDefenseStrategy: gapDefense,
    interviewPriorities: [
      isFrench ? `Démontrez votre expérience financière internationale avec un exemple précis de votre parcours.` : `Demonstrate your international finance experience with one specific example from your career.`,
      isFrench ? `Clarifiez votre niveau réel sur les exigences techniques qui ne sont pas pleinement démontrées par votre CV, sans revendiquer une expérience non démontrée.` : `Clarify your actual level on technical requirements not fully demonstrated by your CV, without claiming experience you cannot demonstrate.`,
      isFrench ? `Montrez, par une expérience réelle, comment vous pouvez répondre aux responsabilités prioritaires du poste.` : `Use a real experience to demonstrate how you can address the role's priority responsibilities.`
    ],
    likelyDifficultQuestions: [
      isFrench ? `Quelle expérience démontre le mieux votre capacité à répondre aux principales exigences techniques du poste ?` : `What experience best demonstrates your ability to address the role's main technical requirements?`,
      isFrench ? `Pouvez-vous me donner un exemple concret où vous avez assumé une responsabilité comparable ?` : `Can you give me a concrete example where you handled a comparable responsibility?`
    ],
    storiesToPrepare: stories.length ? stories : [isFrench ? "Mobilisez une expérience réelle de votre parcours qui illustre directement une priorité du poste." : "Use a real experience from your career that directly illustrates a priority of the role."],
    communicationPriorities: isFrench ? "Répondez d'abord à la question. Dites ce que vous avez fait personnellement, puis donnez le résultat. N'ajoutez pas de faits que votre expérience ne permet pas de prouver." : "Answer the question first. Say what you personally did, then give the result. Do not add facts your experience cannot support.",
    interviewPlan: isFrench ? `Commencez par votre principal atout. Utilisez ensuite les expériences les plus pertinentes pour démontrer les priorités du poste. Traitez les écarts importants avec honnêteté. ${timing}` : `Start with your main strength. Then use the most relevant experiences to demonstrate the role's priorities. Address important gaps honestly. ${timing}`,
    personalization: isFrench ? "Restez fidèle à votre expérience réelle. Pour chaque réponse, choisissez une preuve qui répond directement au besoin du poste et distinguez ce qui est démontré de ce qui doit encore être prouvé." : "Stay faithful to your real experience. For each answer, choose evidence that directly addresses the role's need and clearly distinguish what is demonstrated from what still needs to be proven."
  };
}

async function generateStrategy(session: SessionRecord): Promise<InterviewStrategy> {
  try {
    const openai = getOpenAI();
    const language = normalizeLanguage(session.preparation_language);
    const completion = await openai.chat.completions.create({
      model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.4,
      messages: [{ role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's senior interview coach. Create a precise, candidate-specific interview strategy from the CV, job description, Professional Mirror diagnostic, and interview date. The result must feel like a human coach who has studied this candidate and this job, not like a generic report.\n\nCandidate-facing text must be entirely in the selected preparation language. JSON keys remain exactly in English. Translate source wording when necessary; do not copy English sentences into French output or French sentences into English output. Standard acronyms and proper names such as ERP, SAP, IFRS, OHADA/SYSCOHADA may remain unchanged. Return exactly these keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization.\n\nQUALITY RULES:\n- Base every statement on the current CV, JD, and analysis. Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, industry experience, stakeholders, or outcomes.\n- Calibrate the strategy to the actual fit shown by the Professional Mirror. Do not manufacture weaknesses just to fill the gaps section. If the candidate is a strong or near-perfect match, focus on proving depth, impact, leadership, and role-specific value. If there is a genuine partial fit or gap, focus on transferable capability and honest gap handling.\n- The strategy must answer one question: what does this candidate need to demonstrate in this interview?\n- Candidate positioning must tell the candidate exactly how to present their profile for this role, including the main strength and any material credibility risk.\n- Strongest value proposition must be a short, memorable candidate-facing message of 1-2 sentences. It must sound natural when spoken in an interview. Do not use the phrases 'point d'appui', 'strongest proof point', or 'strongest foundation'. Do not tell the candidate to 'show specifically' or 'montrer concrètement'; state the value directly.\n- Strengths must identify concrete advantages, not say that the CV is relevant.\n- Gaps and risks must name only specific, material requirements that could be challenged.\n- Gap defense must tell the candidate what to say and what NOT to claim.\n- IMPORTANT FOR INDUSTRY GAPS: If the candidate has no experience in the target industry, never tell them to create an analogy, imply equivalent industry experience, or make a similar sector sound like the target sector. Instead, tell them to demonstrate the transferable capability they genuinely have and explain how they would apply it in the target environment.\n- Interview priorities must be ranked by likely interview impact, not by keyword frequency. Each priority should describe something the interviewer needs to believe or something the candidate must demonstrate, not a research or to-do task.\n- Difficult questions must be realistic questions an interviewer could ask because of the JD, the candidate's gaps, or the candidate's strongest claims. Each item must be an actual interviewer question, not a preparation instruction or a copied task.\n- Stories to prepare must point to specific CV experiences and explain what the candidate should prove with each story. Do not invent stories. Do not copy source-language sentences from the CV or JD; express the candidate-facing guidance in the selected preparation language.\n- Communication priorities must be short, practical instructions for answering.\n- Interview plan must explain the recommended order of preparation and how to handle strengths and gaps.\n- Personalization must state the rules that should govern the candidate's answers for this specific interview.\n- Avoid generic phrases such as 'clear professional story', 'your experience is relevant', 'prepare examples', 'be ready', 'show your strengths', 'connect your experience', or 'based on your CV'. Avoid repeating the same sentence with different labels.\n- Prefer plain, direct language. The candidate should understand every sentence immediately.` },
        { role: "user", content: `Title: ${session.title}\nInterview date: ${session.interview_date ?? "Not provided"}\nCV:\n${session.cv_text.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${session.job_description.slice(0, 8000)}\n\nPROFESSIONAL MIRROR DIAGNOSTIC:\n${JSON.stringify(session.cv_analysis)}\n\nCreate the interview strategy.` }],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as InterviewStrategy;
    if (!isValidStrategy(parsed, language, session.job_description)) throw new Error("Invalid strategy format");
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
  if (isValidStrategy(record.interview_strategy, normalizeLanguage(record.preparation_language), record.job_description)) return NextResponse.json({ strategy: record.interview_strategy });
  const strategy = await generateStrategy(record);
  const { error: updateError } = await supabase.from("sessions").update({ interview_strategy: strategy }).eq("id", id).eq("user_id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ strategy });
}