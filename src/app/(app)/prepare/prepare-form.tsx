"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, Link2, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

async function extractPdfText(file: File) {
  let pdfjslib: any = null;
  try {
    const mod = await import("pdfjs-dist/legacy/build/pdf");
    pdfjslib = mod?.default ?? mod;
  } catch {
    const mod = await import("pdfjs-dist/build/pdf.mjs");
    pdfjslib = mod?.default ?? mod;
  }
  const arrayBuffer = await file.arrayBuffer();
  if (pdfjslib.GlobalWorkerOptions) {
    pdfjslib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjslib.version}/pdf.worker.min.mjs`;
  }
  const loadingTask = pdfjslib.getDocument({ data: arrayBuffer, disableWorker: true });
  const pdf = await loadingTask.promise;
  const content: string[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent();
    content.push(textContent.items.map((item: any) => item.str || "").join(" ").trim());
  }
  return content.filter(Boolean).join("\n\n");
}

type SavedCv = { id: string; file_name: string; cv_text: string; updated_at: string };
type JobDescriptionMode = "paste" | "pdf" | "link";
type PreparationPurpose = "upcoming_interview" | "improve_skills";

export default function PrepareForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState<PreparationPurpose>("upcoming_interview");
  const [hasInterviewDate, setHasInterviewDate] = useState<"yes" | "no">("yes");
  const [interviewDate, setInterviewDate] = useState("");
  const [cvText, setCvText] = useState("");
  const [savedCvs, setSavedCvs] = useState<SavedCv[]>([]);
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [useNewCv, setUseNewCv] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [jobDescriptionUrl, setJobDescriptionUrl] = useState("");
  const [jobDescriptionMode, setJobDescriptionMode] = useState<JobDescriptionMode>("paste");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [loadingCvs, setLoadingCvs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user-cvs");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const cvs = Array.isArray(data.cvs) ? data.cvs : [];
          setSavedCvs(cvs);
          if (!sessionId && cvs[0]) {
            setSelectedCvId(cvs[0].id);
            setCvText(cvs[0].cv_text ?? "");
          }
        }
      } finally {
        if (!cancelled) setLoadingCvs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) {
      setLoadingSession(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error("Session not found");
        const data = await res.json();
        if (cancelled) return;
        setTitle(data.title ?? "");
        setPurpose(data.preparation_purpose === "improve_skills" ? "improve_skills" : "upcoming_interview");
        setInterviewDate(data.interview_date ? String(data.interview_date).slice(0, 10) : "");
        setHasInterviewDate(data.interview_date ? "yes" : "no");
        setCvText(data.cv_text ?? "");
        setJobDescription(data.job_description ?? "");
        setJobDescriptionUrl(data.job_description_url ?? "");
        if (data.job_description_url && !data.job_description) setJobDescriptionMode("link");
      } catch {
        toast.error("Could not load session");
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  function selectSavedCv(id: string) {
    const cv = savedCvs.find((item) => item.id === id);
    if (!cv) return;
    setSelectedCvId(cv.id);
    setUseNewCv(false);
    setCvText(cv.cv_text);
  }

  async function saveNewCv(file: File) {
    const fileName = file.name;
    const fileNameLower = fileName.toLowerCase();
    let text = "";
    if (file.type === "text/plain" || fileNameLower.endsWith(".txt") || fileNameLower.endsWith(".md")) text = await file.text();
    else if (file.type === "application/pdf" || fileNameLower.endsWith(".pdf")) text = await extractPdfText(file);
    if (!text.trim()) {
      toast.error("We could not extract text from this CV. Please paste the CV text instead.");
      return;
    }
    setCvText(text.trim());
    setUseNewCv(true);
    setSelectedCvId(null);
    const res = await fetch("/api/user-cvs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, cvText: text }),
    });
    if (res.ok) {
      const saved = await res.json();
      setSavedCvs((current) => [saved, ...current]);
      setSelectedCvId(saved.id);
      setUseNewCv(false);
      toast.success("New CV saved for future sessions");
    } else toast.error("CV loaded, but could not be saved for future sessions");
  }

  async function onCvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await saveNewCv(file); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not read CV file"); }
  }

  async function onJobDescriptionPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await extractPdfText(file);
      if (!text.trim()) throw new Error("No readable text found in the PDF");
      setJobDescription(text.trim());
      setJobDescriptionMode("pdf");
      toast.success("Job description loaded from PDF");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read JD PDF"); }
  }

  async function onAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (purpose === "upcoming_interview" && hasInterviewDate === "yes" && !interviewDate) {
      toast.error("Please add your interview date");
      return;
    }
    if (!cvText.trim()) {
      toast.error("Please select an existing CV or provide a new CV");
      return;
    }
    if (!jobDescription.trim() && !jobDescriptionUrl.trim()) {
      toast.error("Please paste the job description, upload its PDF, or provide a link");
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
          preparationPurpose: purpose,
          interviewDate: purpose === "upcoming_interview" && hasInterviewDate === "yes" ? interviewDate : null,
          cvText,
          jobDescription,
          jobDescriptionUrl: jobDescriptionUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      toast.success("CV analysis ready");
      router.push(`/analysis/${data.sessionId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally { setLoading(false); }
  }

  if (loadingSession || loadingCvs) return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading your preparation context…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">Prepare your session</h1>
        <p className="mt-1 text-muted-foreground">Tell Interview Mirror what you are preparing for, choose your CV, and provide the job description.</p>
      </div>
      <form onSubmit={onAnalyze} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>What are you preparing for?</CardTitle><CardDescription>We will tailor the preparation to your goal.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3"><input type="radio" name="purpose" value="upcoming_interview" checked={purpose === "upcoming_interview"} onChange={() => { setPurpose("upcoming_interview"); if (!interviewDate) setHasInterviewDate("no"); }} className="mt-1" /><span><span className="font-medium">I have an interview coming up</span><span className="block text-sm text-muted-foreground">We will use the interview date to focus your preparation when it is confirmed.</span></span></label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3"><input type="radio" name="purpose" value="improve_skills" checked={purpose === "improve_skills"} onChange={() => setPurpose("improve_skills")} className="mt-1" /><span><span className="font-medium">I want to improve my interview skills</span><span className="block text-sm text-muted-foreground">No interview date is needed.</span></span></label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Interview details</CardTitle><CardDescription>Give this preparation a clear label and, when relevant, tell us when the interview is.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="title">Session title</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Financial Controller at Acme" /></div>
            {purpose === "upcoming_interview" && <div className="space-y-3"><Label>Do you have an interview date?</Label><div className="flex gap-4"><label className="flex items-center gap-2"><input type="radio" name="has-interview-date" value="yes" checked={hasInterviewDate === "yes"} onChange={() => setHasInterviewDate("yes")} />Yes</label><label className="flex items-center gap-2"><input type="radio" name="has-interview-date" value="no" checked={hasInterviewDate === "no"} onChange={() => { setHasInterviewDate("no"); setInterviewDate(""); }} />No, not confirmed yet</label></div>{hasInterviewDate === "yes" && <div className="space-y-2"><Label htmlFor="interview-date">Interview date</Label><Input id="interview-date" type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} required /></div>}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Your CV</CardTitle><CardDescription>Reuse a saved CV or upload a newer version. Your saved CV stays available for future sessions.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {savedCvs.length > 0 && <div className="space-y-2"><Label htmlFor="saved-cv">Use an existing CV</Label><select id="saved-cv" value={useNewCv ? "new" : selectedCvId ?? ""} onChange={(e) => e.target.value === "new" ? setUseNewCv(true) : selectSavedCv(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{savedCvs.map((cv) => <option key={cv.id} value={cv.id}>{cv.file_name}</option>)}<option value="new">Upload a new CV</option></select></div>}
            {(useNewCv || savedCvs.length === 0) && <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Label htmlFor="cv-file" className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"><FileUp className="h-4 w-4" /> Upload CV</Label><Input id="cv-file" type="file" accept=".txt,.md,.pdf,text/plain,application/pdf" className="hidden" onChange={onCvFileChange} /><span className="text-xs text-muted-foreground">PDF or text file · you can also paste below</span></div>}
            <Textarea value={cvText} onChange={(e) => { setCvText(e.target.value); setUseNewCv(true); setSelectedCvId(null); }} placeholder="Your CV text…" className="min-h-[220px]" required />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Job description</CardTitle><CardDescription>Use the option that is easiest for you. Pasted text and PDF are reliable; links are read when possible and otherwise you will be asked to paste or upload the JD.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2"><Button type="button" variant={jobDescriptionMode === "paste" ? "default" : "outline"} onClick={() => setJobDescriptionMode("paste")}>Paste text</Button><Button type="button" variant={jobDescriptionMode === "pdf" ? "default" : "outline"} onClick={() => setJobDescriptionMode("pdf")}>Upload PDF</Button><Button type="button" variant={jobDescriptionMode === "link" ? "default" : "outline"} onClick={() => setJobDescriptionMode("link")}><Link2 className="h-4 w-4" /> Link</Button></div>
            {jobDescriptionMode === "paste" && <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the full job description here…" className="min-h-[240px]" />}
            {jobDescriptionMode === "pdf" && <div className="space-y-3"><Label htmlFor="jd-pdf" className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"><FileUp className="h-4 w-4" /> Choose JD PDF</Label><Input id="jd-pdf" type="file" accept=".pdf,application/pdf" className="hidden" onChange={onJobDescriptionPdf} />{jobDescription && <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} className="min-h-[240px]" />}</div>}
            {jobDescriptionMode === "link" && <div className="space-y-3"><Label htmlFor="jd-url">Job posting link</Label><Input id="jd-url" type="url" value={jobDescriptionUrl} onChange={(e) => setJobDescriptionUrl(e.target.value)} placeholder="https://company.com/jobs/financial-controller" /><p className="text-xs text-muted-foreground">We will try to read the page. If it cannot be read reliably, paste the JD or upload its PDF instead.</p>{jobDescription && <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} className="min-h-[180px]" placeholder="Optional: paste the JD here as a fallback…" />}</div>}
          </CardContent>
        </Card>
        <div className="flex justify-end"><Button type="submit" size="lg" disabled={loading}>{loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Analyze with AI</>}</Button></div>
      </form>
    </div>
  );
}
