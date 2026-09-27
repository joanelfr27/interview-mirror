import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { extractCanonicalShadow } from "@/lib/canonical-shadow-extractor";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !process.env.OPENAI_API_KEY) {
  throw new Error("Required diagnostic secrets are not configured.");
}

const TARGET_SESSIONS = new Set(["797edb8d9213", "788e31f7e22e"]);
const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

const { data, error } = await supabase
  .from("sessions")
  .select("id,title,cv_text,job_description")
  .not("cv_text", "is", null)
  .not("job_description", "is", null)
  .order("created_at", { ascending: false });

if (error) throw new Error("Supabase session query failed: " + error.message);

const sessions = (data ?? []).filter(
  (row) => TARGET_SESSIONS.has(fingerprint(row.id)),
);

if (sessions.length !== TARGET_SESSIONS.size) {
  throw new Error(
    `Expected exactly ${TARGET_SESSIONS.size} pinned sessions, found ${sessions.length}.`,
  );
}

const report = {
  mode: "E1_REJECTED_ATOM_DIAGNOSTIC",
  privacy_scope: {
    rejected_atoms_only: true,
    captures_candidate_derived_prose: true,
    captures_full_documents: false,
    captures_nearest_cv_line_only_for_source_quote_mismatch: true,
    standard_runtime_report_unchanged: true,
  },
  sessions: [] as Array<Record<string, unknown>>,
};

for (const row of sessions) {
  const result = await extractCanonicalShadow(
    {
      id: row.id,
      user_id: "",
      title: row.title ?? "",
      cv_text: row.cv_text,
      job_description: row.job_description,
      cv_analysis: null,
      interview_strategy: null,
      preparation_language: "en",
      preparation_purpose: null,
      interview_date: null,
      coaching_focus: null,
      job_description_url: null,
      status: "diagnostic",
      created_at: "",
      updated_at: "",
    },
    { captureRejectedAtomDiagnostics: true },
  );

  report.sessions.push({
    session: fingerprint(row.id),
    cv: fingerprint(row.cv_text),
    jd: fingerprint(row.job_description),
    cv_chars: row.cv_text.length,
    jd_chars: row.job_description.length,
    rejected_atom_diagnostics: result.diagnostics.rejected_atom_diagnostics ?? [],
  });
}

console.log(JSON.stringify(report, null, 2));
await writeFile(
  "e1-rejected-atom-diagnostic-report.json",
  JSON.stringify(report, null, 2),
  "utf8",
);
