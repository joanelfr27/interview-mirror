"use client";

import { useEffect, useState } from "react";

type Tension = {
  interviewer_belief?: string;
  unresolved_question?: string;
  why_it_matters?: string;
  candidate_evidence?: string;
  evidence_limit?: string;
  must_demonstrate?: string;
  remaining_doubt?: string;
  preparation_consequence?: string;
  wow_insight?: string;
};

const auditCases = [
  {
    name: "A — Strong evidence, incomplete ownership",
    cv: `Regional Finance Manager with 13 years of experience across West and North Africa.
- Manage finance operations for Côte d'Ivoire and Ghana, with regional responsibilities across West and Central Africa.
- Lead AP/GL, tax reporting, FP&A, statutory audit and tax audit activities.
- Manage treasury approvals and banking relationships.
- Streamlined accounts payable processes and improved VAT and withholding-tax accounting.
- ACCA qualified; MBA in Management.`,
    jd: `Finance Manager, West & Central Africa
- Own financial planning, forecasting and reporting for multiple countries.
- Partner with business leaders to improve performance and decision making.
- Lead finance process transformation and continuous improvement.
- Ensure strong governance, controls, compliance and audit readiness.
- Influence senior stakeholders across a complex regional organization.`,
  },
  {
    name: "B — Transferable capability",
    cv: `Finance Operations Manager with experience leading ERP/process improvements.
- Redesigned AP workflows and standardized finance procedures across several entities.
- Led implementation of automated approval controls.
- Trained finance teams on new processes and monitored adoption.
- No direct experience in the target industry.`,
    jd: `Finance Transformation Lead, Mining
- Lead finance transformation across mining operations.
- Deep knowledge of mining finance processes preferred.
- Own process redesign, controls and stakeholder adoption.
- Advise operational leaders on finance transformation.`,
  },
  {
    name: "C — Senior title, unclear decision authority",
    cv: `Regional Finance Manager.
- Responsible for monthly reporting for six countries.
- Coordinated submissions from local finance teams.
- Consolidated results and prepared management reporting.
- Participated in regional forecast discussions.
- Supported audit requests and follow-up.`,
    jd: `Regional Financial Controller
- Own regional close and reporting quality.
- Challenge country finance teams and resolve material issues.
- Make judgement calls on reporting and controls.
- Act as finance authority for regional management.`,
  },
  {
    name: "D — Multi-fact reasoning",
    cv: `Finance Manager.
- Manage finance operations in Côte d'Ivoire and Ghana.
- Approve treasury transactions and maintain bank relationships.
- Lead statutory and tax audits.
- Improved VAT and withholding-tax accounting.
- Produce regional forecasts and explain variances to management.`,
    jd: `West Africa Finance Director
- Provide reliable financial visibility across countries.
- Protect liquidity and financial controls.
- Lead audit and compliance governance.
- Support management decisions through forecasting and variance analysis.`,
  },
  {
    name: "E — Genuine verification gap",
    cv: `Finance Manager with 10 years of accounting and FP&A experience.
- Manage monthly reporting and budgeting.
- Lead local statutory audit.
- Manage accounts payable and general ledger.
- ACCA qualified.`,
    jd: `Group Finance Manager
- Own IFRS 16 accounting for a large lease portfolio.
- Lead complex group consolidation under IFRS.
- Direct experience with IFRS 16 and consolidation is required.`,
  },
];

export default function NemotronLabPage() {
  const [caseIndex, setCaseIndex] = useState(0);
  const [status, setStatus] = useState("Ready");
  const [result, setResult] = useState<Tension[]>([]);
  const [deepSeekResult, setDeepSeekResult] = useState<Tension[]>([]);
  const [overall, setOverall] = useState("");
  const [deepSeekOverall, setDeepSeekOverall] = useState("");
  const [error, setError] = useState("");

  const auditCase = auditCases[caseIndex];

  async function run() {
    setStatus("Running Nemotron + DeepSeek…");
    setError("");
    setResult([]);
    setDeepSeekResult([]);
    setOverall("");
    setDeepSeekOverall("");
    try {
      const response = await fetch("/api/dev/nemotron-adversary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: auditCase.cv, jd: auditCase.jd }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.details ?? payload?.error ?? "Nemotron test failed.");
      setOverall(payload?.result?.overall_challenge ?? "");
      setResult(Array.isArray(payload?.result?.tensions) ? payload.result.tensions : []);

      const second = await fetch("/api/dev/deepseek-adversary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv: auditCase.cv, jd: auditCase.jd }),
      });
      const secondPayload = await second.json();
      if (!second.ok) throw new Error(secondPayload?.details ?? secondPayload?.error ?? "DeepSeek test failed.");
      setDeepSeekOverall(secondPayload?.result?.overall_challenge ?? "");
      setDeepSeekResult(Array.isArray(secondPayload?.result?.tensions) ? secondPayload.result.tensions : []);
      setStatus("Audit case completed.");
    } catch (e) {
      setStatus("Test failed.");
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  const nextCase = () => {
    if (caseIndex < auditCases.length - 1) setCaseIndex(caseIndex + 1);
  };
  const previousCase = () => {
    if (caseIndex > 0) setCaseIndex(caseIndex - 1);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                Interview Mirror · Strategy Lab
              </p>
              <h1 className="mt-2 text-2xl font-semibold">External Adversary Audit</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">Five deliberately difficult synthetic CV/JD cases. Run each case and compare Nemotron with DeepSeek. This is an isolated audit, not production Strategy.</p>
            </div>
            <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-medium">
              {status}
            </span>
          </div>

          <section className="mt-6 rounded-xl border bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Audit case {caseIndex + 1} / {auditCases.length}</p>
                <h2 className="mt-1 font-semibold">{auditCase.name}</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={previousCase} disabled={caseIndex === 0} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Previous</button>
                <button onClick={run} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium">Run case</button>
                <button onClick={nextCase} disabled={caseIndex === auditCases.length - 1} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-40">Next</button>
              </div>
            </div>
          </section>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {overall ? (
            <section className="mt-8 rounded-xl border bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Overall challenge
              </p>
              <p className="mt-2 leading-relaxed">{overall}</p>
            </section>
          ) : null}

          {deepSeekOverall ? (
            <section className="mt-4 rounded-xl border bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">DeepSeek overall challenge</p>
              <p className="mt-2 leading-relaxed">{deepSeekOverall}</p>
            </section>
          ) : null}

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {result.map((tension, index) => (
              <article key={index} className="rounded-xl border p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-semibold">Strategic tension {index + 1}</h2>
                  <span className="text-xs text-slate-400">Nemotron 3 Ultra</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    ["Interviewer belief", tension.interviewer_belief],
                    ["Unresolved question", tension.unresolved_question],
                    ["Why it matters", tension.why_it_matters],
                    ["Candidate evidence", tension.candidate_evidence],
                    ["Evidence limit", tension.evidence_limit],
                    ["Must demonstrate", tension.must_demonstrate],
                    ["Remaining doubt", tension.remaining_doubt],
                    ["Preparation consequence", tension.preparation_consequence],
                    ["WOW insight", tension.wow_insight],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {label}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed">{value || "—"}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            <div className="space-y-5">
              {deepSeekResult.map((tension, index) => (
                <article key={index} className="rounded-xl border p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="font-semibold">DeepSeek tension {index + 1}</h2>
                    <span className="text-xs text-slate-400">DeepSeek V4 Flash 0731</span>
                  </div>
                  <div className="space-y-4">
                    {[
                      ["Unresolved question", tension.unresolved_question],
                      ["Candidate evidence", tension.candidate_evidence],
                      ["Evidence limit", tension.evidence_limit],
                      ["Must demonstrate", tension.must_demonstrate],
                      ["Remaining doubt", tension.remaining_doubt],
                      ["Preparation consequence", tension.preparation_consequence],
                      ["WOW insight", tension.wow_insight],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                        <p className="mt-2 text-sm leading-relaxed">{value || "—"}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
}
