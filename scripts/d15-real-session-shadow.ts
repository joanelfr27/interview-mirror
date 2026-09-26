// Runtime validation only; no production writes.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { runD16ShadowRuntimeIntegration } from "@/lib/d16-shadow-runtime-integration";
import {
  buildD16DependencySnapshot,
  buildD16Strategy,
  validateD16Strategy,
} from "@/lib/d16-personalized-interview-strategy";
import type { RoleCapabilityModel } from "@/lib/role-capability-model";
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
function buildShadowRoleCapabilityModel(requirements: Array<{ id: string; normalized_requirement: string }>, roleTitle: string): RoleCapabilityModel {
  return {
    version: "rcm-v1",
    model_id: "d16-shadow-runtime",
    role_family: "shadow-runtime",
    role_title: roleTitle || "Runtime Shadow Role",
    requirements: requirements.map((requirement, index) => ({
      capability_id: "D16-SHADOW-CAP-" + String(index + 1),
      normalized_requirement: requirement.normalized_requirement,
      baseline_criticality: index === 0 ? "CRITICAL" : index === 1 ? "IMPORTANT" : "SUPPORTING",
      source: { source_type: "ADMIN_CURATED", source_id: "d16-shadow-runtime", source_version: "1" },
      canonical_requirement_id: requirement.id,
    })),
  };
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
const seenJd = new Set<string>();

for (const row of (data ?? []) as SessionRow[]) {
  if (!row.cv_text?.trim() || !row.job_description?.trim()) continue;
  const cvKey = fingerprint(row.cv_text);
  const jdKey = fingerprint(row.job_description);
  if (seenCv.has(cvKey) || seenJd.has(jdKey)) continue;
  seenCv.add(cvKey);
  seenJd.add(jdKey);
  chosen.push(row);
  if (chosen.length === 15) break;
}

if (chosen.length < 15) {
  throw new Error(`Expected at least 15 distinct CV/JD sessions, found ${chosen.length}.`);
}

const report = {
  run: {
    mode: "D15_REAL_SESSION_SHADOW",
    writes_performed: false,
    sessions_requested: chosen.length,
    d15_d16_connected_flow: true,
    d16_strategy_validation: "REQUIRED",
    distinct_cv_count: new Set(chosen.map((row) => fingerprint(row.cv_text))).size,
    distinct_jd_count: new Set(chosen.map((row) => fingerprint(row.job_description))).size,
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
    const canonicalRequirements = result.ledger.requirements.map((requirement) => ({
      id: requirement.id,
      normalized_requirement: requirement.normalized_requirement,
    }));
    const roleCapabilityModel = buildShadowRoleCapabilityModel(canonicalRequirements, row.title);
    const d16Input = {
      mirror: result.d15,
      bridge: result.d6,
      role_capability_model: roleCapabilityModel,
      ledger: result.ledger,
      canonical_requirements: canonicalRequirements,
      jd_present: Boolean(row.job_description.trim()),
      jd_fingerprint: "sha256:" + createHash("sha256").update(row.job_description, "utf8").digest("hex"),
      dependency_snapshot: null as never,
    };
    d16Input.dependency_snapshot = buildD16DependencySnapshot(d16Input);
    const d16 = buildD16Strategy(d16Input);
    const d16Validation = validateD16Strategy(d16, d16Input);
    if (!d16Validation.valid) {
      throw new Error("D16 strategy validation failed: " + d16Validation.errors.join(" | "));
    }
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
      d16_version: d16.version,
      d16_d6_version: d16.d6_version,
      d16_role_capability_model_version: d16.role_capability_model_version,
      d16_tensions: d16.tensions.length,
      d16_actions: d16.actions.length,
      d16_tension_requirement_ids: d16.tensions.map((tension) => tension.requirement_id),
      d16_action_dispatchers: d16.actions.map((action) => action.dispatcher),
      d16_dependency_snapshot_matches_d15: d16.dependency_snapshot.d15_fingerprint === buildD16DependencySnapshot(d16Input).d15_fingerprint,
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
