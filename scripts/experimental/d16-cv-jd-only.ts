import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { AI_MODEL } from "@/lib/openai";
import { runD15BSemanticThreadEngine } from "@/lib/d15-semantic-thread-engine";
import { runD16ShadowRuntimeIntegration } from "@/lib/d16-shadow-runtime-integration";
import {
  buildD16DependencySnapshot,
  buildD16Strategy,
  validateD16Strategy,
  type D16Inputs,
} from "@/lib/d16-personalized-interview-strategy";
import type { RoleCapabilityModel } from "@/lib/role-capability-model";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";
import type { SessionRecord } from "@/types";

const PRODUCT_SOURCE_SHA = "bfd3f3042fa8ba79a2a96c90c9e222d2d00cfd7c";
const EDF_SESSION_FINGERPRINT = "8a05fcb6dbe3";
const EXPERIMENT_TYPE = "D16_CV_JD_ONLY_NO_CANDIDATE_ANSWERS";
const OUTPUT_PATH = "d16-cv-jd-only-report.json";
const SOURCE_MODULES = [
  "src/lib/canonical-shadow-extractor.ts",
  "src/lib/canonical-shadow-pipeline.ts",
  "src/lib/canonical-support-judge.ts",
  "src/lib/canonical-evidence-model.ts",
  "src/lib/canonical-reasoning-adapter.ts",
  "src/lib/canonical-evidence-router.ts",
  "src/lib/fit-gap-reasoning.ts",
  "src/lib/fit-gap-consumer.ts",
  "src/lib/demonstration-objective-consumer.ts",
  "src/lib/canonical-strategy-bridge.ts",
  "src/lib/professional-mirror.ts",
  "src/lib/d15-semantic-thread-engine.ts",
  "src/lib/d16-shadow-runtime-integration.ts",
  "src/lib/d16-personalized-interview-strategy.ts",
  "src/lib/role-capability-model.ts",
] as const;

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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sessionFingerprint(value: string): string {
  return sha256(value).slice(0, 12);
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required environment value ${name} is not configured.`);
  return value;
}

function sourceCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

async function verifyPinnedSource(): Promise<{
  git_commit: string;
  module_blob_shas: Record<string, string>;
  module_sha256: Record<string, string>;
}> {
  const commit = sourceCommit();
  if (commit !== PRODUCT_SOURCE_SHA) {
    throw new Error(`Product source must be ${PRODUCT_SOURCE_SHA}; found ${commit}.`);
  }

  const moduleBlobShas: Record<string, string> = {};
  const moduleSha256: Record<string, string> = {};
  for (const path of SOURCE_MODULES) {
    const committed = execFileSync("git", ["show", `HEAD:${path}`]);
    const working = await readFile(path);
    if (!working.equals(committed)) {
      throw new Error(`Pinned product module differs from HEAD: ${path}`);
    }
    moduleBlobShas[path] = execFileSync("git", ["rev-parse", `HEAD:${path}`], {
      encoding: "utf8",
    }).trim();
    moduleSha256[path] = sha256(committed);
  }
  return { git_commit: commit, module_blob_shas: moduleBlobShas, module_sha256: moduleSha256 };
}

function redactProtectedCvInput(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[REDACTED_PHONE]")
    .replace(/(Member\s+No\s*:\s*)\d+/gi, "$1[REDACTED_MEMBER_NUMBER]");
}

async function loadEdfSession(): Promise<SessionRow> {
  const supabase = createClient(
    requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironmentValue("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("sessions")
      .select("id,user_id,title,cv_text,job_description,cv_analysis,interview_strategy,preparation_language,preparation_purpose,interview_date,coaching_focus,job_description_url,status,created_at,updated_at")
      .not("cv_text", "is", null)
      .not("job_description", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + 499);

    if (error) throw new Error("Supabase session query failed: " + error.message);
    if (!data?.length) break;

    const matches = (data as SessionRow[]).filter((row) =>
      sessionFingerprint(row.id) === EDF_SESSION_FINGERPRINT &&
      Boolean(row.cv_text?.trim()) &&
      Boolean(row.job_description?.trim()),
    );
    if (matches.length > 1) throw new Error("EDF session fingerprint is not unique.");
    if (matches.length === 1) return matches[0];
    if (data.length < 500) break;
  }

  throw new Error(`EDF session ${EDF_SESSION_FINGERPRINT} with CV and JD was not found.`);
}

function buildShadowRoleCapabilityModel(
  requirements: Array<{ id: string; normalized_requirement: string }>,
  roleTitle: string,
): RoleCapabilityModel {
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

function assertNoCandidateElicitedAtoms(ledger: EvidenceLedger): void {
  if (ledger.evidence.some((atom) => atom.provenance.source_type === "CANDIDATE_ELICITED")) {
    throw new Error("CV+JD-only experiment failed closed: candidate-elicited evidence is present.");
  }
}

async function main(): Promise<void> {
  requiredEnvironmentValue("OPENAI_API_KEY");
  const provenance = await verifyPinnedSource();
  const row = await loadEdfSession();
  const session: SessionRecord = {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    cv_text: redactProtectedCvInput(row.cv_text),
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

  const result = await runD16ShadowRuntimeIntegration(session);
  assertNoCandidateElicitedAtoms(result.ledger);
  const d15Semantic = await runD15BSemanticThreadEngine(result.ledger);
  assertNoCandidateElicitedAtoms(result.ledger);

  const canonicalRequirements = result.ledger.requirements.map((requirement) => ({
    id: requirement.id,
    normalized_requirement: requirement.normalized_requirement,
  }));
  const roleCapabilityModel = buildShadowRoleCapabilityModel(canonicalRequirements, row.title);
  const d16InputBase: Omit<D16Inputs, "dependency_snapshot"> = {
    mirror: result.d15,
    bridge: result.d6,
    role_capability_model: roleCapabilityModel,
    ledger: result.ledger,
    canonical_requirements: canonicalRequirements,
    jd_present: true,
    jd_fingerprint: "sha256:" + sha256(row.job_description),
  };
  const d16Input: D16Inputs = {
    ...d16InputBase,
    dependency_snapshot: buildD16DependencySnapshot(d16InputBase),
  };
  const d16Strategy = buildD16Strategy(d16Input);
  const validation = validateD16Strategy(d16Strategy, d16Input);
  if (!validation.valid) {
    throw new Error("D16 strategy validation failed: " + validation.errors.join(" | "));
  }

  const report = {
    experiment_type: EXPERIMENT_TYPE,
    candidate_answers_consumed: 0,
    candidate_elicited_atoms: 0,
    product_source_sha: PRODUCT_SOURCE_SHA,
    session_fingerprint: sessionFingerprint(row.id),
    writes_performed: false,
    provenance: {
      git_commit: provenance.git_commit,
      workflow_run_id: process.env.GITHUB_RUN_ID ?? null,
      model: AI_MODEL,
      module_blob_shas: provenance.module_blob_shas,
      module_sha256: provenance.module_sha256,
    },
    inputs: {
      cv_fingerprint: sessionFingerprint(row.cv_text),
      jd_fingerprint: sessionFingerprint(row.job_description),
      cv_chars: row.cv_text.length,
      jd_chars: row.job_description.length,
      protected_cv_input_redacted: true,
    },
    e1: {
      completeness: result.completeness,
      diagnostics: result.diagnostics,
    },
    d6_bridge: result.d6,
    support_judgments: result.ledger.support_judgments,
    d15_professional_mirror: result.d15,
    d15_semantic: d15Semantic,
    d16_strategy: d16Strategy,
    d16_strategy_validation: validation,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
