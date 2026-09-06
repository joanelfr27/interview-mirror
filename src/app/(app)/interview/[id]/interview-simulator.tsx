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

export default function InterviewSimulator({ sessionId }: Props) {
  const router = useRouter();
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("Interview practice");
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setBlockedMessage(null);
    try {
      const res = await fetch(`/api/interview/${sessionId}`);
      const data = await res.json();
      if (!res.ok) {
        const message = data.error || "Failed to load interview";
        setBlockedMessage(message);
        throw new Error(message);
      }

      if (!data.questions || data.questions.length === 0) {
        setBlockedMessage("No questions available. Run analysis first.");
        setLoading(false);
        return;
      }

      setQuestions(data.questions);
      setTitle(data.session?.title || "Interview practice");

      const existing: Record<string, string> = {};
      for (const a of data.answers ?? []) {
        existing[a.question_id] = a.answer_text;
      }
      setAnswers(existing);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const current = questions[index];
  const progress =
    questions.length === 0 ? 0 : ((index + 1) / questions.length) * 100;

  async function saveCurrentAnswer() {
    if (!current) return false;
    const text = answers[current.id]?.trim() ?? "";
    if (!text) {
      toast.error("Write an answer before continuing");
      return false;
    }
    const res = await fetch(`/api/interview/${sessionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: current.id, answerText: text }),
    });
    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Could not save answer");
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
      if (!res.ok) throw new Error(data.error || "Feedback failed");
      toast.success("Feedback ready");
      router.push(`/feedback/${sessionId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Feedback failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Preparing your interview…
      </div>
    );
  }

  if (blockedMessage) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-20 text-center text-slate-800">
        <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-8">
          <p className="text-lg font-semibold">Interview Strategy required</p>
          <p className="text-sm text-slate-700">{blockedMessage}</p>
          <Button asChild>
            <Link href={`/strategy/${sessionId}`}>Build interview strategy</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!current) {
    return <div className="py-16 text-center text-muted-foreground">No questions available. Run analysis first.</div>;
  }

  const isLast = index === questions.length - 1;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Badge variant="secondary" className="mb-2">Interview simulator</Badge>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Question {index + 1} of {questions.length}</p>
        <Progress value={progress} className="mt-4 h-2" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><Badge variant="outline">{current.category}</Badge></div>
          <CardTitle className="text-xl leading-snug">{current.question}</CardTitle>
          <CardDescription>Answer as you would in a live interview. Use concrete evidence from your experience.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={answers[current.id] ?? ""}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))}
            placeholder="Type your answer…"
            className="min-h-[200px]"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="outline" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>Previous</Button>
            {isLast ? (
              <Button onClick={onSubmitAll} disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Generating feedback…</> : <><Send className="h-4 w-4" />Submit & get feedback</>}
              </Button>
            ) : <Button onClick={onNext}>Next question</Button>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
