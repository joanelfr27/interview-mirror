import { NextResponse } from "next/server";
import { STRATEGY_ENGINE_VERSION } from "@/lib/strategy-engine-version";
import { createClient } from "@/lib/supabase/server";
import { generateInterviewQuestions } from "@/lib/openai";

function isValidQuestionSet(data: unknown, strategy: unknown): data is { questions: Array<{ question: string; strategy_basis: string }> } {
  if (!data || typeof data !== "object") return false;
  const questions = (data as { questions?: unknown }).questions;
  if (!Array.isArray(questions) || questions.length !== 5) return false;
  const s = strategy && typeof strategy === "object" ? strategy as Record<string, unknown> : null;
  const allowedBases = new Set<string>([
    ...(Array.isArray(s?.interviewPriorities) ? s.interviewPriorities : []),
    ...(Array.isArray(s?.storiesToPrepare) ? s.storiesToPrepare : []),
    ...(Array.isArray(s?.gapsOrRisks) ? s.gapsOrRisks : []),
    ...(Array.isArray(s?.gapDefenseStrategy) ? s.gapDefenseStrategy : []),
    ...(typeof s?.strongestValueProposition === "string" ? [s.strongestValueProposition] : []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  const generic = /\b(tell me about yourself|why do you want this job|what are your strengths|what are your weaknesses|where do you see yourself|why should we hire you|team conflict|conflict with a colleague|leadership style|hobbies)\b/i;
  return questions.every((item) => {
    if (!item || typeof item !== "object") return false;
    const question = (item as { question?: unknown }).question;
    const basis = (item as { strategy_basis?: unknown }).strategy_basis;
    if (typeof question !== "string" || !question.trim() || typeof basis !== "string" || !basis.trim()) return false;
    if (generic.test(question)) return false;
    return allowedBases.has(basis.trim());
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sourceSessionId } = await params;
    if (!sourceSessionId) return NextResponse.json({ error: "Missing session id" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: sourceSession, error: sessionError } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sourceSessionId)
      .eq("user_id", user.id)
      .single();
    if (sessionError || !sourceSession) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!sourceSession.cv_analysis || !sourceSession.interview_strategy) {
      return NextResponse.json({ error: "CV analysis and interview strategy are required" }, { status: 400 });
    }
    if ((sourceSession.interview_strategy as any)._strategy_engine_version !== STRATEGY_ENGINE_VERSION) {
      return NextResponse.json({ code: "STRATEGY_REFRESH_REQUIRED", error: "Refresh the interview strategy before starting a retest." }, { status: 409 });
    }

    const { data: feedbackRow, error: feedbackError } = await supabase
      .from("feedback")
      .select("feedback")
      .eq("session_id", sourceSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (feedbackError) return NextResponse.json({ error: feedbackError.message }, { status: 500 });
    if (!feedbackRow?.feedback) return NextResponse.json({ error: "Interview feedback is required before a retest" }, { status: 400 });

    const feedback = feedbackRow.feedback as { questionFeedback?: Array<{ question?: string; score?: number; whatWasMissing?: string; actionableImprovement?: string }> };
    const weaknesses = (feedback.questionFeedback ?? [])
      .map((item) => ({
        question: String(item.question ?? "").trim(),
        score: Number(item.score),
        missing: String(item.whatWasMissing ?? "").trim(),
        next: String(item.actionableImprovement ?? "").trim(),
      }))
      .filter((item) => item.question && item.missing && Number.isFinite(item.score))
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);

    const retestStrategy = {
      ...(sourceSession.interview_strategy as Record<string, unknown>),
      retest_priorities: weaknesses,
    };

    const language = sourceSession.interview_language === "fr" ? "fr" : "en";
    const questionsData = await generateInterviewQuestions(sourceSession.cv_analysis, retestStrategy, language);
    if (!isValidQuestionSet(questionsData, retestStrategy)) {
      return NextResponse.json({ error: "The retest questions could not be grounded reliably in the interview strategy." }, { status: 422 });
    }

    const { data: newSession, error: createError } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        title: sourceSession.title,
        cv_text: sourceSession.cv_text,
        job_description: sourceSession.job_description,
        job_description_url: sourceSession.job_description_url,
        preparation_purpose: sourceSession.preparation_purpose,
        preparation_language: sourceSession.preparation_language,
        interview_date: sourceSession.interview_date,
        cv_analysis: sourceSession.cv_analysis,
        interview_strategy: sourceSession.interview_strategy,
        coaching_focus: null,
        status: "in_progress",
      })
      .select("id")
      .single();
    if (createError || !newSession) throw new Error(createError?.message || "Failed to create retest session");

    const questionRows = questionsData.questions.map((item, index) => ({
      session_id: newSession.id,
      question: item.question.trim(),
      category: "strategy",
      order_index: index + 1,
    }));
    const { error: questionsError } = await supabase.from("questions").insert(questionRows);
    if (questionsError) {
      await supabase.from("sessions").delete().eq("id", newSession.id).eq("user_id", user.id);
      throw new Error(questionsError.message);
    }

    return NextResponse.json({ sessionId: newSession.id });
  } catch (error) {
    console.error("Error creating retest interview:", error);
    return NextResponse.json({ error: "Failed to create retest interview" }, { status: 500 });
  }
}
