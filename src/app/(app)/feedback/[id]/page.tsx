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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();
  const { data: session } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", user.id).single();
  if (!session) notFound();
  const { data: feedbackRow } = await supabase.from("feedback").select("*").eq("session_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!feedbackRow) return <div className="mx-auto max-w-2xl space-y-4 text-center"><h1 className="font-display text-2xl font-semibold">Feedback not ready</h1><p className="text-muted-foreground">Complete the interview simulator to generate coaching feedback.</p><Button asChild><Link href={`/interview/${id}`}>Go to interview</Link></Button></div>;
  const record = session as SessionRecord; const feedback = feedbackRow.feedback as FeedbackResult; const priorityFocus = feedback.improvements[0]?.trim() || null; const isTargeted = Boolean(record.coaching_focus); const isFrench = record.preparation_language === "fr";
  const labels = isFrench ? {
    feedbackReady: "Feedback prêt",
    feedbackNotReady: "Feedback non disponible",
    completeInterview: "Terminez la simulation d'entretien pour générer votre feedback.",
    goToInterview: "Aller à l'entretien",
    coachingFeedback: "Feedback de coaching",
    dashboard: "Tableau de bord",
    newSession: "Nouvelle session",
    overallScore: "Score global",
    communication: "Communication",
    relevance: "Pertinence",
    structure: "Structure",
    confidence: "Confiance",
    targetedCoaching: "Coaching ciblé",
    targetedDescription: "Ce score mesure dans quelle mesure cette session démontre le point de coaching sélectionné.",
    evidence: "Preuve",
    nextStep: "Prochaine étape",
    whatWorked: "Ce qui a fonctionné",
    improveNext: "À améliorer ensuite",
    priorityFocus: "Priorité de coaching",
    workOnThisNext: "Travaillez ce point ensuite",
    priorityDescription: "Nous avons identifié votre premier axe d'amélioration comme priorité. Pratiquez-le avec deux nouvelles questions plutôt que de refaire tout l'entretien.",
    perQuestion: "Coaching par question",
    perQuestionDescription: "Voyez ce qui a fonctionné, ce qui manquait et l'ajustement précis à faire lors de votre prochaine tentative.",
    whatWasMissing: "Ce qui manquait",
    nextAttempt: "Prochaine tentative",
    strengthen: "Comment renforcer votre réponse",
    strengthenDescription: "Une structure courte pour guider votre prochaine tentative — pas un script à mémoriser."
  } : {
    feedbackReady: "Coaching feedback",
    feedbackNotReady: "Feedback not ready",
    completeInterview: "Complete the interview simulator to generate coaching feedback.",
    goToInterview: "Go to interview",
    coachingFeedback: "Coaching feedback",
    dashboard: "Dashboard",
    newSession: "New session",
    overallScore: "Overall score",
    communication: "Communication",
    relevance: "Relevance",
    structure: "Structure",
    confidence: "Confidence",
    targetedCoaching: "Targeted coaching",
    targetedDescription: "This score measures how well this practice session demonstrated the selected coaching focus.",
    evidence: "Evidence",
    nextStep: "Next step",
    whatWorked: "What worked",
    improveNext: "Improve next",
    priorityFocus: "Priority coaching focus",
    workOnThisNext: "Work on this next",
    priorityDescription: "We identified your first improvement area as the priority. Practice it with two new questions instead of repeating the full interview.",
    perQuestion: "Per-question coaching",
    perQuestionDescription: "See what worked, what was missing, and the exact adjustment to make on your next attempt.",
    whatWasMissing: "What was missing",
    nextAttempt: "Next attempt",
    strengthen: "How to strengthen your answer",
    strengthenDescription: "A short structure to guide your next attempt — not a script to memorize."
  };
  let coachingProgress = null;
  if (isTargeted && record.coaching_focus) { const focusKey = normalizeFocusKey(record.coaching_focus); const { data } = await supabase.from("coaching_progress").select("baseline_score, latest_score, status, evidence").eq("user_id", record.user_id).eq("focus_key", focusKey).maybeSingle(); coachingProgress = data; }
  return <div className="mx-auto max-w-3xl space-y-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Badge className="mb-2">{labels.feedbackReady}</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{record.title}</h1><p className="mt-2 text-muted-foreground">{feedback.summary}</p></div><div className="flex gap-2"><Button variant="outline" asChild><Link href="/dashboard"><ArrowLeft className="h-4 w-4" />{labels.dashboard}</Link></Button><Button asChild><Link href="/prepare"><RotateCcw className="h-4 w-4" />{labels.newSession}</Link></Button></div></div>
    <Card><CardHeader><CardDescription>{labels.overallScore}</CardDescription><CardTitle className="text-5xl">{feedback.overallScore}</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><ScoreRing label={labels.communication} value={feedback.communication} /><ScoreRing label={labels.relevance} value={feedback.relevance} /><ScoreRing label={labels.structure} value={feedback.structure} /><ScoreRing label={labels.confidence} value={feedback.confidence} /></CardContent></Card>
    {isTargeted && record.coaching_focus && <><Card><CardHeader><Badge variant="secondary" className="w-fit">{labels.targetedCoaching}</Badge><CardTitle className="text-base">{record.coaching_focus}</CardTitle><CardDescription>{labels.targetedDescription}</CardDescription></CardHeader><CardContent className="space-y-4">{typeof feedback.focusScore === "number" && <ScoreRing label={isFrench ? "Score du focus" : "Focus score"} value={feedback.focusScore} />}{feedback.focusEvidence && <div className="rounded-lg border bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.evidence}</p><p className="mt-1 text-sm text-slate-700">{feedback.focusEvidence}</p></div>}{feedback.focusNextStep && <div className="rounded-lg border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{labels.nextStep}</p><p className="mt-1 text-sm text-slate-700">{feedback.focusNextStep}</p></div>}</CardContent></Card><CoachingProgressCard progress={coachingProgress} isFrench={isFrench} /></>}
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">{labels.whatWorked}</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-slate-700">{feedback.strengths.map((s) => <li key={s} className="rounded-lg border bg-emerald-50/50 px-3 py-2">{s}</li>)}</ul></CardContent></Card><Card><CardHeader><CardTitle className="text-base">{labels.improveNext}</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm text-slate-700">{feedback.improvements.map((s) => <li key={s} className="rounded-lg border bg-amber-50/50 px-3 py-2">{s}</li>)}</ul></CardContent></Card></div>
    {priorityFocus && <Card><CardHeader><Badge variant="secondary" className="w-fit">{labels.priorityFocus}</Badge><CardTitle className="text-base">{labels.workOnThisNext}</CardTitle><CardDescription>{labels.priorityDescription}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-medium text-slate-800">{priorityFocus}</p><CoachingPracticeButton sourceSessionId={id} focusArea={priorityFocus} isFrench={isFrench} /></CardContent></Card>}
    <Card><CardHeader><CardTitle className="text-base">{labels.perQuestion}</CardTitle><CardDescription>{labels.perQuestionDescription}</CardDescription></CardHeader><CardContent className="space-y-5">{feedback.questionFeedback.map((q, index) => <div key={index} className="rounded-lg border p-4"><div className="flex items-start justify-between gap-3"><p className="font-medium text-slate-900">{q.question}</p><Badge variant="secondary">{q.score}/100</Badge></div><div className="mt-3 space-y-3 text-sm"><div><p className="font-semibold text-slate-900">{labels.whatWorked}</p><p className="mt-1 text-muted-foreground">{q.whatWorked || q.keyStrength || q.comment}</p></div><div><p className="font-semibold text-slate-900">{labels.whatWasMissing}</p><p className="mt-1 text-muted-foreground">{q.whatWasMissing || q.keyImprovement || (isFrench ? "Une démonstration plus précise est nécessaire." : "A more specific demonstration is needed.")}</p></div><div><p className="font-semibold text-slate-900">{labels.nextAttempt}</p><p className="mt-1 text-slate-700">{q.actionableImprovement || q.keyImprovement || (isFrench ? "Renforcez votre réponse avec un exemple concret et un résultat." : "Strengthen the answer with a concrete example and outcome.")}</p></div></div></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">{labels.strengthen}</CardTitle><CardDescription>{labels.strengthenDescription}</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{feedback.sampleRewrite}</p></CardContent></Card>
  </div>;
}
