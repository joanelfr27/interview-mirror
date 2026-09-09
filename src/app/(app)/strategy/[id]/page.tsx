"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
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
    intro: "Voici l'essentiel à préparer avant de commencer l'entretien.",
    start: "Commencer l'entretien",
    positioning: "Votre angle",
    value: "Votre message clé",
    strengths: "Ce que vous devez prouver",
    gaps: "Ce qui peut être challengé",
    priorities: "Vos priorités",
    stories: "Les histoires à préparer",
    questions: "Questions à anticiper",
    empty: "Aucun élément à afficher."
  } : {
    badge: "Your strategy",
    title: "Your interview plan",
    intro: "Here is what matters most to prepare before you start the interview.",
    start: "Start interview",
    positioning: "Your positioning",
    value: "Your key message",
    strengths: "What you need to prove",
    gaps: "What may be challenged",
    priorities: "Your priorities",
    stories: "Stories to prepare",
    questions: "Questions to expect",
    empty: "Nothing to show yet."
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-muted-foreground"><div className="space-y-3 text-center"><div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700"><ShieldCheck className="h-6 w-6" /></div><p className="text-base">{isFrench ? "Préparation de votre stratégie…" : "Building your interview strategy…"}</p></div></div>;

  if (error) return <div className="mx-auto max-w-3xl space-y-6 py-20 text-center"><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{isFrench ? "Stratégie indisponible" : "Interview strategy unavailable"}</h1><p className="text-sm text-muted-foreground">{error}</p><div className="flex justify-center"><Button variant="outline" onClick={() => router.refresh()}>{isFrench ? "Réessayer" : "Retry"}</Button></div></div>;

  const list = (items: string[] | undefined) => items?.length ? <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">{labels.empty}</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><Badge className="mb-2">{labels.badge}</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{labels.title}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.intro}</p></div>
        {strategy && <Button onClick={startInterview}>{labels.start}<ArrowRight className="h-4 w-4" /></Button>}
      </div>

      {strategy && <div className="space-y-4">
        <Card><CardHeader><CardTitle>{labels.positioning}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-700">{strategy.candidatePositioning}</p></CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.value}</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-700">{strategy.strongestValueProposition}</p></CardContent></Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>{labels.strengths}</CardTitle></CardHeader><CardContent>{list(strategy.strengthsToLeverage)}</CardContent></Card>
          <Card><CardHeader><CardTitle>{labels.gaps}</CardTitle></CardHeader><CardContent>{list(strategy.gapsOrRisks)}</CardContent></Card>
        </div>
        <Card><CardHeader><CardTitle>{labels.priorities}</CardTitle></CardHeader><CardContent>{list(strategy.interviewPriorities)}</CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.stories}</CardTitle></CardHeader><CardContent>{list(strategy.storiesToPrepare)}</CardContent></Card>
        <Card><CardHeader><CardTitle>{labels.questions}</CardTitle></CardHeader><CardContent>{list(strategy.likelyDifficultQuestions)}</CardContent></Card>
        <div className="flex justify-end pt-2"><Button size="lg" onClick={startInterview}>{labels.start}<ArrowRight className="h-4 w-4" /></Button></div>
      </div>}
    </div>
  );
}
