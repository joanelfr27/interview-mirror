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
