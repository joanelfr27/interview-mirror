# D15 Pilot #4 — Round 1 Closure Record

Status: CLOSED AFTER ROUND 1 BY OWNER DECISION
Semantic disposition: G/S split SUPPORTED FOR CONTINUATION, NOT YET QUALIFIED
Codebook: v1.1 candidate (semantic text unchanged)

## 1. Stopping-time disclosure

Pilot #4 was terminated after Round 1 for scope/time reasons. This was not a prospectively pre-registered stopping point. Both Round-1 artifacts had been submitted and the AI-reference artifact had been inspected for custody/provenance before the owner decided not to execute Round 2. The Round-1 comparison is therefore diagnostic evidence, not a prospectively stopped validation result.

No Pilot #4 Round 2 or Pilot #5 will be run at this stage.

## 2. Custody erratum

The Pilot #4 materials recorded the v1.1 codebook SHA-256 as:

b81be37d8bd60b87179771151b66d5f595fd81d3e1a9a2d05d39157ca1796582

That value was recorded in error.

The authoritative committed v1.1 codebook is identified by:
- Git blob: 56f753c50e50aeb8532d7e7a70eeea04f0e69255
- byte length: 21,157
- committed bytes SHA-256: ee069d65aaf82c47588718849872d64cd27f1d6163d09311b570b86125f03b55

This erratum does not modify the sealed Round-1 case artifact, codebook semantics, annotations, or designer intent.

Joanel's submitted Round-1 PDF SHA-256:
4f3de1e43dfdeeb054a6999368a9c741a674baba109774307720f107131ba6f1

Claude AI-reference Round-1 artifact SHA-256:
fe510edb9aa58e90730240617371ac4e66853c6c3f86ccff7d580643e9346b84

## 3. Round-1 human-primary vs AI-reference comparison

| Case | Human primary | AI reference | Binary disposition |
|---|---|---|---|
| 7D3A91C4 | G=YES, S=NO, NONE | G=YES, S=NO, NONE | G/S match |
| C84F2B17 | G=YES, S=YES, RECURRENCE | G=NO, S=YES, RECURRENCE | G disagreement |
| 51E7D2A9 | G=YES, S=YES, MECHANISM | G=YES, S=YES, RECURRENCE | G/S match; type-only disagreement |
| A26C8F53 | G=NO, S=YES, INTERFACE | G=NO, S=YES, INTERFACE | G/S match |
| E93B4D61 | G=YES, S=NO, NONE | G=YES, S=NO, NONE | G/S match |
| 3F71A8CE | G=YES, S=YES, INTERFACE | G=NO, S=YES, INTERFACE | G disagreement |

Descriptive binary agreement:
- G: 4/6
- S: 6/6
- combined G/S decisions: 10/12

These are human-vs-AI diagnostic results, not human inter-rater reliability and not judge/model qualification performance.

## 4. Finding dispositions

### G-F1 — explicit-rule divergence

C84F2B17 is G=NO under frozen v1.1.

Section 2.4 states that shared cadence licenses co-recurrence, not a proposition that one activity links to, feeds, informs, or otherwise interacts with another. Section 1.1 requires G and S to evaluate the same asserted proposition and forbids weakening relational wording merely to satisfy G.

The human-primary G=YES label therefore diverged from the explicit frozen rule. This is not recorded as a codebook ambiguity.

Owner disposition: the v1.1 rule stands. Its counterintuitive nature is evidence that this boundary should not be left to unaided intuitive judgment.

### G-F2 — unresolved agent-attribution gap

3F71A8CE exposes a boundary not explicitly resolved by v1.1: whether a true agentless passive such as "were reconciled" licenses candidate-attributed wording such as "you work at the interface."

Neither the human-primary G=YES nor the AI-reference G=NO is privileged by this pilot. This remains a specification gap.

Important implementation distinction: true agentless/passive or impersonal evidence is not equivalent to the ordinary subjectless CV-bullet convention. "Reconciled payroll cutoffs..." normally attributes the action to the candidate; "payroll cutoffs were reconciled..." leaves the actor unstated. Any future ownership rule must preserve that distinction, including appropriate French constructions.

## 5. Deferred gates

Translation invariance and segmentation invariance were not established in Pilot #4 because Round 2 was not executed. They are DEFERRED, NOT WAIVED, and remain required in qualification-corpus validation.

Codebook v1.1 remains provisional. A second human must label at least the required sample before qualification gold is finalized.

## 6. Implementation boundary

No production truth-boundary change is authorized by this closure record alone.

G-F1 may be translated into mechanical enforcement only through the full-rigor truth-boundary change path because it touches locked truth behavior.

G-F2 requires an explicit specification before implementation. Any proposed ownership hardening must distinguish genuine passive/impersonal constructions from ordinary subjectless CV bullets and must include EN/FR positive and negative tests designed to detect false rejection.

Any truth-boundary change requires internal audit before external/CodeRabbit review.

## 7. Final disposition

Pilot #4 is closed.

The G/S split is supported for continuation but is not yet qualified. The 6/6 S agreement is an encouraging diagnostic signal. G-F1 is an explicit-rule divergence; G-F2 is an unresolved specification gap. Invariance remains a qualification gate. No additional disposable annotation round is required now.


## 8. Precommitted designer-intent reveal

The sealed designer intent is now unsealed because Pilot #4 is closed. It remains diagnostic and is not retroactively promoted to gold.

| Case | Human primary | AI reference | Precommitted designer intent | Three-way result |
|---|---|---|---|---|
| 7D3A91C4 | G=YES, S=NO, NONE | G=YES, S=NO, NONE | G=YES, S=NO, NONE | Full match |
| C84F2B17 | G=YES, S=YES, RECURRENCE | G=NO, S=YES, RECURRENCE | G=NO, S=YES, RECURRENCE | AI + intent match; human diverges on G |
| 51E7D2A9 | G=YES, S=YES, MECHANISM | G=YES, S=YES, RECURRENCE | G=YES, S=YES, RECURRENCE | Binary full match; human type differs |
| A26C8F53 | G=NO, S=YES, INTERFACE | G=NO, S=YES, INTERFACE | G=NO, S=YES, INTERFACE | Full match |
| E93B4D61 | G=YES, S=NO, NONE | G=YES, S=NO, NONE | G=YES, S=NO, NONE | Full match |
| 3F71A8CE | G=YES, S=YES, INTERFACE | G=NO, S=YES, INTERFACE | G=YES, S=YES, INTERFACE | Human + intent match; AI diverges on G |

Three-way interpretation:

- S is 6/6 aligned across human primary, AI reference, and precommitted designer intent.
- C84F2B17 confirms G-F1 as an explicit-rule divergence: the precommitted intent was G=NO, matching the frozen v1.1 rule and the AI reference.
- 51E7D2A9 confirms that the only disagreement is descriptive type: the precommitted intent was RECURRENCE, matching the AI reference. Binary G/S is unanimous.
- 3F71A8CE confirms G-F2 remains genuinely unresolved by the codebook: the precommitted intent was G=YES, matching the human primary, while the AI reference applied a stricter unstated-responsibility reading and returned G=NO. Designer intent does not resolve a rule the frozen codebook does not contain.
- The remaining three cases are full three-way matches.

This reveal strengthens the closure rather than changing it: the S split has consistent diagnostic support; G-F1 is settled by the existing frozen rule; G-F2 requires specification before any truth-boundary implementation.

No labels were changed after reveal and no Pilot #4 case was rescored.


## 9. G-F2 specification inputs before implementation

The Pilot #4 reveal provides the first diagnostic evidence about reader defaults for the agent-attribution gap. On 3F71A8CE, the human primary and precommitted designer intent both treated the agentless passive as candidate work, while the AI reference rejected candidate ownership. This 2-of-3 pattern is not a rule and does not resolve G-F2, but it establishes a user-facing cost for an automatically strict rejection policy: a strict interpretation may protect truth while conflicting with the reading candidates naturally expect.

G-F2 must distinguish at least three surface-form families in both English and French:

1. **Subjectless verb bullets.** Examples: "Reconciled payroll cutoffs..." and French CV-style verb bullets such as "Rapprochait les dates...". These normally carry implicit candidate agency in CV context and must not be rejected merely because an explicit grammatical subject is absent.
2. **Nominal CV bullets.** Examples: "Rapprochement des dates de paie et des échéances fiscales" and "Mise en place d'un calendrier de conformité". These contain no finite verb and no explicit agent but are common French CV constructions. For ownership handling they must not be mechanically classified as true passives. French nominal bullets are a high-risk false-rejection class and require explicit adversarial coverage.
3. **True passives.** Agentless passives such as "were reconciled" / "a été mis en place" leave actor identity ambiguous. Passives with a different stated agent such as "by the payroll team" / "par l'équipe paie" affirmatively attribute the action elsewhere and therefore cannot license candidate ownership of that action.

### Candidate-elicitation option

G-F2 does not have to collapse ambiguous agency into an ACCEPT-versus-REJECT binary. D15 already contains a QUESTION_BACK / candidate-elicitation concept. A genuine agentless passive with unresolved actor identity is a candidate for a neutral clarification path, for example:

"Did you do this reconciliation yourself, or support it?"

The French equivalent must preserve the same neutral ownership question rather than presume either direct ownership or non-ownership.

This option is preferable to silently manufacturing candidate agency and may preserve useful evidence that a strict rejection policy would discard. It remains a truth-boundary behavior change and is not authorized by this note alone.

### Required adversarial matrix before any G-F2 implementation

The full-rigor test design must include, at minimum, EN and FR examples covering:
- subjectless verb bullet with implicit candidate agency;
- nominal CV bullet with implicit candidate agency;
- true agentless passive with ambiguous agency;
- passive with another agent explicitly stated;
- explicit first-person/candidate agency control;
- negative controls where candidate ownership would be an unsupported upgrade.

Tests must check both false acceptance and false rejection. In particular, they must demonstrate that French nominal bullets and ordinary subjectless CV bullets are not swept into the ambiguous-passive path.

No G-F2 production implementation should begin until the specification chooses and documents the behavior for genuine agentless passives: reject, QUESTION_BACK, or another truth-safe state. The choice must then receive the full-rigor locked-truth-boundary review before external/CodeRabbit review.


## 10. E1 actor-attribution finding and pre-implementation specification inputs

### E1-ACTOR-F1 — unsafe actor canonicalization fallback

Inspection of the locked E1 extractor identified a distinct attribution defect in `canonicalizeRawCandidateAtom()`. The current actor canonicalization uses an exact-source check for a non-placeholder actor and falls back to the canonical placeholder `"candidate"` when that actor phrase is not found literally in the source.

This can misattribute another actor's work to the candidate. For example, if the source names `"équipe paie"` but the extractor correctly identifies that another actor performed the action while paraphrasing the actor as `"payroll team"`, the exact-source check fails and today's fallback becomes `"candidate"`. The safe failure state for a non-grounded actor is not candidate attribution; it is unspecified actor.

This finding is independent of G-F2 and must be tracked as a locked truth-boundary attribution error even if the eventual actor-basis design changes.

### Proposed additive actor-basis representation

Do not redefine or remove `subject.actor` for existing consumers. Specify an additive actor-attribution field, provisionally `actor_basis`, with these semantic states:

- `EXPLICIT_CANDIDATE`: source explicitly identifies the candidate as actor, including applicable first-person candidate markers.
- `IMPLICIT_CANDIDATE`: CV convention supports candidate agency without an explicit grammatical subject, including ordinary subjectless action bullets and nominal CV bullets.
- `EXPLICIT_OTHER`: source explicitly identifies another actor/agent as performing the asserted action.
- `UNSPECIFIED`: actor cannot safely be attributed, including genuine agentless passives and applicable impersonal constructions.

`actor_basis` answers the attribution basis question. It must remain separate from `subject.ownership`, which answers ownership level and retains its existing strict semantics.

For backward compatibility, existing stored atoms that predate `actor_basis` require an explicit migration/read policy. Candidate policy for evaluation: missing `actor_basis` is interpreted as `IMPLICIT_CANDIDATE` to preserve today's behavior. This is not approved until corpus impact and truth-safety are evaluated.

The unsafe fallback identified in E1-ACTOR-F1 must not survive the new representation: a model-returned actor that cannot be grounded to the source must never become candidate merely because exact matching failed.

### Validation asymmetry

The states are not equally mechanically verifiable.

`EXPLICIT_CANDIDATE` and `EXPLICIT_OTHER` should have source-grounding checks appropriate to their semantics. The `IMPLICIT_CANDIDATE` versus `UNSPECIFIED` distinction necessarily includes semantic/form judgment and therefore requires measured validation rather than pretending it can be completely guaranteed by a regex.

Before implementation, pre-register quantitative acceptance thresholds for at least:

1. **False-UNSPECIFIED rate** on genuine subjectless action bullets and nominal CV bullets. This must be near zero because false ambiguity would over-trigger candidate elicitation and turn the Mirror into a questionnaire.
2. **False-IMPLICIT_CANDIDATE rate** on genuine agentless passives/impersonal constructions. This must be low because false candidate attribution recreates G-F2 and can manufacture involvement.

Exact numeric thresholds must be frozen before the evaluation corpus is run, not chosen after observing results.

Evaluation must include real EN and FR CV text in addition to synthetic/adversarial controls.

### Required EN/FR adversarial dimensions

The full-rigor actor-attribution matrix must cover each relevant construction in English and French, including:

- subjectless verb/action bullet;
- nominal CV bullet, including forms such as `Rapprochement...` and `Implementation of...`;
- true passive without an agent;
- passive with an explicitly named agent (`by...` / `par...`);
- impersonal construction, including French `on`;
- explicit first-person candidate actor (`I` / `je`);
- team actor (`we` / `nous`);
- mixed construction such as `Supported the team that reconciled...`, ensuring the atom-local actor belongs to the asserted action rather than a nearby action;
- paraphrased-other-actor grounding failure corresponding to E1-ACTOR-F1.

Tests must check false candidate attribution and false ambiguity, not only schema validity.

### Intended downstream D15 behavior, conditional on E1 qualification

If and only if the E1 actor-basis change qualifies under the full-rigor truth-boundary process, the narrow D15 G-F2 routing condition becomes:

`actor_basis === "UNSPECIFIED"` **and** the proposed Mirror claim asserts candidate involvement.

That condition should route to the existing canonical unresolved-item / CandidateElicitation architecture rather than a D15-specific reparser or second evidence path.

Claims requiring ownership level remain governed by the existing ownership truth guards. `actor_basis` must not be used to upgrade UNKNOWN ownership to INDIVIDUAL, TEAM, SHARED, SUPERVISED, leadership, ownership, or other stronger claims.

No production implementation is authorized by this specification note. Next gates are specification audit, frozen thresholds/corpus design, adversarial tests, and external review before locked E1 code changes.
