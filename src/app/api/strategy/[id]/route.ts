import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStrategy, SessionRecord, CvAnalysis } from "@/types";

function canonicalize(value: string): string { return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value: string): string { return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`; }
function parseAnalysis(value: unknown): CvAnalysis | null { if (typeof value === "string") { try { return JSON.parse(value) as CvAnalysis; } catch { return null; } } return value && typeof value === "object" ? value as CvAnalysis : null; }
function hasValidProvenance(value: unknown, session: SessionRecord): boolean { const a = parseAnalysis(value); const p = a?.provenance; return Boolean(p && p.contract_version === "v5.1" && p.preparation_language === session.preparation_language && p.cv_content_hash === hash(session.cv_text) && p.jd_content_hash === hash(session.job_description)); }
function isValidStrategy(strategy: unknown): strategy is InterviewStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any;
  const generic = /\b(clear professional story|parcours professionnel clair|experience in line with|expérience en lien avec|elements importants|éléments importants|prepare examples|prepare simple examples|préparez des exemples|be ready|show your|connect your experience|reliez votre expérience|based on the cv|à partir du cv)\b/i;
  return typeof s.candidatePositioning === "string" && typeof s.strongestValueProposition === "string" && Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) && Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) && Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) && typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" && typeof s.personalization === "string" && !generic.test(s.candidatePositioning) && !generic.test(s.strongestValueProposition) && !generic.test(s.communicationPriorities) && !generic.test(s.interviewPlan) && !generic.test(s.personalization) && [...s.strengthsToLeverage, ...s.gapsOrRisks, ...s.gapDefenseStrategy, ...s.interviewPriorities, ...s.likelyDifficultQuestions, ...s.storiesToPrepare].every((x: any) => typeof x === "string" && x.trim() && !generic.test(x));
}

function fallbackStrategy(session: SessionRecord): InterviewStrategy {
  const language = normalizeLanguage(session.preparation_language);
  const strengths = session.cv_analysis?.strengths ?? [];
  const gaps = session.cv_analysis?.gaps ?? [];
  const keywords = session.cv_analysis?.keywordAlignment ?? [];
  const focusAreas = session.cv_analysis?.suggestedFocusAreas ?? [];
  const evidenceChain = session.cv_analysis?.evidenceChain ?? [];
  const topStrength = strengths[0] ?? "your strongest documented experience";
  const topGap = gaps[0] ?? "the requirements your CV does not clearly demonstrate";
  const topFocus = focusAreas.slice(0, 3).join("; ") || "the role's most important requirements";
  const isFrench = language === "fr";
  const timing = session.interview_date
    ? isFrench ? `Votre entretien est prévu le ${new Date(session.interview_date).toLocaleDateString("fr-FR")}. Priorisez les points les plus importants avant cette date.` : `Your interview is scheduled for ${new Date(session.interview_date).toLocaleDateString()}. Prioritize the most important preparation before then.`
    : isFrench ? "Commencez par les points les plus importants pour le poste." : "Start with the points that matter most for the role.";
  const groundedStories = evidenceChain.slice(0, 5).map((item) => {
    if (item.cv_evidence && item.cv_evidence !== "NO CV EVIDENCE FOUND") {
      return isFrench
        ? `Préparez une histoire sur « ${item.jd_requirement} » en partant de cette preuve de votre CV : ${item.cv_evidence}. Expliquez le contexte, votre rôle et le résultat.`
        : `Prepare a story about “${item.jd_requirement}” using this CV evidence: ${item.cv_evidence}. Explain the context, your role, and the result.`;
    }
    return isFrench
      ? `Préparez une réponse honnête sur « ${item.jd_requirement} ». Expliquez ce qui vous manque et l'expérience la plus proche que vous pouvez réellement démontrer.`
      : `Prepare an honest answer about “${item.jd_requirement}”. Explain what is missing and the closest experience you can genuinely demonstrate.`;
  });
  return {
    candidatePositioning: isFrench ? `Votre meilleur angle est ${topStrength}. Présentez cette expérience comme la preuve de ce que vous pouvez apporter au poste, puis soyez clair sur ${topGap.toLowerCase()}.` : `Your strongest angle is ${topStrength}. Use that experience to show what you can bring to the role, then be clear about ${topGap.toLowerCase()}.`,
    strongestValueProposition: isFrench ? `Votre message central : partez de ${topStrength}, puis montrez concrètement comment cette expérience répond aux priorités du poste.` : `Your core message: start with ${topStrength}, then show specifically how that experience meets the role's priorities.`,
    strengthsToLeverage: strengths.slice(0, 5), gapsOrRisks: gaps.slice(0, 5),
    gapDefenseStrategy: gaps.slice(0, 5).map((gap) => isFrench ? `Si l'on vous interroge sur « ${gap} », ne prétendez pas avoir une expérience que votre CV ne démontre pas. Présentez l'expérience la plus proche et expliquez comment vous combleriez l'écart.` : `If asked about “${gap}”, do not claim experience your CV does not demonstrate. Give the closest relevant experience and explain how you would close the gap.`),
    interviewPriorities: [isFrench ? `Prouvez ${topStrength} avec un exemple concret.` : `Prove ${topStrength} with a concrete example.`, isFrench ? `Préparez une réponse solide sur ${topGap}.` : `Prepare a strong answer on ${topGap}.`, isFrench ? `Travaillez les priorités suivantes : ${topFocus}.` : `Work on these priorities: ${topFocus}.`, timing],
    likelyDifficultQuestions: [isFrench ? `Quelle expérience avez-vous qui répond à « ${topGap} » ?` : `What experience do you have that addresses “${topGap}”?`, isFrench ? `Donnez-moi un exemple concret de votre capacité sur ${topFocus}.` : `Give me a concrete example of your ability in ${topFocus}.`],
    storiesToPrepare: groundedStories,
    communicationPriorities: isFrench ? "Répondez d'abord à la question. Dites clairement ce que vous avez fait personnellement, puis donnez le résultat. N'ajoutez pas de faits que votre expérience ne permet pas de prouver." : "Answer the question first. Say clearly what you personally did, then give the result. Do not add facts your experience cannot support.",
    interviewPlan: isFrench ? `Commencez par votre meilleur argument, utilisez ensuite vos preuves les plus fortes, puis traitez franchement les écarts importants. Terminez chaque exemple par le résultat. ${timing}` : `Start with your strongest argument, use your best evidence, then address the important gaps honestly. End each example with the result. ${timing}`,
    personalization: isFrench ? "Restez fidèle à votre CV et à cette offre. Chaque exemple doit venir de votre expérience réelle et répondre à un besoin précis du poste." : "Stay faithful to your CV and this job description. Every example should come from your real experience and answer a specific need of the role."
  };
}

async function generateStrategy(session: SessionRecord): Promise<InterviewStrategy> {
  try {
    const openai = getOpenAI();
    const language = normalizeLanguage(session.preparation_language);
    const completion = await openai.chat.completions.create({
      model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.4,
      messages: [{ role: "system", content: `${languageInstruction(language)}\n\nYou are Interview Mirror's senior interview coach. Create a precise, candidate-specific interview strategy from the CV, job description, Professional Mirror diagnostic, and interview date. The result must feel like a human coach who has studied this candidate and this job, not like a generic report.\n\nCandidate-facing text must be entirely in the selected preparation language. JSON keys remain exactly in English. Return exactly these keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization.\n\nQUALITY RULES:\n- Base every statement on the current CV, JD, and analysis. Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, industry experience, stakeholders, or outcomes.\n- Calibrate the strategy to the actual fit shown by the Professional Mirror. Do not manufacture weaknesses just to fill the gaps section. If the candidate is a strong or near-perfect match, focus on proving depth, impact, leadership, and role-specific value. If there is a genuine partial fit or gap, focus on transferable capability and honest gap handling.\n- The strategy must answer one question: what does this candidate need to demonstrate in this interview?\n- Candidate positioning must tell the candidate exactly how to present their profile for this role, including the main strength and any material credibility risk.\n- Strongest value proposition must be a short, memorable message the candidate could actually use in an interview.\n- Strengths must identify concrete advantages, not say that the CV is relevant.\n- Gaps and risks must name only specific, material requirements that could be challenged.\n- Gap defense must tell the candidate what to say and what NOT to claim.\n- IMPORTANT FOR INDUSTRY GAPS: If the candidate has no experience in the target industry, never tell them to create an analogy, imply equivalent industry experience, or make a similar sector sound like the target sector. Instead, tell them to demonstrate the transferable capability they genuinely have and explain how they would apply it in the target environment.\n- Interview priorities must be ranked by likely interview impact, not by keyword frequency. Each priority should describe something the interviewer needs to believe or something the candidate must demonstrate, not a research or to-do task.\n- Difficult questions must be realistic questions an interviewer could ask because of the JD, the candidate's gaps, or the candidate's strongest claims.\n- Stories to prepare must point to specific CV experiences and explain what the candidate should prove with each story. Do not invent stories.\n- Communication priorities must be short, practical instructions for answering.\n- Interview plan must explain the recommended order of preparation and how to handle strengths and gaps.\n- Personalization must state the rules that should govern the candidate's answers for this specific interview.\n- Avoid generic phrases such as 'clear professional story', 'your experience is relevant', 'prepare examples', 'be ready', 'show your strengths', 'connect your experience', or 'based on your CV'. Avoid repeating the same sentence with different labels.\n- Prefer plain, direct language. The candidate should understand every sentence immediately.` },
        { role: "user", content: `Title: ${session.title}\nInterview date: ${session.interview_date ?? "Not provided"}\nCV:\n${session.cv_text.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${session.job_description.slice(0, 8000)}\n\nPROFESSIONAL MIRROR DIAGNOSTIC:\n${JSON.stringify(session.cv_analysis)}\n\nCreate the interview strategy.` }],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as InterviewStrategy;
    if (!isValidStrategy(parsed)) throw new Error("Invalid strategy format");
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
  if (isValidStrategy(record.interview_strategy)) return NextResponse.json({ strategy: record.interview_strategy });
  const strategy = await generateStrategy(record);
  const { error: updateError } = await supabase.from("sessions").update({ interview_strategy: strategy }).eq("id", id).eq("user_id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ strategy });
}
