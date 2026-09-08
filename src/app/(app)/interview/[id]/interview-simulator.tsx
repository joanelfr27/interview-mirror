"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import type { InterviewQuestion } from "@/types";

type Props = { sessionId: string };
type PreparationLanguage = "en" | "fr";

const labels = {
  en: {
    interviewPractice: "Interview practice",
    failedToLoadInterview: "Failed to load interview",
    noQuestions: "No questions available. Run analysis first.",
    writeAnswer: "Write an answer before continuing",
    couldNotSave: "Could not save answer",
    feedbackFailed: "Feedback failed",
    feedbackReady: "Feedback ready",
    failedToLoad: "Failed to load",
    preparing: "Preparing your interview…",
    strategyRequired: "Interview Strategy required",
    buildStrategy: "Build interview strategy",
    question: "Question",
    answerLive: "Answer as you would in a live interview. Use concrete evidence from your experience.",
    typeAnswer: "Type your answer…",
    previous: "Previous",
    generating: "Generating feedback…",
    submitFeedback: "Submit & get feedback",
    next: "Next question",
  },
  fr: {
    interviewPractice: "Simulation d'entretien",
    failedToLoadInterview: "Impossible de charger l'entretien",
    noQuestions: "Aucune question disponible. Lancez d'abord l'analyse.",
    writeAnswer: "Rédigez une réponse avant de continuer",
    couldNotSave: "Impossible d'enregistrer la réponse",
    feedbackFailed: "Échec de la génération du feedback",
    feedbackReady: "Feedback prêt",
    failedToLoad: "Échec du chargement",
    preparing: "Préparation de votre entretien…",
    strategyRequired: "Stratégie d'entretien requise",
    buildStrategy: "Construire la stratégie d'entretien",
    question: "Question",
    answerLive: "Répondez comme vous le feriez en entretien. Utilisez des preuves concrètes de votre expérience.",
    typeAnswer: "Saisissez votre réponse…",
    previous: "Précédente",
    generating: "Génération du feedback…",
    submitFeedback: "Envoyer et obtenir le feedback",
    next: "Question suivante",
  },
} as const;

export default function InterviewSimulator({ sessionId }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("Interview practice");
  const [preparationLanguage, setPreparationLanguage] = useState<PreparationLanguage>("en");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const t = labels[preparationLanguage];

  const load = useCallback(async () => {
    setLoading(true);
    setBlockedMessage(null);
    try {
      const res = await fetch(`/api/interview/${sessionId}`);
      const data = await res.json();
      if (!res.ok) {
        const message = data.error || t.failedToLoadInterview;
        setBlockedMessage(message);
        throw new Error(message);
      }

      if (!data.questions || data.questions.length === 0) {
        setBlockedMessage(t.noQuestions);
        setLoading(false);
        return;
      }

      setQuestions(data.questions);
      setTitle(data.session?.title || t.interviewPractice);
      setPreparationLanguage(data.session?.preparation_language === "fr" ? "fr" : "en");

      const existing: Record<string, string> = {};
      for (const a of data.answers ?? []) {
        existing[a.question_id] = a.answer_text;
      }
      setAnswers(existing);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.failedToLoad);
    } finally {
      setLoading(false);
    }
  }, [sessionId, t.failedToLoad, t.failedToLoadInterview, t.interviewPractice, t.noQuestions]);

  useEffect(() => {
    load();
  }, [load]);

  const current = questions[index];
  const progress = questions.length === 0 ? 0 : ((index + 1) / questions.length) * 100;

  async function saveCurrentAnswer() {
    if (!current) return false;
    const text = answers[current.id]?.trim() ?? "";
    if (!text) {
      toast.error(t.writeAnswer);
      return false;
    }
    const res = await fetch(`/api/interview/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: current.id, answerText: text }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || t.couldNotSave);
      return false;
    }
    return true;
  }

  async function onNext() {
    const ok = await saveCurrentAnswer();
    if (!ok) return;
    if (index < questions.length - 1) setIndex((i) => i + 1);
  }

  async function onSubmitAll() {
    const ok = await saveCurrentAnswer();
    if (!ok) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/feedback/${sessionId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.feedbackFailed);
      toast.success(t.feedbackReady);
      router.push(`/feedback/${sessionId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.feedbackFailed);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {t.preparing}
      </div>
    );
  }

  if (blockedMessage) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-20 text-center text-slate-800">
        <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-8">
          <p className="text-lg font-semibold">{t.strategyRequired}</p>
          <p className="text-sm text-slate-700">{blockedMessage}</p>
          <Button asChild>
            <Link href={`/strategy/${sessionId}`}>{t.buildStrategy}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!current) {
    return <div className="py-16 text-center text-muted-foreground">{t.noQuestions}</div>;
  }

  const isLast = index === questions.length - 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Badge variant="secondary" className="mb-2">{t.interviewPractice}</Badge>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.question} {index + 1} / {questions.length}</p>
        <Progress value={progress} className="mt-4 h-2" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Badge variant="outline">{current.category}</Badge></div>
          <CardTitle className="text-xl leading-snug">{current.question}</CardTitle>
          <CardDescription>{t.answerLive}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={answers[current.id] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))}
            placeholder={t.typeAnswer}
            className="min-h-[200px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>{t.previous}</Button>
            {isLast ? (
              <Button onClick={onSubmitAll} disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />{t.generating}</> : <><Send className="h-4 w-4" />{t.submitFeedback}</>}
              </Button>
            ) : <Button onClick={onNext}>{t.next}</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
