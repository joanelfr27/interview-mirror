"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BriefcaseBusiness,
  History,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  hasCandidateHistory: boolean;
  resumableUpcomingSessionId: string | null;
  resumableSkillsSessionId: string | null;
  upcomingTitle: string | null;
  skillsTitle: string | null;
  focusArea: string | null;
};

type Journey =
  | "new_upcoming"
  | "new_skills"
  | "continue_upcoming"
  | "new_opportunity"
  | "continue_skills";

const journeys: Array<{
  id: Journey;
  title: string;
  description: string;
  icon: typeof BriefcaseBusiness;
  returning: boolean;
}> = [
  { id: "new_upcoming", title: "I have an interview coming", description: "Prepare for a specific interview and role.", icon: BriefcaseBusiness, returning: false },
  { id: "new_skills", title: "I want to improve my interview skills", description: "Build interview capability without needing a specific job description.", icon: Target, returning: false },
  { id: "continue_upcoming", title: "Continue my preparation", description: "Resume your most relevant existing interview preparation.", icon: History, returning: true },
  { id: "new_opportunity", title: "Prepare for a new interview", description: "Keep your professional continuity while starting a fresh opportunity.", icon: RefreshCw, returning: true },
  { id: "continue_skills", title: "Continue improving my interview skills", description: "Resume your existing coaching and learning path.", icon: Sparkles, returning: true },
];

export default function JourneySelector(props: Props) {
  const router = useRouter();
  const [experienceLanguage, setExperienceLanguage] = useState<"en" | "fr">("en");
  const [interviewLanguage, setInterviewLanguage] = useState<"en" | "fr">("en");
  const [selected, setSelected] = useState<Journey | null>(null);

  function continueJourney() {
    if (!selected) return;

    const sessionId =
      selected === "continue_upcoming"
        ? props.resumableUpcomingSessionId
        : selected === "continue_skills"
          ? props.resumableSkillsSessionId
          : null;

    const params = new URLSearchParams({
      journey: selected,
      experienceLanguage,
      interviewLanguage,
    });

    if (sessionId) params.set("session", sessionId);
    router.push(`/prepare?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2">
        <Badge>Start with your goal</Badge>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          What do you want to do today?
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Your professional continuity stays with you. Choose the path that matches what you need now.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose your languages</CardTitle>
          <CardDescription>
            Your experience language and interview language are independent. You can use French for your experience and English for the interview.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Experience language</span>
            <select value={experienceLanguage} onChange={(e) => setExperienceLanguage(e.target.value as "en" | "fr")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Interview language</span>
            <select value={interviewLanguage} onChange={(e) => setInterviewLanguage(e.target.value as "en" | "fr")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {journeys.map((journey) => {
          const Icon = journey.icon;
          const disabled =
            journey.id === "continue_upcoming"
              ? !props.resumableUpcomingSessionId
              : journey.id === "continue_skills"
                ? !props.resumableSkillsSessionId
                : false;
          const selectedState = selected === journey.id;

          return (
            <button
              key={journey.id}
              type="button"
              disabled={disabled}
              onClick={() => setSelected(journey.id)}
              className={`w-full rounded-xl border bg-card p-5 text-left transition hover:border-primary/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${selectedState ? "border-primary ring-2 ring-primary/20" : ""}`}
            >
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{journey.title}</span>
                    {journey.returning && <Badge variant="secondary">Returning</Badge>}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">{journey.description}</span>
                  {journey.id === "continue_upcoming" && props.upcomingTitle && (
                    <span className="mt-2 block text-xs text-muted-foreground">Resume: {props.upcomingTitle}</span>
                  )}
                  {journey.id === "continue_skills" && props.skillsTitle && (
                    <span className="mt-2 block text-xs text-muted-foreground">Resume: {props.skillsTitle}{props.focusArea ? ` · Focus: ${props.focusArea}` : ""}</span>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button size="lg" onClick={continueJourney} disabled={!selected}>
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {!props.hasCandidateHistory && (
        <p className="text-center text-xs text-muted-foreground">
          This is your first preparation journey. You can return later without rebuilding your profile.
        </p>
      )}
    </div>
  );
}
