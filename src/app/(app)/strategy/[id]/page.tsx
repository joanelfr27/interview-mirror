"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { InterviewStrategy, SessionRecord } from "@/types";

type StrategyResponse = {
  strategy?: InterviewStrategy;
  error?: string;
};

type SessionResponse = {
  session?: SessionRecord;
  error?: string;
};

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
        if (!sessionRes.ok || !sessionData.session) {
          throw new Error(sessionData.error || "Could not load session");
        }
        if (cancelled) return;
        setSession(sessionData.session);

        if (sessionData.session.interview_strategy) {
          setStrategy(sessionData.session.interview_strategy);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load session");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleGenerate() {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/strategy/${id}`);
      const data = (await res.json()) as StrategyResponse;
      if (!res.ok || !data.strategy) {
        throw new Error(data.error || "Could not generate strategy");
      }
      setStrategy(data.strategy);
      toast.success("Interview strategy ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Strategy generation failed");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <div className="space-y-3 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="text-base">Loading your interview strategy…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-20 text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">
          Interview Strategy unavailable
        </h1>
        <p className="text-sm text-muted-foreground">{error}</p>
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => router.refresh()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge className="mb-2">Interview strategy</Badge>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">
            Your interview game plan
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            This strategy is built from your CV, the job description, and your Professional Mirror analysis. It guides which questions you should expect, the stories you should prepare, and how to defend your gaps.
          </p>
        </div>
        {strategy && (
          <Button asChild>
            <Link href={`/interview/${id}`}>
              Continue to interview
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      {session?.cv_analysis && (
        <Card>
          <CardHeader>
            <CardTitle>Professional Mirror summary</CardTitle>
            <CardDescription>
              Your strategy is grounded in this analysis from your CV and the job description.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-700">{session.cv_analysis.summary}</p>
          </CardContent>
        </Card>
      )}

      {!strategy ? (
        <Card>
          <CardHeader>
            <CardTitle>Generate your strategy</CardTitle>
            <CardDescription>
              Build a strategy that turns your strengths, risks, and stories into a clear interview plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-slate-700">
                This strategy is required before your interview can be generated. It will influence the questions and ensure the practice is aligned with your strongest evidence and the role&apos;s risks.
              </p>
              <Button size="lg" onClick={handleGenerate}>
                Generate strategy
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Candidate positioning</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">{strategy.candidatePositioning}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Strongest value proposition</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">{strategy.strongestValueProposition}</p>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Key strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                  {strategy.strengthsToLeverage.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gaps and risks</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                  {strategy.gapsOrRisks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Gap-defense strategy</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                {strategy.gapDefenseStrategy.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interview priorities</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                {strategy.interviewPriorities.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Likely difficult questions</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                {strategy.likelyDifficultQuestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stories to prepare</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
                {strategy.storiesToPrepare.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Communication priorities</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">{strategy.communicationPriorities}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interview plan</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">{strategy.interviewPlan}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personalization</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">{strategy.personalization}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
