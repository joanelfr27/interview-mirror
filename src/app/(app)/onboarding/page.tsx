"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Linkedin, PenLine, Check, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

async function extractPdfText(file: File) {
  const mod = await import("pdfjs-dist/legacy/build/pdf").catch(() => import("pdfjs-dist/build/pdf.mjs"));
  const pdfjslib: any = mod?.default ?? mod;
  const arrayBuffer = await file.arrayBuffer();
  if (pdfjslib.GlobalWorkerOptions) pdfjslib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjslib.version}/pdf.worker.min.mjs`;
  const pdf = await pdfjslib.getDocument({ data: arrayBuffer, disableWorker: true }).promise;
  const pages: string[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex); const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item: any) => item.str || "").join(" ").trim());
  }
  return pages.filter(Boolean).join("\n\n");
}

type OptionId = "linkedin" | "cv" | "manual";

export default function OnboardingPage() {
  const router = useRouter(); const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<OptionId>("cv"); const [linkedinUrl, setLinkedinUrl] = useState(""); const [cvFileName, setCvFileName] = useState<string | null>(null); const [urlError, setUrlError] = useState<string | null>(null); const [savingCv, setSavingCv] = useState(false); const [checkingProfile, setCheckingProfile] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const res = await fetch("/api/user-cvs"); if (res.ok) { const data = await res.json(); if (!cancelled && Array.isArray(data.cvs) && data.cvs.length > 0) { router.replace("/journey"); return; } } }
      finally { if (!cancelled) setCheckingProfile(false); }
    })();
    return () => { cancelled = true; };
  }, [router]);

  function handleLinkedInContinue() {
    const trimmed = linkedinUrl.trim();
    if (!trimmed || !trimmed.includes("linkedin.com")) { setUrlError("LinkedIn import is not available yet. Please upload or paste your CV to continue."); return; }
    setUrlError("LinkedIn import is not available yet. Please upload or paste your CV to continue.");
  }

  async function handleCvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; setCvFileName(file.name); setSavingCv(true);
    try {
      const lowerName = file.name.toLowerCase(); let cvText = "";
      if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) cvText = await extractPdfText(file);
      else if (file.type === "text/plain" || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) cvText = await file.text();
      if (!cvText.trim()) throw new Error("We could not extract text from this CV. Please use a PDF or paste the CV text during preparation.");
      const res = await fetch("/api/user-cvs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, cvText }) });
      if (!res.ok) throw new Error("Could not save your CV");
    } catch (error) { setCvFileName(null); setUrlError(error instanceof Error ? error.message : "Could not save your CV"); }
    finally { setSavingCv(false); }
  }

  function handleCvContinue() { if (!cvFileName || savingCv) return; router.push("/journey"); }
  function handleManualContinue() { router.push("/journey"); }
  if (checkingProfile) return <div className="flex items-center justify-center py-24 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading your profile…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center sm:text-left"><Badge className="mb-3">Get started</Badge><h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Build your professional mirror</h1><p className="mt-2 text-muted-foreground">Create your CV profile first. You can always update it later.</p></div>
      <div className="space-y-4">
        <Card className={cn("cursor-pointer transition-all", selected === "linkedin" ? "border-primary ring-2 ring-primary/20 shadow-md" : "hover:border-primary/40 hover:shadow-sm")} onClick={() => setSelected("linkedin")}>
          <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><Linkedin className="h-5 w-5" /></span><div><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-lg">Import LinkedIn Profile</CardTitle><Badge variant="default" className="text-[10px] uppercase tracking-wide">Coming soon</Badge></div><CardDescription className="mt-1.5">LinkedIn import is not available in this build yet.</CardDescription></div></div><span className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected === "linkedin" ? "border-primary bg-primary text-primary-foreground" : "border-slate-300")}>{selected === "linkedin" && <Check className="h-3 w-3" />}</span></div></CardHeader>
          {selected === "linkedin" && <CardContent className="space-y-3 border-t pt-4" onClick={(e) => e.stopPropagation()}><div className="space-y-2"><Label htmlFor="linkedin-url">LinkedIn profile URL</Label><Input id="linkedin-url" type="url" placeholder="https://www.linkedin.com/in/your-name" value={linkedinUrl} onChange={(e) => { setLinkedinUrl(e.target.value); if (urlError) setUrlError(null); }} aria-invalid={Boolean(urlError)} />{urlError && <p className="text-sm text-destructive">{urlError}</p>}</div><Button type="button" onClick={handleLinkedInContinue} className="w-full sm:w-auto">Continue<ChevronRight className="h-4 w-4" /></Button></CardContent>}
        </Card>
        <Card className={cn("cursor-pointer transition-all", selected === "cv" ? "border-primary ring-2 ring-primary/20 shadow-md" : "hover:border-primary/40 hover:shadow-sm")} onClick={() => setSelected("cv")}>
          <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><FileUp className="h-5 w-5" /></span><div><CardTitle className="text-lg">Upload CV</CardTitle><CardDescription className="mt-1.5">Upload your current CV to create your reusable profile.</CardDescription></div></div><span className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected === "cv" ? "border-primary bg-primary text-primary-foreground" : "border-slate-300")}>{selected === "cv" && <Check className="h-3 w-3" />}</span></div></CardHeader>
          {selected === "cv" && <CardContent className="space-y-3 border-t pt-4" onClick={(e) => e.stopPropagation()}><input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="hidden" onChange={handleCvFile} /><button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-accent/40 px-4 py-8 text-center hover:bg-accent"><FileUp className="h-6 w-6 text-primary" /><span className="text-sm font-medium text-slate-900">{cvFileName ? cvFileName : "Choose PDF or text file"}</span><span className="text-xs text-muted-foreground">Accepted formats: PDF, TXT, MD</span></button><Button type="button" onClick={handleCvContinue} disabled={!cvFileName || savingCv} className="w-full sm:w-auto">{savingCv ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>Continue<ChevronRight className="h-4 w-4" /></>}</Button></CardContent>}
        </Card>
        <Card className={cn("cursor-pointer transition-all", selected === "manual" ? "border-primary ring-2 ring-primary/20 shadow-md" : "hover:border-primary/40 hover:shadow-sm")} onClick={() => setSelected("manual")}>
          <CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary"><PenLine className="h-5 w-5" /></span><div><CardTitle className="text-lg">Build Profile Manually</CardTitle><CardDescription className="mt-1.5">Paste your CV during preparation and save it as your reusable CV.</CardDescription></div></div><span className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", selected === "manual" ? "border-primary bg-primary text-primary-foreground" : "border-slate-300")}>{selected === "manual" && <Check className="h-3 w-3" />}</span></div></CardHeader>
          {selected === "manual" && <CardContent className="border-t pt-4" onClick={(e) => e.stopPropagation()}><Button type="button" onClick={handleManualContinue} className="w-full sm:w-auto">Continue<ChevronRight className="h-4 w-4" /></Button></CardContent>}
        </Card>
      </div>
      <p className="text-center text-xs text-muted-foreground sm:text-left">A CV is required before a new preparation session can begin.</p>
    </div>
  );
}
