"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp,
  Linkedin,
  PenLine,
  Check,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

type OptionId = "linkedin" | "cv" | "manual";

export default function OnboardingPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<OptionId>("linkedin");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  function handleLinkedInContinue() {
    const trimmed = linkedinUrl.trim();
    if (!trimmed) {
      setUrlError("Paste your LinkedIn profile URL to continue.");
      return;
    }
    if (!trimmed.includes("linkedin.com")) {
      setUrlError("Enter a valid LinkedIn profile URL.");
      return;
    }
    setUrlError(null);
    router.push("/dashboard");
  }

  function handleCvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvFileName(file.name);
  }

  function handleCvContinue() {
    if (!cvFileName) return;
    router.push("/dashboard");
  }

  function handleManualContinue() {
    router.push("/prepare");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center sm:text-left">
        <Badge className="mb-3">Get started</Badge>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Build your professional mirror
        </h1>
        <p className="mt-2 text-muted-foreground">
          Choose how you&apos;d like to create your profile. You can always update
          it later.
        </p>
      </div>

      <div className="space-y-4">
        {/* 1. LinkedIn — Recommended */}
        <Card
          className={cn(
            "cursor-pointer transition-all",
            selected === "linkedin"
              ? "border-primary ring-2 ring-primary/20 shadow-md"
              : "hover:border-primary/40 hover:shadow-sm"
          )}
          onClick={() => setSelected("linkedin")}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <Linkedin className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">
                      Import LinkedIn Profile
                    </CardTitle>
                    <Badge variant="default" className="text-[10px] uppercase tracking-wide">
                      Recommended
                    </Badge>
                  </div>
                  <CardDescription className="mt-1.5">
                    Paste your LinkedIn profile URL to get started in seconds.
                  </CardDescription>
                </div>
              </div>
              <span
                className={cn(
                  "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  selected === "linkedin"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-300"
                )}
              >
                {selected === "linkedin" && <Check className="h-3 w-3" />}
              </span>
            </div>
          </CardHeader>

          {selected === "linkedin" && (
            <CardContent
              className="space-y-3 border-t pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-2">
                <Label htmlFor="linkedin-url">LinkedIn profile URL</Label>
                <Input
                  id="linkedin-url"
                  type="url"
                  placeholder="https://www.linkedin.com/in/your-name"
                  value={linkedinUrl}
                  onChange={(e) => {
                    setLinkedinUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                  aria-invalid={Boolean(urlError)}
                />
                {urlError && (
                  <p className="text-sm text-destructive">{urlError}</p>
                )}
              </div>
              <Button type="button" onClick={handleLinkedInContinue} className="w-full sm:w-auto">
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          )}
        </Card>

        {/* 2. Upload CV */}
        <Card
          className={cn(
            "cursor-pointer transition-all",
            selected === "cv"
              ? "border-primary ring-2 ring-primary/20 shadow-md"
              : "hover:border-primary/40 hover:shadow-sm"
          )}
          onClick={() => setSelected("cv")}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <FileUp className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Upload CV</CardTitle>
                  <CardDescription className="mt-1.5">
                    Upload your CV if it is more up to date than your LinkedIn
                    profile.
                  </CardDescription>
                </div>
              </div>
              <span
                className={cn(
                  "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  selected === "cv"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-300"
                )}
              >
                {selected === "cv" && <Check className="h-3 w-3" />}
              </span>
            </div>
          </CardHeader>

          {selected === "cv" && (
            <CardContent
              className="space-y-3 border-t pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={handleCvFile}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 bg-accent/40 px-4 py-8 text-center transition-colors hover:bg-accent"
              >
                <FileUp className="h-6 w-6 text-primary" />
                <span className="text-sm font-medium text-slate-900">
                  {cvFileName ? cvFileName : "Choose PDF or DOCX file"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Accepted formats: PDF, DOCX
                </span>
              </button>
              <Button
                type="button"
                onClick={handleCvContinue}
                disabled={!cvFileName}
                className="w-full sm:w-auto"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          )}
        </Card>

        {/* 3. Build manually */}
        <Card
          className={cn(
            "cursor-pointer transition-all",
            selected === "manual"
              ? "border-primary ring-2 ring-primary/20 shadow-md"
              : "hover:border-primary/40 hover:shadow-sm"
          )}
          onClick={() => setSelected("manual")}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <PenLine className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">Build Profile Manually</CardTitle>
                  <CardDescription className="mt-1.5">
                    Create your professional profile manually.
                  </CardDescription>
                </div>
              </div>
              <span
                className={cn(
                  "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  selected === "manual"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-300"
                )}
              >
                {selected === "manual" && <Check className="h-3 w-3" />}
              </span>
            </div>
          </CardHeader>

          {selected === "manual" && (
            <CardContent
              className="border-t pt-4"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                type="button"
                onClick={handleManualContinue}
                className="w-full sm:w-auto"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardContent>
          )}
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground sm:text-left">
        You can skip ahead anytime from your{" "}
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => router.push("/dashboard")}
        >
          dashboard
        </button>
        .
      </p>
    </div>
  );
}
