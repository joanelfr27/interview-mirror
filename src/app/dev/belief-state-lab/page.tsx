"use client";

import { useState } from "react";

type VariantResult = {
  overall_challenge?: string;
  tensions?: Array<Record<string, string>>;
};

const cases = [
  { name: "A — Strong evidence, incomplete ownership", cv: `Regional Finance Manager with 13 years of experience across West and North Africa.
- Manage finance operations for Côte d'Ivoire and Ghana, with regional responsibilities across West and Central Africa.
- Lead AP/GL, tax reporting, FP&A, statutory audit and tax audit activities.
- Manage treasury approvals and banking relationships.
- Streamlined accounts payable processes and improved VAT and withholding-tax accounting.
- ACCA qualified; MBA in Management.`, jd: `Finance Manager, West & Central Africa
- Own financial planning, forecasting and reporting for multiple countries.
- Partner with business leaders to improve performance and decision making.
- Lead finance process transformation and continuous improvement.
- Ensure strong governance, controls, compliance and audit readiness.
- Influence senior stakeholders across a complex regional organization.` },
  { name: "B — Transferable capability", cv: `Finance Operations Manager with experience leading ERP/process improvements.
- Redesigned AP workflows and standardized finance procedures across several entities.
- Led implementation of automated approval controls.
- Trained finance teams on new processes and monitored adoption.
- No direct experience in the target industry.`, jd: `Finance Transformation Lead, Mining
- Lead finance transformation across mining operations.
- Deep knowledge of mining finance processes preferred.
- Own process redesign, controls and stakeholder adoption.
- Advise operational leaders on finance transformation.` },
  { name: "C — Senior title, unclear decision authority", cv: `Regional Finance Manager.
- Responsible for monthly reporting for six countries.
- Coordinated submissions from local finance teams.
- Consolidated results and prepared management reporting.
- Participated in regional forecast discussions.
- Supported audit requests and follow-up.`, jd: `Regional Financial Controller
- Own regional close and reporting quality.
- Challenge country finance teams and resolve material issues.
- Make judgement calls on reporting and controls.
- Act as finance authority for regional management.` },
  { name: "D — Multi-fact reasoning", cv: `Finance Manager.
- Manage finance operations in Côte d'Ivoire and Ghana.
- Approve treasury transactions and maintain bank relationships.
- Lead statutory and tax audits.
- Improved VAT and withholding-tax accounting.
- Produce regional forecasts and explain variances to management.`, jd: `West Africa Finance Director
- Provide reliable financial visibility across countries.
- Protect liquidity and financial controls.
- Lead audit and compliance governance.
- Support management decisions through forecasting and variance analysis.` },
  { name: "E — Genuine verification gap", cv: `Finance Manager with 10 years of accounting and FP&A experience.
- Manage monthly reporting and budgeting.
- Lead local statutory audit.
- Manage accounts payable and general ledger.
- ACCA qualified.`, jd: `Group Finance Manager
- Own IFRS 16 accounting for a large lease portfolio.
- Lead complex group consolidation under IFRS.
- Direct experience with IFRS 16 and consolidation is required.` }
] as const;

const fields = ["requirement","evidence_state","interviewer_belief","evidence_available","evidence_boundary","unresolved_belief","verification_target","confirmation_evidence","must_demonstrate","point_of_attention","preparation_consequence"];

export default function BeliefStateLabPage() {
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, VariantResult>>({});
  const [status, setStatus] = useState("Ready — offline research only");
  const [error, setError] = useState("");
  const c = cases[index];

  async function run() {
    setStatus("Running 3 controlled variants…"); setError("");
    try {
      const r = await fetch("/api/dev/belief-state-experiment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cv: c.cv, jd: c.jd }) });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.details ?? p?.error ?? "Experiment failed.");
      setResults(p.results ?? {}); setStatus("Case completed — evaluate manually.");
    } catch (e) { setStatus("Experiment failed."); setError(e instanceof Error ? e.message : "Unknown error"); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-7xl">
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Interview Mirror · Research Lab</p>
      <h1 className="mt-2 text-2xl font-semibold">Belief State Breakthrough Experiment</h1>
      <p className="mt-2 max-w-4xl text-sm text-slate-600">Controlled comparison of baseline reasoning, embedded skeptic reasoning, and explicit belief-state reasoning. This is isolated from production Strategy.</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button onClick={() => setIndex(Math.max(0,index-1))} disabled={index===0} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Previous</button>
        <button onClick={run} className="rounded-lg border bg-white px-4 py-2 text-sm font-medium">Run case</button>
        <button onClick={() => setIndex(Math.min(cases.length-1,index+1))} disabled={index===cases.length-1} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Next</button>
        <span className="ml-auto rounded-full border bg-slate-50 px-3 py-1 text-xs">{status}</span>
      </div>
      <section className="mt-6 rounded-xl border bg-slate-50 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Case {index+1} / {cases.length}</p><h2 className="mt-1 font-semibold">{c.name}</h2></section>
      {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        {(["baseline","skeptic","belief_state"] as const).map(v => { const r=results[v]; return <article key={v} className="rounded-xl border p-5"><h2 className="font-semibold">{v === "belief_state" ? "Belief State + Verification" : v === "skeptic" ? "Embedded Skeptic" : "Baseline"}</h2>{!r ? <p className="mt-4 text-sm text-slate-500">Not run yet.</p> : <><p className="mt-4 text-sm leading-relaxed">{r.overall_challenge}</p><div className="mt-5 space-y-4">{(r.tensions ?? []).map((t,i)=><div key={i} className="rounded-lg bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tension {i+1}</p>{fields.map(f=><div key={f} className="mt-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{f.replaceAll("_"," ")}</p><p className="text-sm leading-relaxed">{t[f] || "—"}</p></div>)}</div>)}</div></>}</article> })}
      </div>
      <section className="mt-8 rounded-xl border bg-amber-50 p-5"><p className="font-semibold">Evaluation protocol</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm"><li>Do not let the system select a winner.</li><li>Evaluate evidence grounding, evidence-state correctness, interviewer realism, non-obviousness, verification usefulness, preparation impact, field separation, and hallucination resistance.</li><li>Record whether an insight is genuinely incremental or merely a rephrasing.</li><li>Do not change production Strategy based on a single run.</li></ul></section>
    </div></div></main>;
}