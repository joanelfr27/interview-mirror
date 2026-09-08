import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInterviewQuestions } from '@/lib/openai'

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
    const { data: existingQuestions, error: existingQuestionsError } = await supabase.from('questions').select('id').eq('session_id', sessionId).limit(1)
    if (existingQuestionsError) return NextResponse.json({ error: existingQuestionsError.message }, { status: 500 })
    if (existingQuestions?.length) {
      const { data: updatedSession, error: statusError } = await supabase.from('sessions').update({ status: 'in_progress' }).eq('id', sessionId).eq('user_id', user.id).select().single()
      if (statusError) throw statusError
      return NextResponse.json({ ...(updatedSession ?? session), id: sessionId, status: 'in_progress' })
    }
    const language = session.preparation_language === 'fr' ? 'fr' : 'en'
    const questionsData = await generateInterviewQuestions(session.cv_analysis, session.interview_strategy, language)
    const questions = Array.isArray(questionsData?.questions) ? questionsData.questions.filter((question: unknown): question is string => typeof question === 'string' && question.trim().length > 0).map((question: string) => question.trim()) : []
    if (!questions.length) return NextResponse.json({ error: 'No interview questions were generated' }, { status: 500 })
    const questionRows = questions.map((question: string, index: number) => ({ session_id: sessionId, question, category: 'general', order_index: index + 1 }))
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
