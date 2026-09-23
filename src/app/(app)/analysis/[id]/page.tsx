import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import type { CvAnalysis, SessionRecord } from "@/types";

function canonicalize(value: string): string { return value.normalize("NFKC").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function hash(value: string): string { return `sha256:${createHash("sha256").update(canonicalize(value), "utf8").digest("hex")}`; }
function parseAnalysis(value: unknown): CvAnalysis | null {
  if (typeof value === "string") { try { return JSON.parse(value) as CvAnalysis; } catch { return null; } }
  return value && typeof value === "object" ? value as CvAnalysis : null;
}
function provenanceMatches(analysis: CvAnalysis, record: SessionRecord): boolean {
  const p = analysis.provenance;
  return Boolean(p && p.contract_version === "v5.1" && p.preparation_language === record.preparation_language && p.cv_content_hash === hash(record.cv_text) && p.jd_content_hash === hash(record.job_description));
}

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: session } = await supabase.from("sessions").select("*").eq("id", id).eq("user_id", user?.id ?? "").single();
  if (!session) notFound();
  const record = session as SessionRecord; const analysis = parseAnalysis(record.cv_analysis); const isFrench = record.preparation_language === "fr"; const hasStrategy = Boolean(record.interview_strategy);
  if (!analysis || !provenanceMatches(analysis, record)) return <div className="mx-auto max-w-2xl space-y-4 py-12 text-center"><h1 className="font-display text-2xl font-semibold">{isFrench ? "Analyse à actualiser" : "Analysis needs to be refreshed"}</h1><p className="text-muted-foreground">{isFrench ? "Cette analyse ne correspond plus exactement à votre CV, à l'offre ou à la langue de préparation actuelle." : "This analysis is not verified against the current CV, job description, or preparation language."}</p><Button asChild><Link href={`/prepare?journey=${record.preparation_purpose === "improve_skills" ? "continue_skills" : "continue_upcoming"}&session=${id}&experienceLanguage=${record.experience_language}&interviewLanguage=${record.interview_language}`}>{isFrench ? "Relancer l'analyse" : "Run the analysis again"}</Link></Button></div>;

  const labels = isFrench ? { badge: "Votre profil", fit: "Adéquation au poste", strengths: "Vos points forts", gaps: "Vos points à préparer", focus: "À préparer en priorité", strategyReady: "Stratégie prête", strategyPending: "Stratégie à préparer", review: "Voir la stratégie", build: "Préparer ma stratégie" } : { badge: "Your profile", fit: "Role fit", strengths: "Your strengths", gaps: "Your gaps to prepare for", focus: "Prepare these first", strategyReady: "Strategy ready", strategyPending: "Strategy to prepare", review: "Review strategy", build: "Build my strategy" };
  return <div className="mx-auto max-w-3xl space-y-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Badge className="mb-2">{labels.badge}</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{record.title}</h1><p className="mt-2 text-muted-foreground">{analysis.summary}</p></div><div className="flex flex-col items-start gap-3 sm:items-end"><Badge variant="secondary">{hasStrategy ? labels.strategyReady : labels.strategyPending}</Badge><Button asChild><Link href={`/strategy/${id}`}>{hasStrategy ? labels.review : labels.build}<ArrowRight className="h-4 w-4" /></Link></Button></div></div>
    <Card><CardHeader><div className="text-sm text-muted-foreground">{labels.fit}</div><CardTitle className="flex items-end gap-2 text-4xl">{analysis.matchScore}<span className="pb-1 text-base font-normal text-muted-foreground">/ 100</span></CardTitle></CardHeader><CardContent><Progress value={analysis.matchScore} className="h-3" /></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5" />{labels.strengths}</CardTitle></CardHeader><CardContent><ul className="space-y-3">{analysis.strengths.slice(0, 3).map((item) => <li key={item} className="rounded-lg border px-3 py-2 text-sm text-slate-700">{item}</li>)}</ul></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5" />{labels.gaps}</CardTitle></CardHeader><CardContent><ul className="space-y-3">{analysis.gaps.slice(0, 3).map((item) => <li key={item} className="rounded-lg border px-3 py-2 text-sm text-slate-700">{item}</li>)}</ul></CardContent></Card></div>
    <Card><CardHeader><CardTitle className="text-base">{labels.focus}</CardTitle></CardHeader><CardContent><ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">{analysis.suggestedFocusAreas.slice(0, 3).map((area) => <li key={area}>{area}</li>)}</ol></CardContent></Card>
  </div>;
}
