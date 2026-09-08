"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { InterviewStrategy, SessionRecord } from "@/types";

type StrategyResponse = { strategy?: InterviewStrategy; error?: string };
type SessionResponse = SessionRecord;

export default function StrategyPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [strategy, setStrategy] = useState<InterviewStrategy | null>(null);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const sessionRes = await fetch(`/api/sessions/${id}`);
        const sessionData = (await sessionRes.json()) as SessionResponse;
        if (!sessionRes.ok || !sessionData) throw new Error("Could not load session");
        if (cancelled) return;
        setSession(sessionData);

        const strategyRes = await fetch(`/api/strategy/${id}`);
        const strategyData = (await strategyRes.json()) as StrategyResponse;
        if (!strategyRes.ok || !strategyData.strategy) throw new Error(strategyData.error || "Could not load strategy");
        if (cancelled) return;
        setStrategy(strategyData.strategy);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load strategy");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function handleGenerate() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/strategy/${id}`);
      const data = (await res.json()) as StrategyResponse;
      if (!res.ok || !data.strategy) throw new Error(data.error || "Could not generate strategy");
      setStrategy(data.strategy);
      toast.success(session?.preparation_language === "fr" ? "Votre stratégie est prête" : "Interview strategy ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Strategy generation failed");
    } finally {
      setLoading(false);
    }
  }

  const isFrench = session?.preparation_language === "fr";
  const labels = isFrench ? {
    badge: "Votre stratégie",
    title: "Votre plan d'entretien",
    intro: "Cette stratégie transforme votre diagnostic en plan de préparation : comment vous présenter, quoi mettre en avant, quels écarts préparer et quelles questions anticiper.",
    continue: "Commencer l'entretien",
    mirror: "Résumé de votre diagnostic",
    mirrorDesc: "Votre stratégie s'appuie sur l'analyse de votre CV et de cette offre.",
    generate: "Préparer ma stratégie",
    generateDesc: "Transformez vos points forts, vos écarts et vos preuves en plan d'entretien.",
    position: "Comment vous positionner",
    value: "Votre message clé",
    strengths: "Vos points forts",
    gaps: "Vos points de vigilance",
    defend: "Comment gérer vos écarts",
    priorities: "À préparer en priorité",
    questions: "Questions à anticiper",
    stories: "Histoires à préparer",
    communication: "Comment répondre",
    plan: "Votre plan de préparation",
    rules: "Vos règles pour l'entretien"
  } : {
    badge: "Your strategy",
    title: "Your interview plan",
    intro: "This strategy turns your diagnostic into a preparation plan: how to position yourself, what to highlight, which gaps to prepare for, and which questions to expect.",
    continue: "Start interview",
    mirror: "Your diagnostic summary",
    mirrorDesc: "Your strategy is based on the analysis of your CV and this job description.",
    generate: "Build my strategy",
    generateDesc: "Turn your strengths, gaps, and evidence into a clear interview plan.",
    position: "How to position yourself",
    value: "Your key message",
    strengths: "Your strengths",
    gaps: "Your watch-outs",
    defend: "How to handle your gaps",
    priorities: "Prepare these first",
    questions: "Questions to expect",
    stories: "Stories to prepare",
    communication: "How to answer",
    plan: "Your preparation plan",
    rules: "Your interview rules"
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-muted-foreground"><div className="space-y-3 text-center"><div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700"><ShieldCheck className="h-6 w-6" /></div><p className="text-base">{isFrench ? "Préparation de votre stratégie…" : "Building your interview strategy…"}</p></div></div>;

  if (error) return <div className="mx-auto max-w-3xl space-y-6 py-20 text-center"><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{isFrench ? "Stratégie indisponible" : "Interview strategy unavailable"}</h1><p className="text-sm text-muted-foreground">{error}</p><div className="flex justify-center"><Button variant="outline" onClick={() => router.refresh()}>{isFrench ? "Réessayer" : "Retry"}</Button></div></div>;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Badge className="mb-2">{labels.badge}</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{labels.title}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.intro}</p></div>
        {strategy && <Button onClick={async () => { try { setLoading(true); setError(null); const res = await fetch(`/api/interview/${id}`, { method: "POST" }); const data = await res.json(); if (!res.ok || !data.id) throw new Error(data.error || "Could not start interview"); router.push(`/interview/${data.id}`); } catch (err) { setError(err instanceof Error ? err.message : "Could not start interview"); setLoading(false); } }}>{labels.continue}<ArrowRight className="h-4 w-4" /></Button>}
      </div>

      {session?.cv_analysis && <Card><CardHeader><CardTitle>{labels.mirror}</CardTitle><CardDescription>{labels.mirrorDesc}</CardDescription></CardHeader><CardContent><p className="text-sm text-slate-700">{session.cv_analysis.summary}</p></CardContent></Card>}

      {!strategy ? <Card><CardHeader><CardTitle>{labels.generate}</CardTitle><CardDescription>{labels.generateDesc}</CardDescription></CardHeader><CardContent><div className="space-y-4"><Button size="lg" onClick={handleGenerate}>{labels.generate}<ChevronRight className="h-4 w-4" /></Button></div></CardContent></Card> : <div className="space-y-4">
        <Card><CardHeader><CardTitle>{labels.position}</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700">{strategy.candidatePositioning}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.value}</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700">{strategy.strongestValueProposition}</p></CardContent></Card>
        <div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>{labels.strengths}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{strategy.strengthsToLeverage.map((item) => <li key={item}>{item}</li>)}</ul></CardContent></Card><Card><CardHeader><CardTitle>{labels.gaps}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{strategy.gapsOrRisks.map((item) => <li key={item}>{item}</li>)}</ul></CardContent></Card></div>
        <Card><CardHeader><CardTitle>{labels.defend}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{strategy.gapDefenseStrategy.map((item) => <li key={item}>{item}</li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.priorities}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{strategy.interviewPriorities.map((item) => <li key={item}>{item}</li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.questions}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{strategy.likelyDifficultQuestions.map((item) => <li key={item}>{item}</li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.stories}</CardTitle></CardHeader><CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">{strategy.storiesToPrepare.map((item) => <li key={item}>{item}</li>)}</ul></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.communication}</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700">{strategy.communicationPriorities}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.plan}</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700">{strategy.interviewPlan}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.rules}</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700">{strategy.personalization}</p></CardContent></Card>
      </div>}
    </div>
  );
}
