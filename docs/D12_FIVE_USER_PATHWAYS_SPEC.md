# D12 — Five User Pathways Implementation Specification

Status: FROZEN IMPLEMENTATION CONTRACT
Baseline: D10 closure `d44e4d587d43bbd02b63baf6838c0ca0cbfc7503`
Working branch: `d12-five-user-pathways`

## 1. Purpose

D12 is the Journey & Continuity Layer. It orchestrates entry into the existing D1–D10 preparation infrastructure without creating a second reasoning pipeline.

D12 owns:
- the five user-facing journey entry points;
- New vs Returning routing;
- Upcoming Interview vs Improve Skills intent;
- continuity selection for existing preparation;
- independent Experience Language and Interview Language selection;
- routing into the existing preparation/session infrastructure.

D12 does not own:
- universal CV/JD ingestion (D13);
- Professional Mirror 2.0 or Professional Story 2.0 (D15);
- Strategy redesign (D16);
- interview engine or Coach Ami (D19+);
- evidence extraction, Fit & Gap, or canonical reasoning changes.

## 2. Five User Pathways

1. I have an interview coming
   - New
   - Upcoming Interview

2. I want to improve my interview skills
   - New
   - Improve Skills

3. Continue my preparation
   - Returning
   - Upcoming Interview
   - Must surface resumable preparation context.

4. Prepare for a new interview
   - Returning
   - Upcoming Interview
   - Creates fresh opportunity-specific preparation while retaining candidate continuity.

5. Continue improving my interview skills
   - Returning
   - Improve Skills
   - Must surface the existing learning/preparation context.

The five labels are UX entry points; the underlying reasoning model remains four canonical journeys.

## 3. Language contract

Experience Language and Interview Language are independent semantic fields.

- Experience Language: language used for candidate experience/context, explanations, coaching guidance and feedback.
- Interview Language: language used during interview practice and Coach Ami interview output.

Valid example: Experience = French, Interview = English.

A single generic language field must not be used as the semantic source of truth for both concepts.

## 4. Continuity rules

- Returning users must not be forced to re-upload a CV when a reusable CV exists.
- Existing preparation/session history remains attached to the candidate.
- "Continue" resumes existing preparation context.
- "Prepare for a new interview" preserves candidate continuity but creates a fresh opportunity-specific preparation context.
- A new opportunity must not inherit the previous opportunity's strategy as its strategy.
- Previous preparation remains evidence/history that may inform future coaching.
- Improve Skills may operate without a JD.
- Upcoming Interview remains opportunity-specific and uses the existing interview-preparation contract.
- Unknown interview date remains unknown; D12 must not fabricate one.

## 5. Acceptance matrix

| ID | Acceptance criterion |
|---|---|
| D12-01 | All five pathways are visible and distinct at the journey entry point. |
| D12-02 | Each pathway resolves deterministically to one of the four canonical journeys. |
| D12-03 | New vs Returning state is preserved through routing. |
| D12-04 | Upcoming Interview vs Improve Skills intent is preserved through routing. |
| D12-05 | Experience Language and Interview Language can be selected independently. |
| D12-06 | Existing saved CV/session continuity is reused rather than duplicated. |
| D12-07 | Continue preparation resumes the correct existing session/context. |
| D12-08 | Prepare for a new interview does not reuse the prior opportunity's strategy as current strategy. |
| D12-09 | Continue improving skills preserves prior coaching/learning context. |
| D12-10 | Improve Skills does not require a JD. |
| D12-11 | D12 introduces no company-profile questionnaire or manual company research requirement. |
| D12-12 | D12 does not duplicate CV/JD parsing; ingestion remains an explicit D13 boundary. |
| D12-13 | Existing D1–D10 analysis/strategy behavior remains reachable and contract-compatible. |
| D12-14 | Invalid/missing journey state fails closed rather than silently selecting an unrelated journey. |
| D12-15 | Typecheck, tests and production build pass before merge. |

## 6. Adversarial cases

- Returning user with no resumable session.
- Returning user with multiple sessions.
- Returning user choosing a new interview after a previous interview.
- Experience FR + Interview EN.
- Experience EN + Interview FR.
- Improve Skills with no JD.
- Upcoming Interview with missing date.
- Unknown interview date.
- Stale/deleted session reference.
- Direct navigation with malformed journey parameters.
- Existing CV present but no active preparation session.
- New opportunity where previous opportunity has a completed strategy.

## 7. Definition of done

D12 is complete only after:
1. implementation;
2. deterministic tests covering the acceptance matrix and adversarial cases;
3. typecheck;
4. production build;
5. CI;
6. independent audit against this frozen specification;
7. correction of confirmed defects;
8. final re-audit;
9. merge into the canonical product branch.

D12 must remain an orchestration/continuity layer. Scope expansion into D13–D25 is prohibited.
