import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { judgeCanonicalSupport } from "@/lib/canonical-support-judge";
import type { SessionRecord } from "@/types";
import type { EvidenceLedger } from "@/lib/canonical-evidence-model";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !process.env.OPENAI_API_KEY) {
  throw new Error("Required runtime validation secrets are not configured.");
}

const TARGET_SESSION = "797edb8d9213";
const ATOM_ID = "6";
const ATOM_QUOTE = "English and French fluent.";
const FACET_ID = "4.2";
const FACET_QUOTE = "nécessite un anglais professionnel.";
const FACET_REQUIREMENT = "nécessite un anglais professionnel.";

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("sessions")
  .select("id,user_id,title,cv_text,job_description,cv_analysis,interview_strategy,preparation_language,preparation_purpose,interview_date,coaching_focus,job_description_url,status,created_at,updated_at");

if (error) throw new Error("Supabase session query failed: " + error.message);
const row = (data ?? []).find((candidate) => fingerprint(candidate.id) === TARGET_SESSION) as SessionRecord | undefined;
if (!row) throw new Error("Target session was not found: " + TARGET_SESSION);

const cvStart = row.cv_text.indexOf(ATOM_QUOTE);
if (cvStart < 0) throw new Error("Atom 6 source quote is not present in the target CV.");

const jdStart = row.job_description.indexOf(FACET_QUOTE);
if (jdStart < 0) throw new Error("Facet 4.2 source quote is not present in the target JD.");

const cvSpanId = "SPAN-CV-ATOM6";
const jdRequirementSpanId = "SPAN-JD-REQ4";
const jdFacetSpanId = "SPAN-JD-FACET4-2";

const ledger: EvidenceLedger = {
  source_spans: [
    { id: cvSpanId, document_id: "CV-" + row.id, text: ATOM_QUOTE, start_offset: cvStart, end_offset: cvStart + ATOM_QUOTE.length, language: "en" },
    { id: jdRequirementSpanId, document_id: "JD-" + row.id, text: row.job_description.substring(Math.max(0, jdStart - 55), jdStart + FACET_QUOTE.length), start_offset: Math.max(0, jdStart - 55), end_offset: jdStart + FACET_QUOTE.length, language: "fr" },
    { id: jdFacetSpanId, document_id: "JD-" + row.id, text: FACET_QUOTE, start_offset: jdStart, end_offset: jdStart + FACET_QUOTE.length, language: "fr" },
  ],
  evidence: [{
    id: ATOM_ID,
    source_span_id: cvSpanId,
    provenance: { source_type: "CV", language: "en", extraction_method: "LLM" },
    subject: { actor: "candidate", ownership: "UNKNOWN" },
    action: { normalized_action: "fluent", object: "English and French" },
    context: {},
    scale: {},
    time: {},
    outcome: null,
    assertion: { type: "STATED", polarity: "AFFIRMATIVE" },
    verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false },
    extraction_confidence: 1,
  }],
  requirements: [{
    id: "4",
    source_span_id: jdRequirementSpanId,
    normalized_requirement: "English proficiency is required.",
    category: "language",
    salience: "CORE",
    facets: [{
      id: FACET_ID,
      type: "LEVEL",
      requirement: FACET_REQUIREMENT,
      source_span_id: jdFacetSpanId,
    }],
    extraction_confidence: 1,
  }],
  support_judgments: [],
  requirement_statuses: [{ requirement_id: "4", status: "UNRESOLVED" }],
  unresolved_items: [],
  candidate_elicitations: [],
  demonstration_objectives: [],
};

const judged = await judgeCanonicalSupport(row, ledger);
const judgment = judged.ledger.support_judgments.find((item) => item.facet_id === FACET_ID);

const report = {
  mode: "E1_ATOM6_FACET4_2_ISOLATED_SUPPORT_DIAGNOSTIC",
  privacy_scope: {
    target_session_only: true,
    captures_full_documents: false,
    captures_full_source_quotes: false,
    production_writes: false,
    extraction_performed: false,
    retry_performed: false,
  },
  target: {
    session_fingerprint: TARGET_SESSION,
    atom_id: ATOM_ID,
    atom_source_quote_fingerprint: fingerprint(ATOM_QUOTE),
    facet_id: FACET_ID,
    facet_source_quote_fingerprint: fingerprint(FACET_QUOTE),
  },
  input_contract: {
    atom_quote_present_in_cv: true,
    facet_quote_present_in_jd: true,
    atom_object: "English and French",
    atom_normalized_action: "fluent",
    facet_type: "LEVEL",
    facet_requirement: FACET_REQUIREMENT,
  },
  support_judgment: judgment ? {
    status: judgment.status,
    supporting_evidence_ids: judgment.supporting_evidence_ids,
    confidence: judgment.confidence,
    abstained: judgment.abstained,
  } : null,
  judge_diagnostics: judged.diagnostics,
};

await writeFile("e1-atom6-facet4-2-isolated-support-report.json", JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
