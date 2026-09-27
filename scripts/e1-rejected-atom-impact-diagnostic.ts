import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { extractCanonicalShadow } from "@/lib/canonical-shadow-extractor";
import { judgeCanonicalSupport } from "@/lib/canonical-support-judge";
import type { SessionRecord } from "@/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !process.env.OPENAI_API_KEY) {
  throw new Error("Required runtime validation secrets are not configured.");
}

const TARGET_SESSION = "797edb8d9213";
const KNOWN_REJECTED_ATOMS = [
  {
    id: "1",
    source_quote: "Finance Operations Manager with 10 years of experience.",
  },
  {
    id: "6",
    source_quote: "English and French fluent.",
  },
  {
    id: "7",
    source_quote: "Controlled baseline variant 4.",
  },
] as const;

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

function normalizeTokens(value: string): string[] {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((x) => x.length >= 3);
}

function overlap(a: string, b: string): number {
  const aa = new Set(normalizeTokens(a));
  const bb = new Set(normalizeTokens(b));
  if (!aa.size || !bb.size) return 0;
  let shared = 0;
  for (const token of aa) if (bb.has(token)) shared += 1;
  return Number((shared / Math.min(aa.size, bb.size)).toFixed(3));
}

const { data, error } = await supabase
  .from("sessions")
  .select("id,user_id,title,cv_text,job_description,cv_analysis,interview_strategy,preparation_language,preparation_purpose,interview_date,coaching_focus,job_description_url,status,created_at,updated_at");

if (error) throw new Error("Supabase session query failed: " + error.message);

const row = (data ?? []).find((candidate) => fingerprint(candidate.id) === TARGET_SESSION) as SessionRecord | undefined;
if (!row) throw new Error("Target session was not found: " + TARGET_SESSION);

const extraction = await extractCanonicalShadow(row);
const surviving = extraction.ledger.evidence;
const survivingSpans = extraction.ledger.source_spans.filter((span) => span.document_id.startsWith("CV-"));

const rejected = KNOWN_REJECTED_ATOMS.filter((item) =>
  extraction.diagnostics.rejected_atoms.includes(item.id),
);

const source_overlap = rejected.map((item) => ({
  atom_id: item.id,
  source_quote_fingerprint: fingerprint(item.source_quote),
  surviving_atoms: survivingSpans
    .map((span) => ({
      evidence_id: extraction.ledger.evidence.find((atom) => atom.source_span_id === span.id)?.id ?? null,
      source_span_fingerprint: fingerprint(span.text),
      token_overlap: overlap(item.source_quote, span.text),
    }))
    .filter((candidate) => candidate.evidence_id !== null)
    .sort((a, b) => b.token_overlap - a.token_overlap)
    .slice(0, 3),
}));

let support: unknown;
let support_error: string | null = null;
try {
  const judged = await judgeCanonicalSupport(row, extraction.ledger);
  support = judged.ledger.support_judgments.map((judgment) => ({
    requirement_id: judgment.requirement_id,
    facet_id: judgment.facet_id,
    status: judgment.status,
    supporting_evidence_ids: judgment.supporting_evidence_ids,
  }));
} catch (caught) {
  support_error = caught instanceof Error ? caught.message : String(caught);
}

const facets = extraction.ledger.requirements.flatMap((requirement) =>
  requirement.facets.map((facet) => ({
    requirement_id: requirement.id,
    facet_id: facet.id,
    facet_type: facet.type,
    facet_source_quote_fingerprint: fingerprint(
      extraction.ledger.source_spans.find((span) => span.id === facet.source_span_id)?.text ?? "",
    ),
  })),
);

const report = {
  mode: "E1_REJECTED_ATOM_IMPACT_DIAGNOSTIC",
  privacy_scope: {
    target_session_only: true,
    captures_source_quote_fingerprints: true,
    captures_full_documents: false,
    captures_full_source_quotes: false,
    captures_surviving_evidence_ids_only: true,
    production_writes: false,
    retry_performed: false,
    production_early_return_policy_changed: false,
  },
  session: {
    fingerprint: TARGET_SESSION,
    cv_fingerprint: fingerprint(row.cv_text),
    jd_fingerprint: fingerprint(row.job_description),
    cv_chars: row.cv_text.length,
    jd_chars: row.job_description.length,
  },
  extraction: {
    observed_rejected_atom_ids: extraction.diagnostics.rejected_atoms,
    known_target_rejected_atoms_observed: rejected.map((item) => item.id),
    surviving_atom_ids: surviving.map((atom) => atom.id),
    surviving_atom_count: surviving.length,
    rejected_atom_count: extraction.diagnostics.rejected_atoms.length,
  },
  rejected_to_survivor_overlap: source_overlap,
  surviving_requirement_facets: facets,
  counterfactual_support_judge: {
    executed_on_surviving_ledger_only: true,
    support_error,
    judgments: support ?? null,
  },
};

await writeFile("e1-rejected-atom-impact-diagnostic-report.json", JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
