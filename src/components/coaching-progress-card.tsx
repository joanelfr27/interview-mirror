import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CoachingEvidence = {
  focusEvidence?: string;
  focusNextStep?: string;
};

type CoachingProgress = {
  baseline_score: number | null;
  latest_score: number | null;
  status: string | null;
  evidence: {
    latest?: CoachingEvidence;
    history?: CoachingEvidence[];
  } | CoachingEvidence | null;
};

export function CoachingProgressCard({ progress, isFrench }: { progress: CoachingProgress | null; isFrench: boolean }) {
  if (!progress) return null;

  const baseline = typeof progress.baseline_score === "number" ? progress.baseline_score : null;
  const latest = typeof progress.latest_score === "number" ? progress.latest_score : null;
  const delta = baseline !== null && latest !== null ? latest - baseline : null;
  const status =
    progress.status === "improved"
      ? (isFrench ? "Amélioré" : "Improved")
      : progress.status === "identified"
        ? (isFrench ? "Référence enregistrée" : "Baseline recorded")
        : (isFrench ? "Pratique encore nécessaire" : "Still needs practice");

  const evidence = progress.evidence;
  const latestEvidence = evidence && "focusEvidence" in evidence
    ? evidence
    : evidence && "latest" in evidence
      ? evidence.latest
      : undefined;
  const history = evidence && "history" in evidence ? evidence.history ?? [] : [];
  const baselineEvidence = history[0];

  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary" className="w-fit">{isFrench ? "Votre progression" : "Your progress"}</Badge>
        <CardTitle className="text-base">{isFrench ? "Qu'est-ce qui a changé sur ce point ?" : "What changed with this skill?"}</CardTitle>
        <CardDescription>
          {isFrench ? "Nous comparons votre premier résultat enregistré avec votre dernière pratique ciblée." : "We compare your first recorded result with your latest targeted practice."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {baseline !== null && <span>{isFrench ? "Avant" : "Before"}: <strong>{baseline}/100</strong></span>}
          {latest !== null && <span>{isFrench ? "Dernier" : "Latest"}: <strong>{latest}/100</strong></span>}
          {delta !== null && delta !== 0 && (
            <Badge variant={delta > 0 ? "default" : "warning"}>
              {delta > 0 ? `+${delta}` : delta} {isFrench ? "points" : "points"}
            </Badge>
          )}
          <Badge variant="outline">{status}</Badge>
        </div>

        {baselineEvidence?.focusEvidence && latestEvidence?.focusEvidence && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isFrench ? "Ce que vous aviez démontré" : "What you showed before"}</p>
              <p className="mt-1 text-sm text-slate-700">{baselineEvidence.focusEvidence}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isFrench ? "Ce que vous avez démontré récemment" : "What you showed most recently"}</p>
              <p className="mt-1 text-sm text-slate-700">{latestEvidence.focusEvidence}</p>
            </div>
          </div>
        )}

        {latestEvidence?.focusEvidence && !baselineEvidence?.focusEvidence && (
          <div className="rounded-lg border bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isFrench ? "Preuve de votre dernière réponse" : "Evidence from your latest answer"}</p>
            <p className="mt-1 text-sm text-slate-700">{latestEvidence.focusEvidence}</p>
          </div>
        )}

        {latestEvidence?.focusNextStep && (
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isFrench ? "Prochaine étape" : "Next step"}</p>
            <p className="mt-1 text-sm text-slate-700">{latestEvidence.focusNextStep}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
