import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CoachingProgress = {
  baseline_score: number | null;
  latest_score: number | null;
  status: string | null;
  evidence: {
    focusEvidence?: string;
    focusNextStep?: string;
  } | null;
};

export function CoachingProgressCard({ progress }: { progress: CoachingProgress | null }) {
  if (!progress) return null;

  const baseline = typeof progress.baseline_score === "number" ? progress.baseline_score : null;
  const latest = typeof progress.latest_score === "number" ? progress.latest_score : null;
  const delta = baseline !== null && latest !== null ? latest - baseline : null;
  const status = progress.status === "improved" ? "Improved" : "Still needs practice";

  return (
    <Card>
      <CardHeader>
        <Badge variant="secondary" className="w-fit">Your progress</Badge>
        <CardTitle className="text-base">What changed with this skill?</CardTitle>
        <CardDescription>
          We compare your first recorded result with your latest targeted practice.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {baseline !== null && <span>Before: <strong>{baseline}/100</strong></span>}
          {latest !== null && <span>Latest: <strong>{latest}/100</strong></span>}
          {delta !== null && delta !== 0 && (
            <Badge variant={delta > 0 ? "default" : "destructive"}>
              {delta > 0 ? `+${delta}` : delta} points
            </Badge>
          )}
          <Badge variant="outline">{status}</Badge>
        </div>
        {progress.evidence?.focusEvidence && (
          <div className="rounded-lg border bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence from your latest answer</p>
            <p className="mt-1 text-sm text-slate-700">{progress.evidence.focusEvidence}</p>
          </div>
        )}
        {progress.evidence?.focusNextStep && (
          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next step</p>
            <p className="mt-1 text-sm text-slate-700">{progress.evidence.focusNextStep}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
