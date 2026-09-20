# Strategy Breakthrough Experiment — Belief State + Verification

## Objective
Determine whether Strategy can produce a materially stronger WOW moment by modeling interviewer belief formation and explicitly separating what the CV proves from what the interview must verify.
This is research only. It does not change the production Strategy page or production inference path.

## Core model
Strategy is not the final truth about the candidate.
- Strategy = evidence-based hypothesis
- Interview Practice = verification mechanism
- Feedback = observed evidence
- Retest = updated positioning

Evidence states:
1. PROVEN — CV contains sufficiently explicit evidence for the requirement.
2. PLAUSIBLE_UNCONFIRMED — CV creates a credible signal, but ownership, depth, scope, scale, decision authority, recency, or context is not established.
3. NOT_ESTABLISHED — CV provides no meaningful evidence for the requirement.
4. CONTRADICTED — only after interview evidence explicitly conflicts with the current hypothesis; never infer this from CV omission.

A missing detail is therefore not automatically a weakness.

## Interviewer Belief Gap
For each strategic tension:
JD requirement → evidence available → belief interviewer can reasonably form → unresolved belief → reason it remains unresolved → evidence that would resolve it → verification target → preparation consequence.
The engine must not jump directly from CV omission to candidate weakness.

## Strategic object
Each tension should conceptually contain:
- target_requirement
- evidence_state
- interviewer_belief
- evidence_available
- evidence_boundary
- unresolved_belief
- why_unresolved
- verification_target
- confirmation_evidence
- preparation_consequence
- supporting_fact_ids
- forbidden_inference

## Candidate-facing separation
### Ce que vous devez démontrer
Positive proof objective: what evidence must the candidate produce for the interviewer to reach the required belief.
### Points d'attention
Residual uncertainty: what remains unresolved after reading the CV.
These two fields must not be paraphrases.

## Breakthrough test
An insight is non-generic only when it identifies:
1. A specific role requirement.
2. A specific evidence boundary.
3. A distinct interviewer belief.
4. A residual uncertainty caused by that boundary.
5. A concrete verification target.
6. A preparation consequence that changes what the candidate should rehearse.

Reject generic statements such as demonstrate leadership, show stakeholder management, prove you can work under pressure, highlight finance experience, strengthen communication, or show ownership unless tied to a specific evidence boundary and interviewer belief.

## Synthetic experiment
Use the existing five cases:
- A — Strong evidence, incomplete ownership
- B — Transferable capability
- C — Senior title, unclear decision authority
- D — Multi-fact reasoning
- E — Genuine verification gap

Compare three offline variants:
1. Existing strategic reasoning.
2. Existing reasoning plus an embedded skeptical senior hiring-manager persona.
3. Belief State + Verification Target: evidence → belief state → unresolved belief → verification target → strategy.

Nemotron and DeepSeek remain research probes only; they are not production dependencies.

## Evaluation dimensions
Score each output independently from 0–2 on:
- Evidence grounding
- Correct evidence state
- Interviewer-belief realism
- Non-obviousness
- Verification usefulness
- Preparation impact
- Separation of must-demonstrate vs point-of-attention
- Hallucination resistance

A useful insight should add information implicit in the evidence graph, not merely reword the CV or JD.

## Delta-value test
For every candidate insight ask:
Could the same insight have been produced by a competent interviewer who only saw the supplied CV and JD?
Then ask:
Does the insight identify something the candidate genuinely needs to verify in practice?
If not, it is decorative rather than strategic.

## Anti-hallucination rule
Never infer ownership from a senior title; decision authority from participation; scale from a generic regional label; mastery from qualification; industry experience from transferable experience; outcome from responsibility; or direct capability from keyword overlap.
An omitted CV detail remains unknown until interview evidence confirms or contradicts the hypothesis.

## Interview Practice handoff
Every PLAUSIBLE_UNCONFIRMED or NOT_ESTABLISHED tension should become a diagnostic interview target:
What answer would allow us to move this belief from uncertain to confirmed?

After the candidate answers, classify the result as:
- CONFIRMED
- PARTIALLY_CONFIRMED
- NOT_CONFIRMED
- CONTRADICTED
- NEW_EVIDENCE

This creates the closed loop between Strategy and Interview Practice.

## Production gate
Do not integrate this architecture into production until the experiment demonstrates materially stronger, evidence-grounded and actionable insights than the existing formulation.
No production UI change is part of this experiment.