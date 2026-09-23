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
import { isJourney, purposeForJourney, type PreparationPurpose } from "@/lib/journey";
import { buildIngestedDocument, extractPdfText, extractWordText } from "@/lib/universal-ingestion";

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
import { isJourney, purposeForJourney, type PreparationPurpose } from "@/lib/journey";
import { extractWordText } from "@/lib/universal-ingestion";

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

type SavedCv = { id: string; file_name: string; cv_text: string; updated_at: string; historical?: boolean };
type JobDescriptionMode = "paste" | "pdf" | "word" | "link";
type CvSourceMode = "paste" | "file" | "link";
export default function PrepareForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const journey = searchParams.get("journey");
  const initialExperienceLanguage = searchParams.get("experienceLanguage");
  const initialInterviewLanguage = searchParams.get("interviewLanguage");
  const [title, setTitle] = useState("");
  const [experienceLanguage, setExperienceLanguage] = useState<"en" | "fr">("en");
  const [interviewLanguage, setInterviewLanguage] = useState<"en" | "fr">("en");
  const [purpose, setPurpose] = useState<PreparationPurpose>("upcoming_interview");
  const [interviewDate, setInterviewDate] = useState("");
  const [cvText, setCvText] = useState("");
  const [savedCvs, setSavedCvs] = useState<SavedCv[]>([]);
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [useNewCv, setUseNewCv] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [jobDescriptionUrl, setJobDescriptionUrl] = useState("");
  const [jobDescriptionMode, setJobDescriptionMode] = useState<JobDescriptionMode>("paste");
  const [cvSourceMode, setCvSourceMode] = useState<CvSourceMode>("paste");
  const [cvUrl, setCvUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(Boolean(sessionId));
  const [loadingCvs, setLoadingCvs] = useState(true);
  const [journeyValidated, setJourneyValidated] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isJourney(journey)) {
      router.replace("/journey");
      return;
    }
    setJourneyValidated(true);
  }, [journey, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user-cvs");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          const cvs = Array.isArray(data.cvs) ? data.cvs : [];
          const historicalCvs = Array.isArray(data.historicalCvs) ? data.historicalCvs : [];
          const reusableCvs = [...cvs, ...historicalCvs];
          setSavedCvs(reusableCvs);
          if (!sessionId && reusableCvs[0]) {
            setSelectedCvId(reusableCvs[0].id);
            setCvText(reusableCvs[0].cv_text ?? "");
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
      if (!isJourney(journey)) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) throw new Error("Session not found");
        const data = await res.json();
        if (cancelled) return;
        const expectedPurpose = purposeForJourney(journey);
        const loadedPurpose = data.preparation_purpose === "improve_skills" ? "improve_skills" : "upcoming_interview";
        if (loadedPurpose !== expectedPurpose) {
          setSessionError("This session does not match the selected preparation journey. Please return to your journey and choose the correct session.");
          return;
        }
        setSessionError(null);
        setTitle(data.title ?? "");
        setExperienceLanguage(data.experience_language === "fr" ? "fr" : data.preparation_language === "fr" ? "fr" : "en");
        setInterviewLanguage(data.interview_language === "fr" ? "fr" : data.preparation_language === "fr" ? "fr" : "en");
        setPurpose(data.preparation_purpose === "improve_skills" ? "improve_skills" : "upcoming_interview");
        setInterviewDate(data.interview_date ? String(data.interview_date).slice(0, 10) : "");
        setCvText(data.cv_text ?? "");
        setJobDescription(data.job_description ?? "");
        setJobDescriptionUrl(data.job_description_url ?? "");
        if (data.job_description_url && !data.job_description) setJobDescriptionMode("link");
      } catch {
        setSessionError("Session not found or expired. Please return to your journey and choose another preparation session.");
        toast.error("Could not load session");
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  useEffect(() => {
    if (sessionId) return;
    if (initialExperienceLanguage === "fr" || initialExperienceLanguage === "en") setExperienceLanguage(initialExperienceLanguage);
    if (initialInterviewLanguage === "fr" || initialInterviewLanguage === "en") setInterviewLanguage(initialInterviewLanguage);
    if (isJourney(journey)) setPurpose(purposeForJourney(journey));
  }, [sessionId, journey, initialExperienceLanguage, initialInterviewLanguage]);

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
    else if (file.type === "application/pdf" || fileNameLower.endsWith(".pdf")) text = (await buildIngestedDocument(await extractPdfText(file), "pdf", fileName)).text;
    else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileNameLower.endsWith(".docx")) text = (await buildIngestedDocument(await extractWordText(file), "word", fileName)).text;
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

  async function onCvLink() {
    if (!cvUrl.trim()) return;
    try {
      const res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: cvUrl.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read CV link");
      setCvText(data.text);
      setUseNewCv(true); setSelectedCvId(null);
      toast.success("CV loaded from link");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read CV link"); }
  }

  async function onCvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await saveNewCv(file); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not read CV file"); }
  }

  async function onJobDescriptionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      const text = lower.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? (await buildIngestedDocument(await extractWordText(file), "word", file.name)).text
        : (await buildIngestedDocument(await extractPdfText(file), "pdf", file.name)).text;
      setJobDescription(text.trim());
      setJobDescriptionMode(lower.endsWith(".docx") ? "word" : "pdf");
      toast.success("Job description loaded");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read JD PDF"); }
  }

  async function onJobDescriptionLink() {
    if (!jobDescriptionUrl.trim()) return;
    try {
      const res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: jobDescriptionUrl.trim() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read job description link");
      setJobDescription(data.text);
      toast.success("Job description loaded from link");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not read job description link"); }
  }

  async function onAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (sessionId && sessionError) {
      toast.error(sessionError);
      return;
    }
    if (!isJourney(journey)) {
      toast.error("Please choose a preparation journey");
      router.replace("/journey");
      return;
    }
    const expectedPurpose = purposeForJourney(journey);
    if (purpose !== expectedPurpose) {
      toast.error("The preparation journey determines the preparation purpose");
      return;
    }
    if ((journey === "continue_upcoming" || journey === "continue_skills") && !sessionId) {
      toast.error("A preparation session is required to continue");
      return;
    }
    if (journey === "new_opportunity" && sessionId) {
      toast.error("A new opportunity must start a fresh preparation session");
      return;
    }
    if (!cvText.trim()) {
      toast.error("Please select an existing CV or provide a new CV");
      return;
    }
    if (purpose === "upcoming_interview" && !jobDescription.trim() && !jobDescriptionUrl.trim()) {
      toast.error("Please paste the job description, upload its PDF, or provide a link");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: journey === "new_opportunity" ? null : sessionId,
          journey,
          title: title || "Interview preparation",
          experience_language: experienceLanguage,
          interview_language: interviewLanguage,
          preparation_language: experienceLanguage,
          preparationPurpose: purpose,
          interviewDate: purpose === "upcoming_interview" ? interviewDate : null,
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

  if (!journeyValidated) return <div className="py-24 text-center text-muted-foreground">Redirecting to your preparation journey…</div>;
  if (loadingSession || loadingCvs) return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading your preparation context…</div>;
  if (sessionError) return <div className="mx-auto max-w-2xl py-24 text-center"><h1 className="text-2xl font-semibold text-slate-900">Preparation session unavailable</h1><p className="mt-2 text-muted-foreground">{sessionError}</p><Button type="button" className="mt-6" onClick={() => router.replace("/journey")}>Return to journey</Button></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">Prepare your session</h1>
        <p className="mt-1 text-muted-foreground">{journey === "new_opportunity" ? "Start a fresh opportunity while keeping your professional continuity." : journey === "continue_upcoming" ? "Continue the preparation you already started." : journey === "continue_skills" ? "Continue your interview-skill coaching path." : "Tell Interview Mirror what you are preparing for, choose your CV, and provide the job description."}</p>
      </div>
      <form onSubmit={onAnalyze} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Preparation goal</CardTitle><CardDescription>Your selected journey determines this automatically.</CardDescription></CardHeader>
          <CardContent><div className="rounded-md border bg-muted/30 p-3 text-sm font-medium">{purpose === "improve_skills" ? "Improve my interview skills" : "Prepare for an interview"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Languages</CardTitle><CardDescription>Your experience language and interview language are independent.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2"><span className="text-sm font-medium">Experience language</span><select value={experienceLanguage} onChange={(e) => setExperienceLanguage(e.target.value as "en" | "fr")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="en">English</option><option value="fr">Français</option></select></label>
            <label className="space-y-2"><span className="text-sm font-medium">Interview language</span><select value={interviewLanguage} onChange={(e) => setInterviewLanguage(e.target.value as "en" | "fr")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="en">English</option><option value="fr">Français</option></select></label>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Interview details</CardTitle><CardDescription>Give this preparation a clear label and, when relevant, tell us when the interview is.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="title">Session title</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Financial Controller at Acme" /></div>
            {purpose === "upcoming_interview" && <div className="space-y-2"><Label htmlFor="interview-date">Interview date</Label><Input id="interview-date" type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} /></div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Your CV</CardTitle><CardDescription>Use PDF, Word, link, or paste. Your saved CV stays available for future sessions.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {savedCvs.length > 0 && <div className="space-y-2"><Label htmlFor="saved-cv">Use an existing CV</Label><select id="saved-cv" value={useNewCv ? "new" : selectedCvId ?? ""} onChange={(e) => e.target.value === "new" ? setUseNewCv(true) : selectSavedCv(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{savedCvs.map((cv) => <option key={cv.id} value={cv.id}>{cv.file_name}</option>)}<option value="new">Upload a new CV</option></select></div>}
            {(useNewCv || savedCvs.length === 0) && <>
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" variant={cvSourceMode === "paste" ? "default" : "outline"} onClick={() => setCvSourceMode("paste")}>Paste</Button>
                <Button type="button" variant={cvSourceMode === "file" ? "default" : "outline"} onClick={() => setCvSourceMode("file")}>Upload</Button>
                <Button type="button" variant={cvSourceMode === "link" ? "default" : "outline"} onClick={() => setCvSourceMode("link")}><Link2 className="h-4 w-4" /> Link</Button>
              </div>
              {cvSourceMode === "file" && <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Label htmlFor="cv-file" className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent"><FileUp className="h-4 w-4" /> Upload CV</Label><Input id="cv-file" type="file" accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={onCvFileChange} /><span className="text-xs text-muted-foreground">PDF, Word or text</span></div>}
              {cvSourceMode === "link" && <div className="flex gap-2"><Input type="url" value={cvUrl} onChange={(e) => setCvUrl(e.target.value)} placeholder="https://..." /><Button type="button" onClick={onCvLink}>Load</Button></div>}
              {cvSourceMode === "paste" && <Textarea value={cvText} onChange={(e) => { setCvText(e.target.value); setUseNewCv(true); setSelectedCvId(null); }} placeholder="Paste your CV text…" className="min-h-[220px]" required />}
            </>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Job description</CardTitle><CardDescription>Use the option that is easiest for you. Pasted text and PDF are reliable; links are read when possible and otherwise you will be asked to paste or upload the JD.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2"><Button type="button" variant={jobDescriptionMode === "paste" ? "default" : "outline"} onClick={() => setJobDescriptionMode("paste")}>Paste</Button><Button type="button" variant={jobDescriptionMode === "pdf" ? "default" : "outline"} onClick={() => setJobDescriptionMode("pdf")}>PDF</Button><Button type="button" variant={jobDescriptionMode === "word" ? "default" : "outline"} onClick={() => setJobDescriptionMode("word")}>Word</Button><Button type="button" variant={jobDescriptionMode === "link" ? "default" : "outline"} onClick={() => setJobDescriptionMode("link")}><Link2 className="h-4 w-4" /> Link</Button></div>
            {jobDescriptionMode === "paste" && <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the full job description here…" className="min-h-[240px]" />}
            {(jobDescriptionMode === "pdf" || jobDescriptionMode === "word") && <div className="space-y-3"><Label htmlFor="jd-file" className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"><FileUp className="h-4 w-4" /> Choose JD {jobDescriptionMode === "word" ? "Word" : "PDF"}</Label><Input id="jd-file" type="file" accept={jobDescriptionMode === "word" ? ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ".pdf,application/pdf"} className="hidden" onChange={onJobDescriptionFile} />{jobDescription && <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} className="min-h-[240px]" />}</div>}
            {jobDescriptionMode === "link" && <div className="space-y-3"><Label htmlFor="jd-url">Job posting link</Label><div className="flex gap-2"><Input id="jd-url" type="url" value={jobDescriptionUrl} onChange={(e) => setJobDescriptionUrl(e.target.value)} placeholder="https://company.com/jobs/financial-controller" /><Button type="button" onClick={onJobDescriptionLink}>Load</Button></div><p className="text-xs text-muted-foreground">We will read the page and normalize its text. If it cannot be read reliably, paste or upload the JD.</p>{jobDescription && <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} className="min-h-[180px]" placeholder="Optional: paste the JD here as a fallback…" />}</div>}
          </CardContent>
        </Card>
        <div className="flex justify-end"><Button type="submit" size="lg" disabled={loading}>{loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Analyze with AI</>}</Button></div>
      </form>
    </div>
  );
}
