# E1 Actor Attribution Basis / G-F2 — Full-Rigor Change Specification

Status: **PROVISIONAL — IMPLEMENTATION BRANCH ONLY; LOCKED E1 NOT CUT OVER**

## 1. Scope

This change addresses two related but distinct findings without changing the meaning of ownership:

- **E1-ACTOR-F1:** a non-candidate actor returned by the extractor can currently be converted to `candidate` when the returned actor phrase is not an exact source substring.
- **G-F2:** E1 currently collapses ordinary implicit CV agency and genuinely unspecified agency into the same `actor = candidate` placeholder, preventing D15 from safely identifying agentless passives.

The change must not create a D15 reparser or a second evidence ontology.

## 2. Frozen semantic distinction

`subject.actor` remains the existing actor string consumed by current code. A new optional `subject.actor_basis` records how candidate involvement is attributable:

- `EXPLICIT_CANDIDATE`: candidate or candidate-including group explicitly performs the atom-local action (I/je; we/nous).
- `IMPLICIT_CANDIDATE`: ordinary CV convention attributes the action to the candidate despite no written grammatical subject, including subjectless action bullets and nominal CV bullets.
- `EXPLICIT_OTHER`: another actor is explicitly stated as performing the atom-local action.
- `UNSPECIFIED`: the source does not safely establish the actor, including genuine agentless passives and unresolved impersonal constructions.

This field does **not** encode ownership level. `subject.ownership` remains unchanged and must continue to block unsupported upgrades such as individual ownership, leadership, driving, or process ownership.

## 3. Backward compatibility

Atoms persisted before this field existed are read as `IMPLICIT_CANDIDATE` by `effectiveActorBasis()`. This preserves current behavior for historical data rather than retroactively converting old evidence into unresolved agency.

This compatibility rule is a migration/read rule only. Newly extracted atoms must emit `actor_basis`.

## 4. Fail-closed actor grounding

For `EXPLICIT_OTHER`, the actor phrase must be an exact source substring. If the model identifies another actor but returns a paraphrase or otherwise non-grounded actor phrase, canonicalization must produce:

- `actor = "unspecified"`
- `actor_basis = "UNSPECIFIED"`

It must never fall back to `candidate`.

For `EXPLICIT_CANDIDATE`, an explicit candidate-involving marker must be present in the atom source quote. If not, canonicalization fails closed to `UNSPECIFIED`.

For `IMPLICIT_CANDIDATE`, `actor = "candidate"`.

For `UNSPECIFIED`, `actor = "unspecified"`.

## 5. Atom-locality

Actor basis belongs to the atom's own asserted action. Nearby actors/actions cannot supply agency.

Example: in “Supported the team that reconciled accounts,” an atom for the candidate's “Supported…” action may be candidate-attributed, but an atom asserting “reconciled accounts” cannot attribute that action to the candidate merely because the candidate appears elsewhere in the sentence.

## 6. Pre-registered acceptance thresholds

Thresholds are frozen before any real-corpus qualification result is inspected.

### 6.1 Mechanical/adversarial gate

Required: **100% pass** on all deterministic EN/FR regression cases.

Any E1-ACTOR-F1 recurrence (non-grounded other actor becoming candidate) is an automatic blocker.

Any unsupported ownership upgrade caused by `actor_basis` is an automatic blocker.

### 6.2 Real-CV actor-basis qualification gate

The scored corpus must contain human-labeled, atom-local examples drawn from real CV text, with English and French represented. Text may be privacy-sanitized only if grammatical voice/agency structure is preserved.

Two primary error rates:

1. **False-UNSPECIFIED rate (FU):** gold `IMPLICIT_CANDIDATE` classified `UNSPECIFIED`.
   - Qualification threshold: **<= 2.0% overall**.
   - Additional language guard: **<= 5.0% in EN and <= 5.0% in FR separately**.
   - Rationale: questionnaire inflation is a product failure; near-zero is required, while the per-language guard avoids hiding a French nominal-bullet defect inside aggregate performance.

2. **False-IMPLICIT-CANDIDATE rate (FI):** gold `UNSPECIFIED` classified `IMPLICIT_CANDIDATE`.
   - Qualification threshold: **<= 2.0% overall**.
   - Additional language guard: **<= 5.0% in EN and <= 5.0% in FR separately**.
   - Rationale: this is the truth-boundary error that recreates G-F2.

Hard safety override: a false candidate attribution on a case with an explicit different actor is **0 tolerated**, regardless of aggregate rates.

### 6.3 Minimum scored sample

Before qualification may be claimed:

- at least **100 gold IMPLICIT_CANDIDATE** examples, with at least 40 EN and 40 FR;
- at least **100 gold UNSPECIFIED** examples, with at least 40 EN and 40 FR;
- at least **40 EXPLICIT_OTHER** examples, including at least 15 EN and 15 FR;
- at least **40 EXPLICIT_CANDIDATE** examples, including I/je and we/nous;
- nominal bullets must be at least 30 of the IMPLICIT_CANDIDATE set, with at least 20 French nominal bullets.

If available real CVs do not yield enough genuine passives, qualification remains open; synthetic examples may strengthen adversarial coverage but cannot substitute for the real-CV minimum.

## 7. Required construction matrix

EN and FR coverage must include:

- subjectless action verb;
- nominal bullet (“Implementation of…”, “Rapprochement…”, “Mise en place…”);
- passive without agent;
- passive with explicit agent (by/par);
- impersonal construction, including French `on`;
- explicit I/je;
- explicit we/nous;
- mixed actor/action construction (“Supported the team that reconciled…”);
- paraphrased-other-actor grounding failure.

Both false attribution and false ambiguity are scored.

## 8. Corpus and labeling protocol

1. Build the corpus before running the candidate implementation over it.
2. Human labels are assigned from source text only, without seeing model output.
3. Record language, construction family, gold actor basis, and whether the example is nominal.
4. Freeze corpus hash and labels before qualification.
5. Development examples and qualification examples must be disjoint.
6. Do not tune prompts/rules on the sealed qualification set.
7. Report confusion matrix and the two pre-registered primary error rates.
8. Preserve privacy: qualification artifacts may store fingerprints/IDs and labels rather than CV text where possible; raw CV text must not be added to repository logs/artifacts.

## 9. D15 dependency

Only after E1 qualification may D15 consume the new signal.

The intended G-F2 routing rule is:

`effectiveActorBasis(atom) === "UNSPECIFIED"` **and** the proposed Mirror claim asserts candidate involvement -> route through the existing canonical unresolved-item / CandidateElicitation path.

No D15-specific grammar/voice parser is permitted.

Claims that require ownership level remain governed by existing ownership guards. Actor basis cannot upgrade `UNKNOWN` ownership.

## 10. Release gates

Before any merge/cutover to the locked E1 boundary:

1. Typecheck green.
2. Full canonical test suite green.
3. New actor-basis adversarial suite 100% green.
4. Internal code audit confirms no ownership weakening and no parallel evidence path.
5. External/CodeRabbit review has no unresolved blocker.
6. Real-CV qualification meets the pre-registered thresholds above.
7. Raw qualification results are read before any further tuning or cutover decision.

Until all seven pass, status is:

**E1 Actor Basis — IMPLEMENTED IN ISOLATION / NOT QUALIFIED / NO CUTOVER.**
