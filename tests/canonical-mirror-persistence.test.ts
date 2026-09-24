import test from "node:test";
import assert from "node:assert/strict";
import { validateCanonicalMirrorSnapshot } from "@/lib/canonical-mirror-persistence";

test("D9 accepts an append-only canonical snapshot",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u2"],mirror_payload:{requirements:[]}});assert.equal(v.valid,true);});
test("D9 rejects duplicate source updates",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"s1",schema_version:"d9-v1",source_update_ids:["u1","u1"],mirror_payload:{}});assert.equal(v.valid,false);});
test("D9 rejects missing identity",()=>{const v=validateCanonicalMirrorSnapshot({session_id:"",schema_version:"",source_update_ids:[],mirror_payload:{}});assert.equal(v.valid,false);});

import { buildProfessionalMirror, validateProfessionalMirror } from "@/lib/professional-mirror";

const d15Span = (id: string, text: string) => ({ id, document_id: "CV", text, start_offset: 0, end_offset: text.length, language: "en" });
const d15Atom = (id: string, spanId: string, object: string, polarity: "AFFIRMATIVE" | "NEGATED" = "AFFIRMATIVE") => ({
  id, source_span_id: spanId,
  provenance: { source_type: "CV" as const, language: "en", extraction_method: "LLM" as const },
  subject: { actor: "candidate", ownership: "INDIVIDUAL" as const },
  action: { normalized_action: "managed", object }, context: {}, scale: {}, time: {}, outcome: null,
  assertion: { type: "RESPONSIBILITY" as const, polarity },
  verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false }, extraction_confidence: 1,
});
const d15Ledger = (evidence: ReturnType<typeof d15Atom>[], spans: ReturnType<typeof d15Span>) => ({
  source_spans: Array.isArray(spans) ? spans : [spans], evidence, requirements: [], support_judgments: [], requirement_statuses: [], unresolved_items: [], candidate_elicitations: [], demonstration_objectives: [],
});

test("D15 builds an evidence-grounded Mirror", () => {
  const s1 = d15Span("S1", "Managed regional finance."); const s2 = d15Span("S2", "Managed regional finance reporting.");
  const ledger = d15Ledger([d15Atom("A1", "S1", "regional finance"), d15Atom("A2", "S2", "regional finance")], [s1, s2] as never);
  const mirror = buildProfessionalMirror(ledger);
  assert.equal(mirror.version, "d15-v1"); assert.ok(mirror.threads.length >= 1); assert.ok(mirror.statements.some((x) => x.kind === "PATTERN"));
  assert.equal(validateProfessionalMirror(mirror, ledger).valid, true);
});

test("D15 excludes negated evidence", () => {
  const s1 = d15Span("S1", "Did not manage regional finance."); const ledger = d15Ledger([d15Atom("A1", "S1", "regional finance", "NEGATED")], [s1] as never);
  const mirror = buildProfessionalMirror(ledger); assert.equal(mirror.evidence.length, 0); assert.equal(mirror.statements.length, 0);
});
