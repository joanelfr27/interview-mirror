import Link from "next/link";
import { formatDistanceToNow } from "@/lib/format";
import {
  ArrowRight,
  FileText,
  MessageSquare,
  Plus,
  Sparkles,
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
import { createClient } from "@/lib/supabase/server";
import type { SessionRecord } from "@/types";

const statusVariant: Record<
  SessionRecord["status"],
  "secondary" | "default" | "warning" | "success"
> = {
  draft: "secondary",
  analyzed: "default",
  in_progress: "warning",
  completed: "success",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessions } = await supabase
    .from("sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(20);

  const list = (sessions ?? []) as SessionRecord[];
  const completed = list.filter((s) => s.status === "completed").length;
  const inProgress = list.filter(
    (s) => s.status === "in_progress" || s.status === "analyzed"
  ).length;

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900">
            Hello, {firstName}
          </h1>
          <p className="mt-1 text-muted-foreground">
            Continue preparing — or start a new coaching session.
          </p>
        </div>
        <Button asChild>
          <Link href="/prepare">
            <Plus className="h-4 w-4" />
            New session
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total sessions</CardDescription>
            <CardTitle className="text-3xl">{list.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In progress</CardDescription>
            <CardTitle className="text-3xl">{inProgress}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-3xl">{completed}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent sessions
          </h2>
        </div>

        {list.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">
                  No sessions yet
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Upload your CV, paste a job description, and let Interview
                  Mirror build a tailored practice flow.
                </p>
              </div>
              <Button asChild>
                <Link href="/prepare">
                  Start preparing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {list.map((session) => (
              <Card
                key={session.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-slate-900">
                        {session.title}
                      </h3>
                      <Badge variant={statusVariant[session.status]}>
                        {session.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Updated{" "}
                      {formatDistanceToNow(session.updated_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.status === "draft" && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/prepare?session=${session.id}`}>
                          <FileText className="h-4 w-4" />
                          Continue
                        </Link>
                      </Button>
                    )}
                    {!session.interview_strategy && (
                      <Button size="sm" asChild>
                        <Link href={`/strategy/${session.id}`}>
                          <MessageSquare className="h-4 w-4" />
                          {session.interview_strategy
                            ? "Review strategy"
                            : "Build strategy"}
                        </Link>
                      </Button>
                    )}
                    {session.status === "in_progress" && (
                      <Button size="sm" asChild>
                        <Link href={`/interview/${session.id}`}>
                          <MessageSquare className="h-4 w-4" />
                          Practice
                        </Link>
                      </Button>
                    )}
                    {session.status === "completed" && (
                      <Button size="sm" asChild>
                        <Link href={`/feedback/${session.id}`}>
                          View feedback
                        </Link>
                      </Button>
                    )}
                    {session.cv_analysis && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/analysis/${session.id}`}>Analysis</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
