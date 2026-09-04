import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInterviewQuestions } from '@/lib/openai'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: strategyId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: strategy, error: strategyError } = await supabase
      .from('strategies')
      .select('*')
      .eq('id', strategyId)
      .single()

    if (strategyError || !strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 })
    }

    const { data: analysis, error: analysisError } = await supabase
      .from('analyses')
      .select('*')
      .eq('id', strategy.analysis_id)
      .single()

    if (analysisError || !analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
    }

    const questionsData = await generateInterviewQuestions(analysis, strategy)

    // 1. Create the session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        strategy_id: strategy.id,
        status: 'in_progress',
      })
      .select()
      .single()

    if (sessionError) throw sessionError

    // 2. Insert questions into normalized questions table
    const questionRows = questionsData.questions.map((q: string, index: number) => ({
      session_id: session.id,
      question_text: q,
      category: 'general',
      order_order: index + 1,
    }))

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionRows)

    if (questionsError) throw questionsError

    return NextResponse.json(session)
  } catch (error) {
    console.error('Error generating interview:', error)
    return NextResponse.json(
      { error: 'Failed to generate interview questions' },
      { status: 500 }
    )
  }
}

// Load an existing interview session. This preserves the working interview-page
// behavior from the previous implementation while keeping the new POST
// generation flow above intact.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .eq('session_id', id)
      .order('order_order', { ascending: true })

    if (questionsError) {
      return NextResponse.json({ error: questionsError.message }, { status: 500 })
    }

    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select('*')
      .eq('session_id', id)

    if (answersError) {
      return NextResponse.json({ error: answersError.message }, { status: 500 })
    }

    return NextResponse.json({
      session,
      questions: questions ?? [],
      answers: answers ?? [],
    })
  } catch (error) {
    console.error('Error loading interview:', error)
    return NextResponse.json(
      { error: 'Failed to load interview' },
      { status: 500 }
    )
  }
}
