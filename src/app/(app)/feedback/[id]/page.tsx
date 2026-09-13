import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/server";
import { CoachingPracticeButton } from "@/components/coaching-practice-button";
import { CoachingProgressCard } from "@/components/coaching-progress-card";
import type { FeedbackResult, SessionRecord } from "@/types";

function normalizeFocusKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function ScoreRing({ label, value }: { label: string; value: number }) {
  return <div className="space-y-2"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{label}</span><span className="font-semibold text-slate-900">{value}</span></div><Progress value={value} /></div>;
}

export default async function FeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient();
  const { data: session } = await supabase.from("sessions").select("*").eq("id", id).single();
  if (!session) notFound();
  const { data: feedbackRow } = await supabase.from("feedback").select("*").eq("session_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!feedbackRow) return <div className="mx-auto max-w-2xl space-y-4 text-center"><h1 className="font-display text-2xl font-semibold">Feedback not ready</h1><p className="text-muted-foreground">Complete the interview simulator to generate coaching feedback.</p><Button asChild><Link href={`/interview/${id}`}>Go to interview</Link></Button></div>;
  const record = session as SessionRecord; const feedback = feedbackRow.feedback as FeedbackResult; const priorityFocus = feedback.improvements[0]?.trim() || null; const isTargeted = Boolean(record.coaching_focus);
  let coachingProgress = null;
  if (isTargeted && record.coaching_focus) { const focusKey = normalizeFocusKey(record.coaching_focus); const { data } = await supabase.from("coaching_progress").select("baseline_score, latest_score, status, evidence").eq("user_id", record.user_id).eq("focus_key", focusKey).maybeSingle(); coachingProgress = data; }
  return <div className="mx-auto max-w-3xl space-y-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Badge className="mb-2">Coaching feedback</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{record.title}</h1><p className="mt-2 text-muted-foreground">{feedback.summary}</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Dashboard</Link></Button><Button asChild><Link href="/prepare"><RotateCcw className="h-4 w-4" />New session</Link></Button></div></div>
    <Card><CardHeader><CardDescription>Overall score</CardDescription><CardTitle className="text-5xl">{feedback.overallScore}</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><ScoreRing label="Communication" value={feedback.communication} /><ScoreRing label="Relevance" value={feedback.relevance} /><ScoreRing label="Structure" value={feedback.structure} /><ScoreRing label="Confidence" value={feedback.confidence} /></CardContent></Card>
    {isTargeted && record.coaching_focus && <><Card><CardHeader><Badge variant="secondary" className="w-fit">Targeted coaching</Badge><CardTitle className="text-base">{record.coaching_focus}</CardTitle><CardDescription>This score measures how well this practice session demonstrated the selected coaching focus.</CardDescription></CardHeader><CardContent className="space-y-4">{typeof feedback.focusScore === "number" && <ScoreRing label="Focus score" value={feedback.focusScore} />}{feedback.focusEvidence && <div className="rounded-lg border bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p><p className="mt-1 text-sm text-slate-700">{feedback.focusEvidence}</p></div>}{feedback.focusNextStep && <div className="rounded-lg border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next step</p><p className="mt-1 text-sm text-slate-700">{feedback.focusNextStep}</p></div>}</CardContent></Card><CoachingProgressCard progress={coachingProgress} /></>}
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">What worked</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-slate-700">{feedback.strengths.map((s) => <li key={s} className="rounded-lg border bg-emerald-50/50 px-3 py-2">{s}</li>)}</ul></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Improve next</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-slate-700">{feedback.improvements.map((s) => <li key={s} className="rounded-lg border bg-amber-50/50 px-3 py-2">{s}</li>)}</ul></CardContent></Card></div>
    {priorityFocus && <Card><CardHeader><Badge variant="secondary" className="w-fit">Priority coaching focus</Badge><CardTitle className="text-base">Work on this next</CardTitle><CardDescription>We identified your first improvement area as the priority. Practice it with two new questions instead of repeating the full interview.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium text-slate-800">{priorityFocus}</p><CoachingPracticeButton sourceSessionId={id} focusArea={priorityFocus} /></CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-base">Per-question coaching</CardTitle><CardDescription>See what worked, what was missing, and the exact adjustment to make on your next attempt.</CardDescription></CardHeader><CardContent className="space-y-5">{feedback.questionFeedback.map((q, index) => <div key={index} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><p className="font-medium text-slate-900">{q.question}</p><Badge variant="secondary">{q.score}/100</Badge></div><div className="mt-3 space-y-3 text-sm"><div><p className="font-semibold text-slate-900">What worked</p><p className="mt-1 text-muted-foreground">{q.whatWorked || q.keyStrength || q.comment}</p></div><div><p className="font-semibold text-slate-900">What was missing</p><p className="mt-1 text-muted-foreground">{q.whatWasMissing || q.keyImprovement || "A more specific demonstration is needed."}</p></div><div><p className="font-semibold text-slate-900">Next attempt</p><p className="mt-1 text-slate-700">{q.actionableImprovement || q.keyImprovement || "Strengthen the answer with a concrete example and outcome."}</p></div></div></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">How to strengthen your answer</CardTitle><CardDescription>A short structure to guide your next attempt — not a script to memorize.</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{feedback.sampleRewrite}</p></CardContent></Card>
  </div>;
}
