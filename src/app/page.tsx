import Link from "next/link";
import {
  ArrowRight,
  FileSearch,
  MessageSquare,
  Sparkles,
  Target,
} from "lucide-react";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { Button } from "@/components/ui/button";

const steps = [
  {
    icon: FileSearch,
    title: "Upload your CV",
    description:
      "Paste or upload your résumé so the mirror can ground every insight in real evidence.",
  },
  {
    icon: Target,
    title: "Add the job description",
    description:
      "Align your experience to the role you want — skills, tone, and priorities included.",
  },
  {
    icon: MessageSquare,
    title: "Practice & get feedback",
    description:
      "Run a tailored interview simulation and receive clear, actionable coaching.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />

      <section className="hero-grid relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 animate-fade-up text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Interview Mirror
            </p>
            <h1 className="animate-fade-up font-display text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl md:text-6xl [animation-delay:80ms]">
              See yourself clearly.
              <span className="block text-primary">Interview with confidence.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg text-muted-foreground [animation-delay:160ms]">
              Evidence-first interview coaching that turns your CV and target role into
              personalized interview practice — grounded in your real experience.
            </p>
            <div className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-3 sm:flex-row [animation-delay:240ms]">
              <Button size="lg" asChild>
                <Link href="/signup">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto mt-16 max-w-4xl animate-fade-up [animation-delay:320ms]">
            <div className="overflow-hidden rounded-2xl border bg-white shadow-xl shadow-blue-900/10">
              <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                <span className="ml-3 text-xs text-muted-foreground">
                  Live coaching preview
                </span>
              </div>
              <div className="grid gap-0 md:grid-cols-2">
                <div className="space-y-4 border-b p-6 md:border-b-0 md:border-r">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Sparkles className="h-4 w-4" />
                    CV + Role analysis
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Interview focus</span>
                      <span className="font-semibold text-slate-900">Focused</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-[84%] rounded-full bg-primary" />
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="text-emerald-600">✓</span>
                      Turn your experience into strong interview stories
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-600">✓</span>
                      Evidence of leadership and influence
                    </li>
                    <li className="flex gap-2">
                      <span className="text-amber-600">•</span>
                      Strengthen your use of metrics and results
                    </li>
                  </ul>
                </div>
                <div className="space-y-4 bg-slate-50/60 p-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Interviewer
                  </p>
                  <p className="rounded-lg border bg-white p-4 text-sm leading-relaxed text-slate-700 shadow-sm">
                    Tell me about a challenging situation at work. What did you do, and what was the outcome?
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Your coaching tip
                  </p>
                  <p className="text-sm text-slate-600">
                    Structure your answer around the situation, your actions, and the measurable outcome. Lead with the outcome, then explain the specific actions that shifted the decision.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-white py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-slate-900">
              Three steps to clearer interviews
            </h2>
            <p className="mt-3 text-muted-foreground">
              A focused workflow designed around evidence — not generic tips.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
                    Step {i + 1}
                  </p>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t bg-primary py-16 text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <div>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">
              Ready to mirror your best self?
            </h2>
            <p className="mt-2 text-blue-100">
              Create an account and run your first coaching session in minutes.
            </p>
          </div>
          <Button
            size="lg"
            variant="secondary"
            className="shrink-0 bg-white text-primary hover:bg-blue-50"
            asChild
          >
            <Link href="/signup">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Interview Mirror</p>
          <p>Evidence before conclusions. AI assists — you decide.</p>
        </div>
      </footer>
    </div>
  );
}
