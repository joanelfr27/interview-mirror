import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { runD16ShadowRuntimeIntegration } from "@/lib/d16-shadow-runtime-integration";
import type { SessionRecord } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !process.env.OPENAI_API_KEY) {
  throw new Error("Required runtime validation secrets are not configured.");
}

type SessionRow = {
  id: string;
  user_id: string;
  title: string;
  cv_text: string;
  job_description: string;
  cv_analysis: SessionRecord["cv_analysis"];
  interview_strategy: SessionRecord["interview_strategy"];
  preparation_language: SessionRecord["preparation_language"];
  preparation_purpose: SessionRecord["preparation_purpose"];
  interview_date: string | null;
  coaching_focus: string | null;
  job_description_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

const { data, error } = await supabase
  .from("sessions")
  .select("id,user_id,title,cv_text,job_description,cv_analysis,interview_strategy,preparation_language,preparation_purpose,interview_date,coaching_focus,job_description_url,status,created_at,updated_at")
  .not("cv_text", "is", null)
  .not("job_description", "is", null)
  .order("created_at", { ascending: false })
  .limit(50);

if (error) throw new Error("Supabase session query failed: " + error.message);

const chosen: SessionRow[] = [];
const seenCv = new Set<string>();

for (const row of (data ?? []) as SessionRow[]) {
  if (!row.cv_text?.trim() || !row.job_description?.trim()) continue;
  const cvKey = fingerprint(row.cv_text);
  if (seenCv.has(cvKey)) continue;
  seenCv.add(cvKey);
  chosen.push(row);
  if (chosen.length === 3) break;
}

if (chosen.length < 3) {
  throw new Error(`Expected at least 3 distinct CV sessions, found ${chosen.length}.`);
}

const report = {
  run: {
    mode: "D15_REAL_SESSION_SHADOW",
    writes_performed: false,
    sessions_requested: chosen.length,
    selected_session_fingerprints: chosen.map((row) => ({
      session: fingerprint(row.id),
      cv: fingerprint(row.cv_text),
      jd: fingerprint(row.job_description),
    })),
  },
  sessions: [] as Array<Record<string, unknown>>,
};

for (const row of chosen) {
  const session: SessionRecord = {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    cv_text: row.cv_text,
    job_description: row.job_description,
    cv_analysis: row.cv_analysis,
    interview_strategy: row.interview_strategy,
    preparation_language: row.preparation_language,
    preparation_purpose: row.preparation_purpose,
    interview_date: row.interview_date,
    coaching_focus: row.coaching_focus,
    job_description_url: row.job_description_url,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const base = {
    session: fingerprint(row.id),
    cv: fingerprint(row.cv_text),
    jd: fingerprint(row.job_description),
    cv_chars: row.cv_text.length,
    jd_chars: row.job_description.length,
  };

  try {
    const result = await runD16ShadowRuntimeIntegration(session);
    const domains = result.ledger.evidence
      .map((atom) => atom.context.domain)
      .filter((value): value is string => Boolean(value?.trim()));

    report.sessions.push({
      ...base,
      outcome: "PASS",
      requirements: result.ledger.requirements.length,
      evidence_atoms: result.ledger.evidence.length,
      evidence_with_domain: domains.length,
      evidence_domain_rate: result.ledger.evidence.length
        ? Number((domains.length / result.ledger.evidence.length).toFixed(3))
        : 0,
      d15_threads: result.d15.threads.length,
      d15_statements: result.d15.statements.length,
      d15_connection_reasons: result.d15.threads.map((thread) => thread.connection_reason),
      d15_thread_evidence_counts: result.d15.threads.map((thread) => thread.evidence_ids.length),
      d15_maturity_counts: result.d15.statements.reduce<Record<string, number>>((acc, statement) => {
        acc[statement.maturity] = (acc[statement.maturity] ?? 0) + 1;
        return acc;
      }, {}),
      diagnostics_count: result.diagnostics.length,
    });
  } catch (caught) {
    report.sessions.push({
      ...base,
      outcome: "FAIL",
      error: caught instanceof Error ? caught.message : String(caught),
    });
  }
}

await writeFile(
  "d15-real-session-shadow-report.json",
  JSON.stringify(report, null, 2),
  "utf8",
);

const failures = report.sessions.filter((item) => item.outcome === "FAIL");
console.log(JSON.stringify(report, null, 2));

if (failures.length) process.exitCode = 1;
