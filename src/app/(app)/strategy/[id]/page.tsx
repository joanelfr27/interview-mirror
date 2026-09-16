"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, Target } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  async function startInterview() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/interview/${id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.id) throw new Error(data.error || "Could not start interview");
      router.push(`/interview/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start interview");
      setLoading(false);
    }
  }

  const isFrench = session?.preparation_language === "fr";
  const labels = isFrench ? {
    badge: "Votre stratégie",
    title: "Votre plan d'entretien",
    intro: "Voici ce que vous devez faire passer, prouver et défendre.",
    start: "Commencer l'entretien",
    core: "Votre message clé",
    coreHint: "Le message que l'intervieweur doit retenir de vous.",
    prove: "Ce que vous devez prouver",
    proveHint: "Vos 3 priorités pendant l'entretien.",
    examples: "Vos exemples à utiliser",
    examplesHint: "Les expériences réelles à mobiliser pour appuyer vos réponses.",
    risks: "Points à défendre",
    riskHint: "Les écarts ou exigences sur lesquels l'intervieweur peut vous challenger.",
    gapLabel: "Écart à traiter",
    responseLabel: "Comment y répondre",
    empty: "Aucun élément à afficher.",
    startBottom: "Je suis prêt — commencer l'entretien"
  } : {
    badge: "Your strategy",
    title: "Your interview game plan",
    intro: "Here is what you need to communicate, prove, and defend.",
    start: "Start interview",
    core: "Your key message",
    coreHint: "The message the interviewer should remember about you.",
    prove: "What you need to prove",
    proveHint: "Your 3 priorities for the interview.",
    examples: "Examples to use",
    examplesHint: "Real experiences you can use to support your answers.",
    risks: "Points to defend",
    riskHint: "Gaps or requirements the interviewer may challenge.",
    gapLabel: "Gap to address",
    responseLabel: "How to respond",
    empty: "Nothing to show yet.",
    startBottom: "I'm ready — start interview"
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-muted-foreground"><div className="space-y-3 text-center"><div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700"><ShieldCheck className="h-6 w-6" /></div><p className="text-base">{isFrench ? "Préparation de votre stratégie…" : "Building your interview strategy…"}</p></div></div>;

  if (error) return <div className="mx-auto max-w-3xl space-y-6 py-20 text-center"><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{isFrench ? "Stratégie indisponible" : "Interview strategy unavailable"}</h1><p className="text-sm text-muted-foreground">{error}</p><div className="flex justify-center"><Button variant="outline" onClick={() => router.refresh()}>{isFrench ? "Réessayer" : "Retry"}</Button></div></div>;

  const numberedList = (items: string[] | undefined, limit = 3) => items?.length ? (
    <ol className="space-y-4">
      {items.slice(0, limit).map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-3 text-sm leading-6 text-slate-700">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{index + 1}</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  ) : <p className="text-sm text-muted-foreground">{labels.empty}</p>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="mb-3">{labels.badge}</Badge>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{labels.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{labels.intro}</p>
        </div>
        {strategy && <Button size="lg" onClick={startInterview}>{labels.start}<ArrowRight className="h-4 w-4" /></Button>}
      </div>

      {strategy && <div className="space-y-5">
        <Card className="overflow-hidden border-slate-200 bg-slate-50/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Target className="h-5 w-5" />{labels.core}</CardTitle>
            <p className="text-sm text-muted-foreground">{labels.coreHint}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold leading-8 text-slate-950">{strategy.strongestValueProposition}</p>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle>{labels.prove}</CardTitle><p className="text-sm text-muted-foreground">{labels.proveHint}</p></CardHeader>
            <CardContent>{numberedList(strategy.interviewPriorities, 3)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle>{labels.examples}</CardTitle><p className="text-sm text-muted-foreground">{labels.examplesHint}</p></CardHeader>
            <CardContent>{numberedList(strategy.storiesToPrepare, 3)}</CardContent>
          </Card>
        </div>

        {strategy.gapsOrRisks.length > 0 && <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />{labels.risks}</CardTitle>
            <p className="text-sm text-muted-foreground">{labels.riskHint}</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {strategy.gapsOrRisks.slice(0, 3).map((gap, index) => (
              <div key={`${index}-${gap}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.gapLabel}</p>
                <p className="mt-1 text-sm font-medium leading-6 text-slate-900">{gap}</p>
                {strategy.gapDefenseStrategy[index] && <><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.responseLabel}</p><p className="mt-1 text-sm leading-6 text-slate-700">{strategy.gapDefenseStrategy[index]}</p></>}
              </div>
            ))}
          </CardContent>
        </Card>}

        <div className="flex justify-end pt-1"><Button size="lg" onClick={startInterview}>{labels.startBottom}<ArrowRight className="h-4 w-4" /></Button></div>
      </div>}
    </div>
  );
}
