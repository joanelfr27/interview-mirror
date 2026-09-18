import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInterviewQuestions } from '@/lib/openai'

function isStrategyGroundedQuestionSet(data: unknown, _strategy: unknown): data is { questions: Array<{ question: string; strategy_basis: string }> } {
  if (!data || typeof data !== 'object') return false
  const questions = (data as { questions?: unknown }).questions
  if (!Array.isArray(questions) || questions.length !== 5) return false

  const generic = /\b(tell me about yourself|why do you want this job|what are your strengths|what are your weaknesses|where do you see yourself|why should we hire you|team conflict|conflict with a colleague|leadership style|hobbies)\b/i

  return questions.every((item) => {
    if (!item || typeof item !== 'object') return false
    const question = (item as { question?: unknown }).question
    const basis = (item as { strategy_basis?: unknown }).strategy_basis
    if (typeof question !== 'string' || !question.trim() || typeof basis !== 'string' || !basis.trim()) return false
    if (generic.test(question)) return false
    return true
  })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params
    if (!sessionId) return NextResponse.json({ error: 'Missing session id' }, { status: 400 })
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: session, error: sessionError } = await supabase.from('sessions').select('*').eq('id', sessionId).eq('user_id', user.id).single()
    if (sessionError || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (!session.cv_analysis || !session.interview_strategy) return NextResponse.json({ error: 'CV analysis and interview strategy are required' }, { status: 400 })
    if ((session.interview_strategy as any)._strategy_engine_version !== 'v2.2') return NextResponse.json({ code: 'STRATEGY_REFRESH_REQUIRED', error: 'This session uses an older interview strategy. Refresh the strategy before starting the interview.' }, { status: 409 })

    const { data: existingQuestions, error: existingQuestionsError } = await supabase.from('questions').select('id, category').eq('session_id', sessionId).order('order_index', { ascending: true })
    if (existingQuestionsError) return NextResponse.json({ error: existingQuestionsError.message }, { status: 500 })
    if (existingQuestions?.length) {
      const hasLegacyQuestions = existingQuestions.some((question) => question.category !== 'strategy')
      if (hasLegacyQuestions) {
        return NextResponse.json({ error: 'This practice set was created before strategy-grounded interview practice. Start a new interview session to use the current strategy.' }, { status: 409 })
      }
      const { data: updatedSession, error: statusError } = await supabase.from('sessions').update({ status: 'in_progress' }).eq('id', sessionId).eq('user_id', user.id).select().single()
      if (statusError) throw statusError
      return NextResponse.json({ ...(updatedSession ?? session), id: sessionId, status: 'in_progress' })
    }

    const language = session.preparation_language === 'fr' ? 'fr' : 'en'
    const questionsData = await generateInterviewQuestions(session.cv_analysis, session.interview_strategy, language)
    if (!isStrategyGroundedQuestionSet(questionsData, session.interview_strategy)) {
      return NextResponse.json({ error: 'The interview questions were not sufficiently grounded in the interview strategy. Please regenerate the strategy and try again.' }, { status: 422 })
    }

    const questionItems = questionsData.questions.map((item) => item.question.trim())
    const questionRows = questionItems.map((question: string, index: number) => ({ session_id: sessionId, question, category: 'strategy', order_index: index + 1 }))
    const { error: questionsError } = await supabase.from('questions').insert(questionRows)
    if (questionsError) { await supabase.from('questions').delete().eq('session_id', sessionId); throw questionsError }
    const { data: updatedSession, error: statusError } = await supabase.from('sessions').update({ status: 'in_progress' }).eq('id', sessionId).eq('user_id', user.id).select().single()
    if (statusError) throw statusError
    return NextResponse.json({ ...(updatedSession ?? session), id: sessionId, status: 'in_progress' })
  } catch (error) {
    console.error('Error generating interview:', error)
    return NextResponse.json({ error: 'Failed to generate interview questions' }, { status: 500 })
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: session, error: sessionError } = await supabase.from('sessions').select('*').eq('id', id).eq('user_id', user.id).single()
    if (sessionError || !session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const { data: questions, error: questionsError } = await supabase.from('questions').select('*').eq('session_id', id).order('order_index', { ascending: true })
    if (questionsError) return NextResponse.json({ error: questionsError.message }, { status: 500 })
    const { data: answers, error: answersError } = await supabase.from('answers').select('*').eq('session_id', id)
    if (answersError) return NextResponse.json({ error: answersError.message }, { status: 500 })
    return NextResponse.json({ session, questions: questions ?? [], answers: answers ?? [] })
  } catch (error) {
    console.error('Error loading interview:', error)
    return NextResponse.json({ error: 'Failed to load interview' }, { status: 500 })
  }
}
