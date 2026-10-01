# D15 Semantic Significance — Disposable Blind Pilot #4 Protocol

Status: FROZEN BEFORE CASE CONSTRUCTION AND ANNOTATION

## 1. Purpose

Pilot #4 tests the bounded v1.1 clarification of D15 relationship grounding (G) and independent Mirror significance (S). It is a disposable diagnostic pilot, not production qualification and not a model-judge experiment.

Pilot #3 is not rescored. Pilot #4 uses novel cases.

## 2. Frozen codebook reference

- Codebook: D15 Semantic Significance Codebook v1.1
- Frozen commit: b2fcea37b5c18c79d2330b60d8ea95fd83a270c1
- Git blob SHA: 56f753c50e50aeb8532d7e7a70eeea04f0e69255
- SHA-256 of exact committed bytes: b81be37d8bd60b87179771151b66d5f595fd81d3e1a9a2d05d39157ca1796582
- Byte length: 21157

No semantic rule, example, definition, or expected label may change during Pilot #4. A material codebook change voids the pilot and requires a fresh disposable pilot.

## 3. Roles

- JOANEL_HUMAN_PRIMARY: sole human primary labeler.
- CLAUDE_AI_REFERENCE: independent AI reference labeler; explicitly not a second human labeler.
- ChatGPT/OpenAI: case designer and custody/protocol owner only; does not label Pilot #4 cases.
- Designer intent is a precommitted diagnostic reference, not automatic gold.

Human-vs-AI agreement must not be described as human inter-rater reliability.

For Claude, Round 1 and Round 2 should be labeled in fresh contexts that do not contain the other round's labels if operationally possible. If prior-round labels remain available, cross-round consistency must be reported as memory-qualified, not memory-free invariance.

## 4. Blinding and custody

Pilot #4 uses two rounds. Paired cases are split so one member of every pair appears in each round.

Before Round 1 is released:
1. both blind-round files are finalized;
2. the hidden administration key is finalized;
3. designer intent is finalized;
4. SHA-256 hashes of all four artifacts are recorded in a public manifest;
5. the public manifest and this protocol are committed;
6. only Round 1 is released.

Round 2 remains withheld until both Pilot #4 labelers have completed and hash-locked Round 1.

Pair identities, pair types, test dimensions, and designer intent remain hidden until both labelers have completed and hash-locked both rounds.

Blind packs must not contain pair IDs, pair types, test dimensions, designer intent, expected G/S labels, or hidden administrative metadata.

## 5. Mandatory annotation fields

Each case must record:
- case_id
- asserted_proposition
- G: YES | NO
- G_connector
- G_minimal_atom_subset
- G_licensing_span
- G_reason
- S: YES | NO
- S_relationship_type: PATTERN | INTERFACE | MECHANISM | RECURRENCE | NONE
- S_reason
- labeler_id

The asserted_proposition is determined before G and S and is the single semantic reading used for both axes.

## 6. Pilot design requirements

Pilot #4 must contain novel cases that directly test at least these boundaries:

1. shared cadence only: grounded co-recurrence but no meaningful relationship after cadence removal;
2. unsupported relational wording over shared cadence;
3. evidenced recurring relationship where a substantive relationship remains after cadence removal;
4. a non-recurrence lexical-ambiguity case testing the single-reading rule;
5. an identical-evidence wording contrast: neutral aggregation versus relational wording;
6. a deliberate connect-style INTERFACE versus MECHANISM boundary case.

At least one translation pair and at least one segmentation-invariance pair must be included. English and French must both be represented.

Cases must not reproduce Pilot #1–#3 cases, frozen teaching examples, Nancy, David, Marie, Thomas, Elena, or prior judge-qualification cases closely enough that a labeler can answer by recognition.

## 7. Precommitted interpretation of disagreements

G and S are binary gate dimensions.

S_relationship_type is descriptive and is reported separately. A type-only disagreement does not count as a G or S case-level disagreement in Pilot #4.

A case-level binary disagreement occurs when the human primary and AI reference differ on G or S for the same presentation.

Because CLAUDE_AI_REFERENCE is not a second human, the Pilot #3/two-human borderline rule does not automatically fire. Human-vs-AI disagreement is diagnostic evidence. The owner may block freeze when a disagreement exposes a genuine codebook gap; such a block must be explicitly recorded as an owner decision.

## 8. Acceptance criteria

Pilot #4 is deliberately small and diagnostic. It passes only if all of the following hold:

1. Human primary translation invariance: 100% on G and S for all translation pairs.
2. Human primary segmentation invariance: 100% on G and S for all segmentation pairs.
3. No human-primary violation of the single-reading rule across a matched wording test.
4. The shared-cadence-only case is distinguished from an evidenced recurring-relationship case under the cadence-removal test.
5. No unresolved systematic human-vs-AI disagreement identifies a missing or contradictory semantic rule.
6. No binary G/S disagreement is attributable to contradictory teaching examples or protocol ambiguity.
7. S-type disagreements are reported separately and do not fail the binary gate by themselves.

Raw human-vs-AI agreement for G and S is reported descriptively. No Cohen's kappa threshold is used as a pass/fail criterion for this small human-vs-AI pilot.

If a material semantic gap is found, STOP: do not tune cases, rescore completed annotations, or alter expected labels. Record the gap, revise the codebook in a new version, and require a fresh novel disposable pilot.

## 9. Reveal and decision

After both rounds are locked:
1. verify all artifact hashes;
2. reveal pair map/test dimensions;
3. reveal designer intent;
4. calculate human-primary translation and segmentation invariance;
5. report human-vs-AI G agreement, S agreement, and S-type agreement separately;
6. inspect every disagreement against the frozen codebook;
7. make an explicit freeze/hold decision.

Agreement with designer intent is diagnostic, not automatic correctness.

## 10. Production boundary

Pilot #4 makes no production-code change and selects no model judge.

The production status remains:

D15 Truth Boundary — LOCKED. Semantic Significance Judge — OPEN.
