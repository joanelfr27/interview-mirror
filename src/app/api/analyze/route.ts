import { NextResponse } from "next/server";
import { AI_MODEL, getOpenAI } from "@/lib/openai";
import { createClient } from "@/lib/supabase/server";
import type { CvAnalysis } from "@/types";

function fallbackAnalysis(cvText: string, jobDescription: string): CvAnalysis {
  const cvLower = cvText.toLowerCase();
  const jdWords = jobDescription.toLowerCase().split(/[^a-z0-9+#.]/).filter((w) => w.length > 4);
  const unique = [...new Set(jdWords)].slice(0, 40);
  const matched = unique.filter((w) => cvLower.includes(w)).slice(0, 8);
  const score = Math.min(92, 40 + matched.length * 6);
  return {
    matchScore: score,
    strengths: ["Your experience shows a clear professional story based on the CV you provided.", "Your CV contains experience that connects with important parts of this role.", matched.length ? `Your CV directly mentions experience related to: ${matched.slice(0, 3).join(", ")}.` : "You have a solid experience base to build your interview examples from."],
    gaps: ["Your answers should make business results and measurable impact clearer.", "Some requirements in the job description need stronger examples from your experience.", "Prepare simple examples that show the problem, what you did, and what changed as a result."],
    keywordAlignment: matched.length ? matched : ["leadership", "delivery", "collaboration"],
    summary: "Your preparation starts from the evidence in your CV and the requirements in this job description. The most important next step is to turn the strongest matches and gaps into clear interview examples.",
    suggestedFocusAreas: ["Business impact — show the results your work produced and use numbers when they are genuinely available in your experience.", "Working with others — prepare an example showing how you influenced or worked with people outside your immediate team.", "Role-specific knowledge — identify the parts of the job description where your CV gives less direct evidence and prepare an honest way to address them."],
  };
}

async function runAnalysis(cvText: string, jobDescription: string, priorContext?: { sessions: unknown[]; coaching_progress: unknown[] }): Promise<CvAnalysis> {
  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        { role: "system", content: `You are Interview Mirror's candidate coach. Analyze the CV against the job description using evidence first.\n\nYour output will be read directly by a job candidate. Do not write like an HR analyst, consultant, developer, or AI system.\nUse plain, direct language and speak to the candidate as "you".\nDo not use technical phrases such as "lexical overlap", "semantic similarity", "keyword density", "preliminary alignment", or similar analyst jargon.\n\nReturn JSON with keys:\nmatchScore (0-100 number),\nstrengths (string[]),\ngaps (string[]),\nkeywordAlignment (string[]),\nsummary (string),\nsuggestedFocusAreas (string[]).\n\nEvery claim must be supported by the supplied CV or job description. Never invent experience.\nFor each strength or gap, explain the practical interview meaning when useful.\nFor suggestedFocusAreas, give 2-4 specific coaching priorities. Each must follow this simple structure:\n"Focus — why it matters for this role — evidence from the CV/JD that led you here."\nDo not create a focus area unless you can point to evidence in the CV or job description.\nDo not use STAR/CAR terminology unless the candidate already used it; prefer "Problem → What you did → Result".\nThe goal is to help the candidate understand what to prepare next, not to impress them with analysis terminology.` },
        { role: "user", content: `CV:\n${cvText.slice(0, 12000)}\n\nJOB DESCRIPTION:\n${jobDescription.slice(0, 8000)}\n\nPRIOR PREPARATION CONTEXT:\n${JSON.stringify(priorContext ?? { sessions: [], coaching_progress: [] }).slice(0, 12000)}\n\nUse prior preparation context only to maintain continuity and identify areas for improvement. Do not treat it as evidence of current CV experience.` },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");
    return JSON.parse(raw) as CvAnalysis;
  } catch {
    return fallbackAnalysis(cvText, jobDescription);
  }
}

async function tryFetchJobDescription(url: string): Promise<string> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": "InterviewMirror/1.0 (+job-description-import)" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) return "";
    const html = await response.text();
    if (!html.trim()) return "";
    return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, " ").trim().slice(0, 16000);
  } catch { return ""; }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const cvText = String(body.cvText ?? "").trim();
  let jobDescription = String(body.jobDescription ?? "").trim();
  const jobDescriptionUrl = String(body.jobDescriptionUrl ?? "").trim() || null;
  const title = String(body.title ?? "Interview preparation").trim();
  const sessionId = body.sessionId as string | null | undefined;
  const preparationPurpose = body.preparationPurpose === "improve_skills" ? "improve_skills" : "upcoming_interview";
  const interviewDate = String(body.interviewDate ?? "").trim();

  if (!cvText) return NextResponse.json({ error: "CV is required" }, { status: 400 });
  if (preparationPurpose === "upcoming_interview" && !interviewDate) return NextResponse.json({ error: "Interview date is required for an upcoming interview" }, { status: 400 });
  if (preparationPurpose === "improve_skills" && interviewDate) return NextResponse.json({ error: "Interview date must be empty when improving interview skills" }, { status: 400 });

  if (!jobDescription && jobDescriptionUrl) jobDescription = await tryFetchJobDescription(jobDescriptionUrl);
  if (!jobDescription && preparationPurpose === "upcoming_interview") return NextResponse.json({ error: "Please paste the job description or upload its PDF. We could not reliably read the supplied link." }, { status: 400 });

  const parsedInterviewDate = interviewDate ? new Date(`${interviewDate}T12:00:00.000Z`) : null;
  if (parsedInterviewDate && Number.isNaN(parsedInterviewDate.getTime())) return NextResponse.json({ error: "Invalid interview date" }, { status: 400 });

  let priorContext: { sessions: unknown[]; coaching_progress: unknown[] } | undefined;
  if (!sessionId) {
    const { data, error } = await supabase.rpc("get_candidate_preparation_context", { p_user_id: user.id });
    if (!error && data) priorContext = data;
    else if (error) console.error("Failed to load preparation context:", error);
  }

  const analysis = await runAnalysis(cvText, jobDescription, priorContext);
  let id = sessionId ?? null;
  const sessionFields = {
    title,
    cv_text: cvText,
    job_description: jobDescription,
    job_description_url: jobDescriptionUrl,
    interview_date: parsedInterviewDate?.toISOString() ?? null,
    cv_analysis: analysis,
    status: "analyzed",
  };

  if (id) {
    const { error } = await supabase.from("sessions").update(sessionFields).eq("id", id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data, error } = await supabase.from("sessions").insert({ user_id: user.id, ...sessionFields }).select("id").single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Failed to create session" }, { status: 500 });
    id = data.id;
  }

  await supabase.from("questions").delete().eq("session_id", id);
  const rawQuestions = (analysis as any)?.questions || (analysis as any)?.interviewQuestions || (analysis as any)?.interview_questions || [];
  const questionsToInsert = rawQuestions.map((q: any, index: number) => ({ session_id: id, question: typeof q === "string" ? q : (q.question || q.question_text || q.text || String(q)), category: typeof q === "object" && q.category ? q.category : "General", order_index: index + 1 }));
  if (questionsToInsert.length > 0) {
    const { error: questionsError } = await supabase.from("questions").insert(questionsToInsert);
    if (questionsError) { console.error("Failed to insert questions into Supabase:", questionsError); return NextResponse.json({ error: questionsError.message }, { status: 500 }); }
  }
  return NextResponse.json({ sessionId: id, analysis });
}
