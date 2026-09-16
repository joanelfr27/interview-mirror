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
    intro: "Le Professional Mirror a analysé votre profil pour ce poste. Voici ce que vous devez démontrer durant l'entretien et les points qui nécessitent une attention particulière.",
    start: "Commencer l'entretien",
    keyMessage: "Votre message clé",
    keyHint: "Ce que l'intervieweur doit retenir de votre profil.",
    priorities: "Ce que vous devez démontrer durant l'entretien",
    risks: "Points d'attention",
    gapLabel: "Point d'attention",
    responseLabel: "Comment y répondre",
    profile: "Profil",
    strategy: "Stratégie",
    interview: "Entretien",
    feedback: "Feedback",
    retest: "Retest",
    ready: "Votre stratégie est prête. L'entretien va maintenant tester ce que vous devez démontrer.",
    startBottom: "Je suis prêt — commencer l'entretien",
    empty: "Aucun élément à afficher."
  } : {
    badge: "Your strategy",
    title: "Your interview game plan",
    intro: "The Professional Mirror has analysed your profile for this role. Here is what you need to demonstrate during the interview and which points need particular attention.",
    start: "Start interview",
    keyMessage: "Your key message",
    keyHint: "What the interviewer should remember about your profile.",
    priorities: "What you need to demonstrate during the interview",
    risks: "Points to watch",
    gapLabel: "Point to watch",
    responseLabel: "How to respond",
    profile: "Profile",
    strategy: "Strategy",
    interview: "Interview",
    feedback: "Feedback",
    retest: "Retest",
    ready: "Your strategy is ready. The interview will now test what you need to demonstrate.",
    startBottom: "I'm ready — start interview",
    empty: "Nothing to show yet."
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

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium sm:gap-3">
          {[labels.profile, labels.strategy, labels.interview, labels.feedback, labels.retest].map((step, index) => (
            <div key={step} className="flex items-center gap-2">
              <span className={index === 1 ? "rounded-full bg-slate-900 px-3 py-1.5 text-white" : "rounded-full bg-slate-100 px-3 py-1.5 text-slate-600"}>{step}</span>
              {index < 4 && <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
            </div>
          ))}
        </div>
      </div>

      {strategy && <div className="space-y-5">
        <Card className="overflow-hidden border-slate-200 bg-slate-50/80">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg"><Target className="h-5 w-5" />{labels.keyMessage}</CardTitle>
            <p className="text-sm text-muted-foreground">{labels.keyHint}</p>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold leading-8 text-slate-950 sm:text-2xl">{strategy.strongestValueProposition}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>{labels.priorities}</CardTitle></CardHeader>
          <CardContent>{numberedList(strategy.interviewPriorities, 3)}</CardContent>
        </Card>

        {strategy.gapsOrRisks.length > 0 && <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />{labels.risks}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {strategy.gapsOrRisks.slice(0, 3).map((gap, index) => (
              <div key={`${index}-${gap}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.gapLabel}</p>
                    <p className="mt-1 text-sm font-medium leading-6 text-slate-900">{gap}</p>
                    {strategy.gapDefenseStrategy[index] && <><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.responseLabel}</p><p className="mt-1 text-sm leading-6 text-slate-700">{strategy.gapDefenseStrategy[index]}</p></>}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>}

        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 sm:flex-row">
          <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 shrink-0 text-slate-600" /><p className="text-sm leading-6 text-slate-700">{labels.ready}</p></div>
          <Button size="lg" onClick={startInterview}>{labels.startBottom}<ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>}
    </div>
  );
}
