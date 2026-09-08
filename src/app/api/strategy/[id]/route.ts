import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStrategy, SessionRecord } from "@/types";

function isValidStrategy(strategy: unknown): strategy is InterviewStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const s = strategy as any;
  return typeof s.candidatePositioning === "string" &&
    typeof s.strongestValueProposition === "string" &&
    Array.isArray(s.strengthsToLeverage) && Array.isArray(s.gapsOrRisks) &&
    Array.isArray(s.gapDefenseStrategy) && Array.isArray(s.interviewPriorities) &&
    Array.isArray(s.likelyDifficultQuestions) && Array.isArray(s.storiesToPrepare) &&
    typeof s.communicationPriorities === "string" && typeof s.interviewPlan === "string" &&
    typeof s.personalization === "string";
}

function fallbackStrategy(session: SessionRecord): InterviewStrategy {
  const language = normalizeLanguage(session.preparation_language);
  const strengths = session.cv_analysis?.strengths ?? [];
  const gaps = session.cv_analysis?.gaps ?? [];
  const keywords = session.cv_analysis?.keywordAlignment ?? [];
  const focusAreas = session.cv_analysis?.suggestedFocusAreas ?? [];
  const evidenceChain = session.cv_analysis?.evidenceChain ?? [];
  const topStrength = strengths[0] ?? "relevant experience";
  const topGap = gaps[0] ?? "areas where your evidence is less explicit";
  const topFocus = focusAreas.slice(0, 3).join("; ") || "the role's key requirements";
  const isFrench = language === "fr";
  const timing = session.interview_date
    ? isFrench ? `Votre entretien est prévu le ${new Date(session.interview_date).toLocaleDateString("fr-FR")}; commencez par les éléments de préparation les plus importants.` : `Your interview is scheduled for ${new Date(session.interview_date).toLocaleDateString()}, so prioritize the most important preparation items first.`
    : isFrench ? "Commencez par les éléments de préparation les plus importants." : "Prioritize the most important preparation items first.";
  const groundedStories = evidenceChain.slice(0, 5).map((item) => {
    if (item.cv_evidence && item.cv_evidence !== "NO CV EVIDENCE FOUND") {
      return isFrench
        ? `Pour l'exigence « ${item.jd_requirement} », appuyez-vous sur cette preuve de votre CV : ${item.cv_evidence}. Expliquez ensuite votre action et le résultat démontrable.`
        : `For the requirement “${item.jd_requirement}”, use this CV evidence: ${item.cv_evidence}. Then explain your action and the demonstrable result.`;
    }
    return isFrench
      ? `Pour l'exigence « ${item.jd_requirement} », n'inventez pas d'expérience : préparez une réponse claire sur ce qui vous manque et sur la manière dont vous pourriez combler cet écart.`
      : `For the requirement “${item.jd_requirement}”, do not invent experience: prepare a clear response about what is missing and how you would close the gap.`;
  });
  return {
    candidatePositioning: isFrench ? `Présentez-vous comme une personne qui apporte ${topStrength}. Concentrez votre discours sur les preuves de votre CV et leur utilité pour les priorités du poste : ${topFocus}.` : `Present yourself as someone who brings ${topStrength}. Keep your story focused on the evidence in your CV and how it can help with the role's priorities: ${topFocus}.`,
    strongestValueProposition: isFrench ? `Votre message le plus fort est l'association de ${topStrength} et des résultats que vous pouvez démontrer. Reliez directement cette expérience aux besoins du poste.` : `Your strongest message is the combination of ${topStrength} and the results you can demonstrate. Connect that experience directly to what this role needs.`,
    strengthsToLeverage: strengths.slice(0, 5), gapsOrRisks: gaps.slice(0, 5),
    gapDefenseStrategy: gaps.slice(0, 5).map((gap) => isFrench ? `Si l'on vous interroge sur ${gap.toLowerCase()}, soyez honnête sur cet écart, puis expliquez l'expérience la plus proche que vous avez et comment vous combleriez le reste.` : `If asked about ${gap.toLowerCase()}, be honest about the gap, then explain the closest experience you do have and how you would close the remaining gap.`),
    interviewPriorities: [isFrench ? `Montrez des preuves claires de ${topStrength}.` : `Show clear evidence of ${topStrength}.`, isFrench ? `Préparez un exemple honnête pour répondre à ${topGap}.` : `Prepare an honest example to address ${topGap}.`, isFrench ? `Reliez votre expérience aux exigences soutenues par les preuves : ${keywords.join(", ")}.` : `Connect your experience to requirements supported by the evidence: ${keywords.join(", ")}.`, timing],
    likelyDifficultQuestions: [isFrench ? `Quelle expérience avez-vous pour répondre à ${topGap.toLowerCase()} ?` : `What experience do you have that addresses ${topGap.toLowerCase()}?`, isFrench ? `Parlez-moi d'un exemple qui démontre votre capacité en ${topFocus}.` : `Tell me about an example that demonstrates your ability in ${topFocus}.`],
    storiesToPrepare: groundedStories,
    communicationPriorities: isFrench ? "Soyez clair et concis. Commencez par l'idée principale, expliquez ce que vous avez fait personnellement et terminez par le résultat. Utilisez uniquement des exemples que votre expérience permet d'étayer." : "Be clear and concise. Start with the main point, explain what you personally did, and finish with the result. Use only examples you can support with your experience.",
    interviewPlan: isFrench ? `Commencez par une courte présentation, appuyez-vous sur vos preuves les plus fortes, abordez honnêtement les écarts importants et reliez vos exemples aux priorités du poste. ${timing}` : `Start with a short introduction, lead with your strongest evidence, address important gaps honestly, and connect your examples to the role's priorities. ${timing}`,
    personalization: isFrench ? "Ancrez vos réponses dans votre CV et cette offre. Utilisez les preuves les plus pertinentes et soyez transparent lorsque votre expérience est moins directe." : "Keep your answers grounded in your CV and this job description. Use the strongest matching evidence and be transparent where your experience is less direct.",
  };
}

async function generateStrategy(session: SessionRecord): Promise<InterviewStrategy> {
  try {
    const openai = getOpenAI();
    const language = normalizeLanguage(session.preparation_language);
    const completion = await openai.chat.completions.create({
      model: AI_MODEL, response_format: { type: "json_object" }, temperature: 0.4,
      messages: [{ role: "system", content: `${languageInstruction(language)}

You are Interview Mirror's interview coach. Create a concise, candidate-specific interview game plan from the CV, job description, analysis, and interview date.
Use only information in the supplied sources. Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, or outcomes. Make every recommendation traceable to the CV or JD. When evidence is missing, say what the candidate should clarify rather than creating a story.

Return exactly these keys: candidatePositioning, strongestValueProposition, strengthsToLeverage, gapsOrRisks, gapDefenseStrategy, interviewPriorities, likelyDifficultQuestions, storiesToPrepare, communicationPriorities, interviewPlan, personalization. Candidate-facing text must be entirely in the selected preparation language.`, },
        { role: "user", content: `Title: ${session.title}
Interview date: ${session.interview_date ?? "Not provided"}
CV:\n${session.cv_text.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${session.job_description.slice(0, 8000)}\n\nANALYSIS:\n${JSON.stringify(session.cv_analysis)}\n\nCreate the interview game plan.` }],
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
  if (isValidStrategy(record.interview_strategy)) return NextResponse.json({ strategy: record.interview_strategy });
  const strategy = await generateStrategy(record);
  const { error: updateError } = await supabase.from("sessions").update({ interview_strategy: strategy }).eq("id", id).eq("user_id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ strategy });
}
