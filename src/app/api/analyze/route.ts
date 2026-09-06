import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { CvAnalysis } from "@/types";

function fallbackAnalysis(cvText: string, jobDescription: string): CvAnalysis {
  const cvLower = cvText.toLowerCase();
  const jdWords = jobDescription
    .toLowerCase()
    .split(/[^a-z0-9+#.]/)
    .filter((w) => w.length > 4);
  const unique = [...new Set(jdWords)].slice(0, 40);
  const matched = unique.filter((w) => cvLower.includes(w)).slice(0, 8);
  const score = Math.min(92, 40 + matched.length * 6);

  return {
    matchScore: score,
    strengths: [
      "Your experience shows a clear professional story based on the CV you provided.",
      "Your CV contains experience that connects with important parts of this role.",
      matched.length
        ? `Your CV directly mentions experience related to: ${matched.slice(0, 3).join(", ")}.`
        : "You have a solid experience base to build your interview examples from.",
    ],
    gaps: [
      "Your answers should make business results and measurable impact clearer.",
      "Some requirements in the job description need stronger examples from your experience.",
      "Prepare simple examples that show the problem, what you did, and what changed as a result.",
    ],
    keywordAlignment: matched.length ? matched : ["leadership", "delivery", "collaboration"],
    summary:
      "Your preparation starts from the evidence in your CV and the requirements in this job description. The most important next step is to turn the strongest matches and gaps into clear interview examples.",
    suggestedFocusAreas: [
      "Business impact — show the results your work produced and use numbers when they are genuinely available in your experience.",
      "Working with others — prepare an example showing how you influenced or worked with people outside your immediate team.",
      "Role-specific knowledge — identify the parts of the job description where your CV gives less direct evidence and prepare an honest way to address them.",
    ],
  };
}

async function runAnalysis(
  cvText: string,
  jobDescription: string,
  priorContext?: {
    sessions: unknown[];
    coaching_progress: unknown[];
  }
): Promise<CvAnalysis> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `You are Interview Mirror's candidate coach. Analyze the CV against the job description using evidence first.

Your output will be read directly by a job candidate. Do not write like an HR analyst, consultant, developer, or AI system.
Use plain, direct language and speak to the candidate as "you".
Do not use technical phrases such as "lexical overlap", "semantic similarity", "keyword density", "preliminary alignment", or similar analyst jargon.

Return JSON with keys:
matchScore (0-100 number),
strengths (string[]),
gaps (string[]),
keywordAlignment (string[]),
summary (string),
suggestedFocusAreas (string[]).

Every claim must be supported by the supplied CV or job description. Never invent experience.
For each strength or gap, explain the practical interview meaning when useful.
For suggestedFocusAreas, give 2-4 specific coaching priorities. Each must follow this simple structure:
"Focus — why it matters for this role — evidence from the CV/JD that led you here."
Do not create a focus area unless you can point to evidence in the CV or job description.
Do not use STAR/CAR terminology unless the candidate already used it; prefer "Problem → What you did → Result".
The goal is to help the candidate understand what to prepare next, not to impress them with analysis terminology.`,
        },
        {
          role: "user",
          content: `CV:\n${cvText.slice(0, 12000)}

JOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}

PRIOR PREPARATION CONTEXT:\n${JSON.stringify(priorContext ?? { sessions: [], coaching_progress: [] }).slice(0, 12000)}

Use prior preparation context only to maintain continuity and identify areas for improvement. Do not treat it as evidence of current CV experience.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    return JSON.parse(raw) as CvAnalysis;
  } catch {
    return fallbackAnalysis(cvText, jobDescription);
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const cvText = String(body.cvText ?? "").trim();
  const jobDescription = String(body.jobDescription ?? "").trim();
  const title = String(body.title ?? "Interview preparation").trim();
  const sessionId = body.sessionId as string | null | undefined;

  if (!cvText || !jobDescription) {
    return NextResponse.json(
      { error: "CV and job description are required" },
      { status: 400 }
    );
  }

  let priorContext:
  | { sessions: unknown[]; coaching_progress: unknown[] }
  | undefined;

  if (!sessionId) {
    const { data, error } = await supabase.rpc(
      "get_candidate_preparation_context",
      { p_user_id: user.id }
    );

    if (!error && data) {
      priorContext = data;
    } else if (error) {
      console.error("Failed to load preparation context:", error);
    }
  }

  const analysis = await runAnalysis(cvText, jobDescription, priorContext);

  let id = sessionId ?? null;

  if (id) {
    const { error } = await supabase
      .from("sessions")
      .update({
        title,
        cv_text: cvText,
        job_description: jobDescription,
        cv_analysis: analysis,
        status: "analyzed",
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        title,
        cv_text: cvText,
        job_description: jobDescription,
        cv_analysis: analysis,
        status: "analyzed",
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create session" },
        { status: 500 }
      );
    }
    id = data.id;
  }

  await supabase.from("questions").delete().eq("session_id", id);

  const rawQuestions =
    (analysis as any)?.questions ||
    (analysis as any)?.interviewQuestions ||
    (analysis as any)?.interview_questions ||
    [];

  console.log("Raw questions extracted:", rawQuestions);

  const questionsToInsert = rawQuestions.map((q: any, index: number) => ({
    session_id: id,
    question:
      typeof q === "string" ? q : (q.question || q.question_text || q.text || String(q)),
    category: typeof q === "object" && q.category ? q.category : "General",
    order_index: index + 1,
  }));

  if (questionsToInsert.length > 0) {
    const { error: questionsError } = await supabase
      .from("questions")
      .insert(questionsToInsert);

    if (questionsError) {
      console.error("Failed to insert questions into Supabase:", questionsError);
      return NextResponse.json({ error: questionsError.message }, { status: 500 });
    }
  } else {
    console.warn("No questions array found in OpenAI response.");
  }

  return NextResponse.json({ sessionId: id, analysis });
}
