import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/server";
import type { CvAnalysis, SessionRecord } from "@/types";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: session } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "").single();
  if (!session) notFound();
  const record = session as SessionRecord;
  const analysis = record.cv_analysis as CvAnalysis | null;
  const hasStrategy = Boolean(record.interview_strategy);
  const isFrench = record.preparation_language === "fr";
  if (!analysis) return <div className="mx-auto max-w-2xl space-y-4 text-center"><h1 className="font-display text-2xl font-semibold">{isFrench ? "Analyse non disponible" : "Analysis not ready"}</h1><p className="text-muted-foreground">{isFrench ? "Lancez l'analyse depuis la page de préparation." : "Run an AI analysis from the prepare page first."}</p><Button asChild><Link href={`/prepare?session=${id}`}>{isFrench ? "Retour à la préparation" : "Go to prepare"}</Link></Button></div>;

  const labels = isFrench ? {
    badge: "Votre profil",
    intro: "Voici ce que votre CV montre par rapport à cette offre. Utilisez cette analyse pour savoir où vous êtes fort, où l'intervieweur peut vous challenger et quoi préparer.",
    strategyReady: "Stratégie prête",
    strategyPending: "Stratégie à préparer",
    reviewStrategy: "Voir la stratégie",
    buildStrategy: "Préparer ma stratégie",
    fit: "Adéquation au poste",
    strongMatches: "Vos points forts",
    gaps: "Vos points à préparer",
    why: "Pourquoi cette analyse ?",
    whyDesc: "Chaque point relie une exigence du poste à ce que votre CV permet réellement de démontrer.",
    requirement: "Ce que le poste demande",
    evidence: "Ce que votre CV démontre",
    gap: "Ce qui manque ou reste à démontrer",
    interview: "Ce que l'intervieweur peut tester",
    action: "Ce que vous devez préparer",
    matches: "Ce qui correspond",
    matchesDesc: "Les thèmes communs entre votre CV et l'offre.",
    focus: "À préparer en priorité"
  } : {
    badge: "Your profile",
    intro: "Here is what your CV shows against this job. Use this analysis to see where you are strong, where the interviewer may challenge you, and what to prepare.",
    strategyReady: "Strategy ready",
    strategyPending: "Strategy to prepare",
    reviewStrategy: "Review strategy",
    buildStrategy: "Build my strategy",
    fit: "Role fit",
    strongMatches: "Your strengths",
    gaps: "Your gaps to prepare for",
    why: "Why we say this",
    whyDesc: "Each point connects a job requirement to what your CV actually demonstrates.",
    requirement: "What the job requires",
    evidence: "What your CV demonstrates",
    gap: "What is missing or needs proof",
    interview: "What the interviewer may test",
    action: "What you should prepare",
    matches: "What matches",
    matchesDesc: "Common themes across your CV and the job description.",
    focus: "Prepare these first"
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Badge className="mb-2">{labels.badge}</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{record.title}</h1><p className="mt-2 text-muted-foreground">{analysis.summary || labels.intro}</p></div><div className="flex flex-col items-start gap-3 sm:items-end"><Badge variant="secondary">{hasStrategy ? labels.strategyReady : labels.strategyPending}</Badge><Button asChild><Link href={`/strategy/${id}`}>{hasStrategy ? labels.reviewStrategy : labels.buildStrategy}<ArrowRight className="h-4 w-4" /></Link></Button></div></div>
      <Card><CardHeader><CardDescription>{labels.fit}</CardDescription><CardTitle className="flex items-end gap-2 text-4xl">{analysis.matchScore}<span className="pb-1 text-base font-normal text-muted-foreground">/ 100</span></CardTitle></CardHeader><CardContent><Progress value={analysis.matchScore} className="h-3" /></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-600" />{labels.strongMatches}</CardTitle></CardHeader><CardContent><ul className="space-y-3">{analysis.strengths.map((item) => <li key={item} className="rounded-lg border bg-emerald-50/50 px-3 py-2 text-sm text-slate-700">{item}</li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-600" />{labels.gaps}</CardTitle></CardHeader><CardContent><ul className="space-y-3">{analysis.gaps.map((item) => <li key={item} className="rounded-lg border bg-amber-50/50 px-3 py-2 text-sm text-slate-700">{item}</li>)}</ul></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">{labels.why}</CardTitle><CardDescription>{labels.whyDesc}</CardDescription></CardHeader><CardContent className="space-y-4">{analysis.evidenceChain.map((item, index) => <div key={`${item.jd_requirement}-${index}`} className="rounded-lg border p-4 space-y-2"><div className="text-sm"><span className="font-semibold">{labels.requirement}:</span> {item.jd_requirement}</div><div className="text-sm"><span className="font-semibold">{labels.evidence}:</span> {item.cv_evidence}</div><div className="text-sm"><span className="font-semibold">{labels.gap}:</span> {item.gap_identified}</div><div className="text-sm"><span className="font-semibold">{labels.interview}:</span> {item.interview_implication}</div><div className="text-sm"><span className="font-semibold">{labels.action}:</span> {item.actionable_recommendation}</div></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">{labels.matches}</CardTitle><CardDescription>{labels.matchesDesc}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{analysis.keywordAlignment.map((kw) => <Badge key={kw} variant="secondary">{kw}</Badge>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">{labels.focus}</CardTitle></CardHeader><CardContent><ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">{analysis.suggestedFocusAreas.map((area) => <li key={area}>{area}</li>)}</ol></CardContent></Card>
    </div>
  );
}
