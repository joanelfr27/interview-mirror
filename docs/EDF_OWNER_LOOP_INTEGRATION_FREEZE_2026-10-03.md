# EDF Owner-Loop Integration Acceptance Freeze — 2026-10-03

Status: PRE-CODING FREEZE. Development integration only. No merge to a locked line, production cutover, candidate-facing exposure, or database write is authorized by this document.

## Interpretation of the prior EDF run

- D15 behaved according to its relationship-discovery purpose. The two system-selected relationship questions were:
  1. "In this work, what did you personally own or do, and what did you mainly support or assist with?"
  2. "Did this change anything measurable? If so, what?"
- The requirement elicitation path is the selection failure: it generated ten generic unresolved-item questions rather than selecting the one or two requirement gaps most useful for interview preparation.
- Builder-authored questions about investor exposure, Mitsubishi valuation/deal work, and interview format are owner-test probes only. They are not credited to Interview Mirror.

## Shared candidate-attention budget

D15 relationship questions and requirement-gap elicitations share one budget.

- Hard maximum: 3 questions total before strategy value is shown.
- Target: 2 when two questions dominate expected decision usefulness.
- Selection must rank across both paths, not allocate a separate quota to each.
- Priority inputs: role criticality/salience, D16 tension relevance, assessment context when known, uncertainty that candidate self-report can resolve, and expected change to preparation action.
- For the EDF owner case, the expected top priorities before seeing the sealed answers are investor-facing/fundraising exposure and the boundary of the Mitsubishi investment work. This is an acceptance expectation, not a post-answer relabel.

## Integration acceptance list

Before another paid EDF run:

1. The validated D15 conversational answer path is wired into the canonical E1 -> D15 -> D16 development chain.
2. Elicited evidence carries actor_basis and existing ownership controls; candidate agency is not inferred from context.
3. Answering a D15 relationship question does not regenerate the proposition being clarified.
4. D15 and requirement elicitation obey the shared attention budget above.
5. Requirement elicitation selects/ranks questions rather than emitting one generic question for every unresolved item.
6. The runtime report records, word for word:
   - every selected question;
   - its origin (D15_RELATIONSHIP or REQUIREMENT_GAP);
   - its priority/ranking basis;
   - the candidate answer actually submitted;
   - the canonicalized elicited atom(s), including actor_basis and ownership;
   - the resulting gap classification where applicable.
7. Candidate answers enter only through CandidateElicitation / canonical elicitation processing and support re-judgment. No builder-authored evidence atoms.
8. CV-documented and CANDIDATE_SELF_REPORTED evidence remain distinct.
9. No production DB writes.
10. Runtime provenance records exact commit and relevant model/configuration identifiers.
11. Static typecheck, canonical tests and build must pass before a paid owner run.

## Sealed owner answers

Sealed on 2026-10-03 from the owner's first submitted wording. Preserve verbatim; do not improve grammar or content. Reuse only if the integrated system asks a genuinely equivalent question. Otherwise the owner answers the system's actual question.

### A1
I was in charge of the end to end woek. Which means making desktop research and interview relevant actors. This process leas to report with recommendations.

### A2
in my current role i am in charge of compliance and one the task i do in to mantain the correct signatory mandate and bank approval access. To be precise on maintain the record of the authorized bank signatory, remove and add when necessary and this imply updating the company registrstion certificate and shareing. Regarding the payment approvak this is anothet process where mainting it the correct approvals imply filling and making signing the necssary form and making sure those who need acces are granted acces.

### A3
i have had meeting with JICA who is instutional branch investor for Japan. We oftej talked about their investment strategy mainly the sector they have interest in and how companies like mitsubishi could partner

### A4
No. My work ended at the report and recommendation. This bit of the work was done at the headquarter. But i do no from studies how to perform NPV and IRR analysis

### A5
I knw EDF is the investment branch kf France and looking at the urgency of role i will probably be interviewed in round round with the head of EDF and maybe a regional finance manager

A5 is assessment-context speculation, not evidence about candidate experience and not an EDF-supplied fact.

## D16 evaluation after elicitation

Score the resulting strategy on whether it distinguishes and gives different preparation actions for:
- demonstrated experience;
- transferable experience (including JICA/institutional-development-finance exposure when elicited, Mitsubishi decision-support work, and restricted-funds experience when supported);
- genuine experience gaps (including valuation/IRR/deal execution/fund management where the candidate has not demonstrated professional ownership).

Role/sector knowledge must remain separately labeled from candidate evidence. Company-specific statements require JD support.

## Time box

If this integration cannot become statically clean within 1–2 days, run the best existing development path clearly labeled with its limitations. Do not extend the static loop indefinitely. The target remains the first complete real-case Mirror -> selected questions -> candidate answers -> strategy.
