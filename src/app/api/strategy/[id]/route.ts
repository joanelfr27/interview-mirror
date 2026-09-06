import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { InterviewStrategy, SessionRecord } from "@/types";

type StrategyInput = Record<string, unknown>;

function isValidStrategy(strategy: unknown): strategy is InterviewStrategy {
  if (!strategy || typeof strategy !== "object") return false;
  const candidatePositioning = (strategy as any).candidatePositioning;
  const strongestValueProposition = (strategy as any).strongestValueProposition;
  const strengthsToLeverage = (strategy as any).strengthsToLeverage;
  const gapsOrRisks = (strategy as any).gapsOrRisks;
  const gapDefenseStrategy = (strategy as any).gapDefenseStrategy;
  const interviewPriorities = (strategy as any).interviewPriorities;
  const likelyDifficultQuestions = (strategy as any).likelyDifficultQuestions;
  const storiesToPrepare = (strategy as any).storiesToPrepare;
  const communicationPriorities = (strategy as any).communicationPriorities;
  const interviewPlan = (strategy as any).interviewPlan;
  const personalization = (strategy as any).personalization;

  return (
    typeof candidatePositioning === "string" &&
    typeof strongestValueProposition === "string" &&
    Array.isArray(strengthsToLeverage) &&
    Array.isArray(gapsOrRisks) &&
    Array.isArray(gapDefenseStrategy) &&
    Array.isArray(interviewPriorities) &&
    Array.isArray(likelyDifficultQuestions) &&
    Array.isArray(storiesToPrepare) &&
    typeof communicationPriorities === "string" &&
    typeof interviewPlan === "string" &&
    typeof personalization === "string"
  );
}

function fallbackStrategy(session: SessionRecord): InterviewStrategy {
  const strengths = session.cv_analysis?.strengths ?? [];
  const gaps = session.cv_analysis?.gaps ?? [];
  const keywords = session.cv_analysis?.keywordAlignment ?? [];
  const focusAreas = session.cv_analysis?.suggestedFocusAreas ?? [];
  const topStrength = strengths[0] ?? "relevant experience";
  const topGap = gaps[0] ?? "areas where your evidence is less explicit";
  const topFocus = focusAreas.slice(0, 3).join("; ") || "the role's key requirements";

  return {
    candidatePositioning: `Present yourself as someone who brings ${topStrength}. Keep your story focused on the evidence in your CV and how it can help with the role's priorities: ${topFocus}.`,
    strongestValueProposition: `Your strongest message is the combination of ${topStrength} and the results you can demonstrate. Connect that experience directly to what this role needs.`,
    strengthsToLeverage: strengths.slice(0, 5),
    gapsOrRisks: gaps.slice(0, 5),
    gapDefenseStrategy: gaps.slice(0, 5).map((gap) =>
      `If asked about ${gap.toLowerCase()}, be honest about the gap, then explain the closest experience you do have and how you would close the remaining gap.`
    ),
    interviewPriorities: [
      `Show clear evidence of ${topStrength}.`,
      `Prepare an honest example to address ${topGap}.`,
      `Connect your experience to these role requirements where supported: ${keywords.join(", ")}.`,
    ].filter(Boolean),
    likelyDifficultQuestions: [
      `What experience do you have that addresses ${topGap.toLowerCase()}?`,
      `Tell me about an example that demonstrates your ability in ${topFocus}.`,
    ],
    storiesToPrepare: focusAreas.map(
      (area) => `Prepare one real example about ${area}. Explain the problem, what you did, and the result.`
    ),
    communicationPriorities: "Be clear and concise. Start with the main point, explain what you personally did, and finish with the result. Use only examples you can support with your experience.",
    interviewPlan: "Start with a short introduction, lead with your strongest evidence, address important gaps honestly, and connect your examples to the role's priorities. Finish by showing how your experience can create value in the role.",
    personalization: "Keep your answers grounded in your CV and this job description. Use the strongest matching evidence and be transparent where your experience is less direct.",
  };
}

async function generateStrategy(
  session: SessionRecord
): Promise<InterviewStrategy> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You are Interview Mirror's interview coach.
Create a concise, candidate-specific interview game plan from the CV, job description, and analysis.

The candidate must be able to understand and use this plan without knowing HR, consulting, or AI terminology. Write directly to the candidate using "you". Avoid jargon and unnecessary explanation.

The strategy should answer five practical questions:
1. What should I want the interviewer to remember about me?
2. What evidence from my experience should I use?
3. What gaps or risks could the interviewer question?
4. What examples should I prepare?
5. How should I communicate these points during the interview?

Return JSON using exactly these keys:
- candidatePositioning (string)
- strongestValueProposition (string)
- strengthsToLeverage (string[])
- gapsOrRisks (string[])
- gapDefenseStrategy (string[])
- interviewPriorities (string[])
- likelyDifficultQuestions (string[])
- storiesToPrepare (string[])
- communicationPriorities (string)
- interviewPlan (string)
- personalization (string)

Evidence rules:
- Use only information contained in the CV, job description, and analysis.
- Never invent credentials, employers, achievements, metrics, tools, dates, responsibilities, or outcomes.
- Make the connection between each recommendation and the role clear.
- When evidence is missing, say what the candidate should prepare or clarify rather than creating a story.
- Do not use STAR/CAR terminology unless necessary; prefer "Problem → What you did → Result".

Keep the strategy scannable. Prioritize the most important actions instead of producing a long report. Each list should contain only the most useful items.`,
        },
        {
          role: "user",
          content: `Title: ${session.title}
CV:
${session.cv_text.slice(0, 12000)}

JOB DESCRIPTION:
${session.job_description.slice(0, 8000)}

ANALYSIS:
${JSON.stringify(session.cv_analysis)}

Create an interview game plan for this candidate. Use the evidence in the CV and job description to prioritize what the candidate should do before and during the interview.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    const parsed = JSON.parse(raw) as InterviewStrategy;
    if (!isValidStrategy(parsed)) throw new Error("Invalid strategy format");
    return parsed;
  } catch {
    return fallbackStrategy(session);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const record = session as SessionRecord;

  if (!record.cv_analysis) {
    return NextResponse.json(
      {
        error:
          "CV analysis is required before generating an interview strategy.",
      },
      { status: 400 }
    );
  }

  if (isValidStrategy(record.interview_strategy)) {
    return NextResponse.json({ strategy: record.interview_strategy });
  }

  const strategy = await generateStrategy(record);

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ interview_strategy: strategy })
    .eq("id", id)
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ strategy });
}
