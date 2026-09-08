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
  if (!analysis) return <div className="mx-auto max-w-2xl space-y-4 text-center"><h1 className="font-display text-2xl font-semibold">Analysis not ready</h1><p className="text-muted-foreground">Run an AI analysis from the prepare page first.</p><Button asChild><Link href={`/prepare?session=${id}`}>Go to prepare</Link></Button></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Badge className="mb-2">CV analysis</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{record.title}</h1><p className="mt-2 text-muted-foreground">{analysis.summary}</p></div><div className="flex flex-col items-start gap-3 sm:items-end"><Badge variant="secondary">{hasStrategy ? "Strategy ready" : "Strategy pending"}</Badge><Button asChild><Link href={`/strategy/${id}`}>{hasStrategy ? "Review strategy" : "Build interview strategy"}<ArrowRight className="h-4 w-4" /></Link></Button></div></div>
      <Card><CardHeader><CardDescription>Role alignment score</CardDescription><CardTitle className="flex items-end gap-2 text-4xl">{analysis.matchScore}<span className="pb-1 text-base font-normal text-muted-foreground">/ 100</span></CardTitle></CardHeader><CardContent><Progress value={analysis.matchScore} className="h-3" /></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Strengths</CardTitle></CardHeader><CardContent><ul className="space-y-3">{analysis.strengths.map((item) => <li key={item} className="rounded-lg border bg-emerald-50/50 px-3 py-2 text-sm text-slate-700">{item}</li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-600" />Gaps to address</CardTitle></CardHeader><CardContent><ul className="space-y-3">{analysis.gaps.map((item) => <li key={item} className="rounded-lg border bg-amber-50/50 px-3 py-2 text-sm text-slate-700">{item}</li>)}</ul></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle className="text-base">Evidence chain</CardTitle><CardDescription>Every preparation action should connect a job requirement to evidence in your CV, the interview implication, and a specific next action.</CardDescription></CardHeader><CardContent className="space-y-4">{analysis.evidenceChain.map((item, index) => <div key={`${item.jd_requirement}-${index}`} className="rounded-lg border p-4 space-y-2"><div className="text-sm"><span className="font-semibold">JD requirement:</span> {item.jd_requirement}</div><div className="text-sm"><span className="font-semibold">CV evidence:</span> {item.cv_evidence}</div><div className="text-sm"><span className="font-semibold">Gap:</span> {item.gap_identified}</div><div className="text-sm"><span className="font-semibold">Interview implication:</span> {item.interview_implication}</div><div className="text-sm"><span className="font-semibold">Action:</span> {item.actionable_recommendation}</div></div>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Keyword alignment</CardTitle><CardDescription>Themes identified across the supplied CV and job description.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{analysis.keywordAlignment.map((kw) => <Badge key={kw} variant="secondary">{kw}</Badge>)}</CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Suggested focus areas</CardTitle></CardHeader><CardContent><ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">{analysis.suggestedFocusAreas.map((area) => <li key={area}>{area}</li>)}</ol></CardContent></Card>
    </div>
  );
}
