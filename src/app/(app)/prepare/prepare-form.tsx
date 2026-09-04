"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
async function extractPdfText(file: File) {
  // Dynamically import pdf.js at runtime; try legacy build first, then fall back to main build
  let pdfjslib: any = null;
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf");
    pdfjslib = (mod && (mod as any).default) ? (mod as any).default : mod;
  } catch (e) {
    try {
      const mod = await import("pdfjs-dist/build/pdf.mjs");
      pdfjslib = (mod && (mod as any).default) ? (mod as any).default : mod;
    } catch (err) {
      throw new Error("Could not load pdfjs-dist module: " + (err instanceof Error ? err.message : String(err)));
    }
  }

  const arrayBuffer = await file.arrayBuffer();

  try {
    if (pdfjslib.GlobalWorkerOptions) {
      (pdfjslib as any).GlobalWorkerOptions.workerSrc =`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjslib as any).version}/pdf.worker.min.mjs`;
    }
  } catch (e) {
    // ignore
  }

  if (!pdfjslib || typeof pdfjslib.getDocument !== "function") {
    throw new Error("Imported pdfjs does not expose getDocument");
  }

  const loadingTask = pdfjslib.getDocument({ data: arrayBuffer, disableWorker: true } as any);
  const pdf = await loadingTask.promise;
  const content: string[] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str || "")
      .join(" ");
    content.push(pageText.trim());
  }

  return content.filter(Boolean).join("\n\n");
}

export default function PrepareForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [title, setTitle] = useState("");
  const [cvText, setCvText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error("Session not found");
        const data = await res.json();
        if (cancelled) return;
        setTitle(data.title ?? "");
        setCvText(data.cv_text ?? "");
        setJobDescription(data.job_description ?? "");
      } catch {
        toast.error("Could not load session");
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isTextFile =
      file.type === "text/plain" ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".md");
    const isPdfFile =
      file.type === "application/pdf" || fileName.endsWith(".pdf");

    if (isTextFile) {
      const text = await file.text();
      setCvText(text);
      toast.success("CV loaded from file");
      return;
    }

    if (isPdfFile) {
      try {
          const text = await extractPdfText(file);
        if (text.trim().length > 0) {
          setCvText(text);
          toast.success("CV content loaded from PDF");
          return;
        }
      } catch (err) {
        // surface error to console for easier debugging
        // eslint-disable-next-line no-console
        console.error("PDF extraction error:", err);
        toast.message("Paste your CV text below", {
          description: "PDF text extraction failed. Paste the text content instead.",
        });
        return;
      }
    }

    // For PDF/DOCX we accept paste-as-text as primary path; attempt text extract for other types
    try {
      const text = await file.text();
      if (text && !text.includes("\u0000") && text.length > 40) {
        setCvText(text);
        toast.success("CV content loaded");
      } else {
        toast.message("Paste your CV text below", {
          description:
            "Binary formats work best when you paste the text content.",
        });
      }
    } catch {
      toast.message("Paste your CV text below");
    }
  }

  async function onAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!cvText.trim() || !jobDescription.trim()) {
      toast.error("Please provide both your CV and the job description");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          title: title || "Interview preparation",
          cvText,
          jobDescription,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      toast.success("CV analysis ready");
      router.push(`/analysis/${data.sessionId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading session…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">
          Prepare your session
        </h1>
        <p className="mt-1 text-muted-foreground">
          Upload your CV and paste the job description for a tailored analysis.
        </p>
      </div>

      <form onSubmit={onAnalyze} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Session details</CardTitle>
            <CardDescription>
              Give this preparation a clear label so you can find it later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Senior PM at Acme"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your CV</CardTitle>
            <CardDescription>
              Upload a text file or paste the content of your résumé.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Label
                htmlFor="cv-file"
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <FileUp className="h-4 w-4" />
                Upload file
              </Label>
              <Input
                id="cv-file"
                type="file"
                accept=".txt,.md,.pdf,.doc,.docx,text/plain"
                className="hidden"
                onChange={onFileChange}
              />
              <span className="text-xs text-muted-foreground">
                .txt / .md preferred · paste works for any format
              </span>
            </div>
            <Textarea
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
              placeholder="Paste your CV text here…"
              className="min-h-[220px]"
              required
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job description</CardTitle>
            <CardDescription>
              Paste the full posting so we can map your evidence to the role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste the job description here…"
              className="min-h-[220px]"
              required
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Analyze with AI
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
