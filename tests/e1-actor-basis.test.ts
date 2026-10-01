import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTOR_BASIS_EXTRACTION_RULE,
  canonicalizeRawCandidateAtom,
  type RawCandidateAtom,
} from "../src/lib/canonical-shadow-extractor.ts";
import {
  effectiveActorBasis,
  validateAtomicEvidenceAgainstSource,
  type AtomicEvidence,
  type ActorBasis,
} from "../src/lib/canonical-evidence-model.ts";

function raw(source_quote: string, actor_basis: ActorBasis, actor = "candidate", normalized_action = source_quote): RawCandidateAtom {
  return {
    id: "A1", source_quote, actor, actor_basis, ownership: "UNKNOWN",
    normalized_action, object: source_quote,
    domain: null, jurisdiction: null, situation: null, tools_or_systems: [], standards: [],
    quantity: null, currency: null, team_size: null, scope: null, start: null, end: null,
    recency: null, outcome: null, assertion_type: "RESPONSIBILITY", polarity: "AFFIRMATIVE",
    has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false,
    extraction_confidence: 1,
  };
}

function atom(source: string, basis: ActorBasis, actor: string, normalized_action = source): AtomicEvidence {
  return {
    id: "A1", source_span_id: "S1",
    provenance: { source_type: "CV", language: "en", extraction_method: "LLM" },
    subject: { actor, ownership: "UNKNOWN", actor_basis: basis },
    action: { normalized_action, object: source },
    context: {}, scale: {}, time: {}, outcome: null,
    assertion: { type: "RESPONSIBILITY", polarity: "AFFIRMATIVE" },
    verifiability: { has_quantifiable_metric: false, has_third_party_entity: false, has_time_anchor: false },
    extraction_confidence: 1,
  };
}

test("actor-basis prompt distinguishes implicit CV agency from genuine unspecified agency", () => {
  assert.match(ACTOR_BASIS_EXTRACTION_RULE, /subjectless action bullets/i);
  assert.match(ACTOR_BASIS_EXTRACTION_RULE, /nominal CV bullets/i);
  assert.match(ACTOR_BASIS_EXTRACTION_RULE, /agentless passives/i);
  assert.match(ACTOR_BASIS_EXTRACTION_RULE, /impersonal constructions/i);
  assert.match(ACTOR_BASIS_EXTRACTION_RULE, /Supported the team that reconciled/i);
});

test("E1-ACTOR-F1: paraphrased explicit-other actor fails closed to unspecified, never candidate", () => {
  const out = canonicalizeRawCandidateAtom(
    raw("Les écarts ont été rapprochés par l'équipe paie.", "EXPLICIT_OTHER", "payroll team"),
    "Les écarts ont été rapprochés par l'équipe paie.",
  );
  assert.equal(out.actor, "unspecified");
  assert.equal(out.actor_basis, "UNSPECIFIED");
});

test("exact explicit-other actors survive in EN and FR", () => {
  const en = canonicalizeRawCandidateAtom(raw("The payroll team reconciled the cutoffs.", "EXPLICIT_OTHER", "payroll team"), "The payroll team reconciled the cutoffs.");
  const fr = canonicalizeRawCandidateAtom(raw("Les écarts ont été rapprochés par l'équipe paie.", "EXPLICIT_OTHER", "l'équipe paie"), "Les écarts ont été rapprochés par l'équipe paie.");
  assert.equal(en.actor, "payroll team");
  assert.equal(en.actor_basis, "EXPLICIT_OTHER");
  assert.equal(fr.actor, "l'équipe paie");
  assert.equal(fr.actor_basis, "EXPLICIT_OTHER");
});

test("subjectless and nominal CV forms preserve implicit candidate attribution", () => {
  for (const source of [
    "Reconciled payroll cutoffs and statutory deadlines.",
    "Implementation of monthly compliance controls.",
    "Rapprochait les dates de paie et les échéances fiscales.",
    "Rapprochement des dates de paie et des échéances fiscales.",
    "Mise en place d'un calendrier de conformité.",
  ]) {
    const out = canonicalizeRawCandidateAtom(raw(source, "IMPLICIT_CANDIDATE"), source);
    assert.equal(out.actor, "candidate", source);
    assert.equal(out.actor_basis, "IMPLICIT_CANDIDATE", source);
  }
});

test("true agentless passives and impersonal forms remain unspecified", () => {
  for (const source of [
    "Payroll cutoffs were reconciled with statutory deadlines.",
    "A compliance calendar was implemented.",
    "Les dates de paie ont été rapprochées des échéances fiscales.",
    "Un calendrier de conformité a été mis en place.",
    "On a procédé au rapprochement des dates.",
  ]) {
    const out = canonicalizeRawCandidateAtom(raw(source, "UNSPECIFIED", "unspecified"), source);
    assert.equal(out.actor, "unspecified", source);
    assert.equal(out.actor_basis, "UNSPECIFIED", source);
  }
});

test("explicit candidate-involving actors require a source marker and remain separate from ownership", () => {
  for (const source of ["I reconciled payroll cutoffs.", "We reconciled payroll cutoffs.", "J'ai rapproché les dates de paie.", "J’assure le suivi des clôtures.", "Nous avons rapproché les dates de paie."]) {
    const action = source.replace(/^(?:I|We|J['’][a-zà-öø-ÿ]+|Nous avons)\s+/i, "");
    const out = canonicalizeRawCandidateAtom(raw(source, "EXPLICIT_CANDIDATE", "candidate", action), source);
    assert.equal(out.actor, "candidate", source);
    assert.equal(out.actor_basis, "EXPLICIT_CANDIDATE", source);
    assert.equal(out.ownership, "UNKNOWN", source);
  }
  const unsupported = canonicalizeRawCandidateAtom(raw("Payroll cutoffs were reconciled.", "EXPLICIT_CANDIDATE"), "Payroll cutoffs were reconciled.");
  assert.equal(unsupported.actor_basis, "UNSPECIFIED");
  assert.equal(unsupported.actor, "unspecified");

  const possessiveOther = canonicalizeRawCandidateAtom(raw("My manager reconciled payroll cutoffs.", "EXPLICIT_CANDIDATE", "candidate", "reconciled payroll cutoffs"), "My manager reconciled payroll cutoffs.");
  assert.equal(possessiveOther.actor_basis, "UNSPECIFIED");
  assert.equal(possessiveOther.actor, "unspecified");

  const mixedEn = canonicalizeRawCandidateAtom(raw("I supported the payroll team that reconciled accounts.", "EXPLICIT_CANDIDATE", "candidate", "reconciled accounts"), "I supported the payroll team that reconciled accounts.");
  assert.equal(mixedEn.actor_basis, "UNSPECIFIED");
  assert.equal(mixedEn.actor, "unspecified");

  const mixedFr = canonicalizeRawCandidateAtom(raw("Nous avons aidé l'équipe qui a rapproché les comptes.", "EXPLICIT_CANDIDATE", "candidate", "a rapproché les comptes"), "Nous avons aidé l'équipe qui a rapproché les comptes.");
  assert.equal(mixedFr.actor_basis, "UNSPECIFIED");
  assert.equal(mixedFr.actor, "unspecified");
});

test("source validator mechanically verifies explicit actor bases", () => {
  const span = (text: string) => ({ id: "S1", document_id: "CV", text, start_offset: 0, end_offset: text.length, language: "en" });
  assert.deepEqual(validateAtomicEvidenceAgainstSource(atom("I reconciled payroll cutoffs.", "EXPLICIT_CANDIDATE", "candidate", "reconciled payroll cutoffs"), span("I reconciled payroll cutoffs.")), []);
  assert.ok(validateAtomicEvidenceAgainstSource(atom("Payroll cutoffs were reconciled.", "EXPLICIT_CANDIDATE", "candidate"), span("Payroll cutoffs were reconciled.")).some(e => e.includes("EXPLICIT_CANDIDATE")));
  assert.deepEqual(validateAtomicEvidenceAgainstSource(atom("The payroll team reconciled cutoffs.", "EXPLICIT_OTHER", "payroll team"), span("The payroll team reconciled cutoffs.")), []);
  assert.ok(validateAtomicEvidenceAgainstSource(atom("I supported the payroll team that reconciled accounts.", "EXPLICIT_CANDIDATE", "candidate", "reconciled accounts"), span("I supported the payroll team that reconciled accounts.")).some(e => e.includes("EXPLICIT_CANDIDATE")));
  assert.ok(validateAtomicEvidenceAgainstSource(atom("Nous avons aidé l'équipe qui a rapproché les comptes.", "EXPLICIT_CANDIDATE", "candidate", "a rapproché les comptes"), span("Nous avons aidé l'équipe qui a rapproché les comptes.")).some(e => e.includes("EXPLICIT_CANDIDATE")));
});
});

test("pre-change atoms retain today's candidate interpretation through compatibility policy", () => {
  const legacy = atom("Reconciled payroll cutoffs.", "IMPLICIT_CANDIDATE", "candidate");
  delete legacy.subject.actor_basis;
  assert.equal(effectiveActorBasis(legacy), "IMPLICIT_CANDIDATE");

  const legacyOther = atom("The payroll team reconciled cutoffs.", "EXPLICIT_OTHER", "payroll team");
  delete legacyOther.subject.actor_basis;
  assert.equal(effectiveActorBasis(legacyOther), "EXPLICIT_OTHER");

  const unspecified = atom("Payroll cutoffs were reconciled.", "UNSPECIFIED", "unspecified");
  delete unspecified.subject.actor_basis;
  assert.equal(effectiveActorBasis(unspecified), "UNSPECIFIED");
});
