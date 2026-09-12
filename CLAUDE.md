# Interview Mirror — Claude Code Project Rules

## Project purpose
Interview Mirror is an evidence-grounded interview coaching product. It uses a candidate's CV, target role, job description and interview context to help the candidate prepare, practise and improve interview performance.

## Frozen product direction
Treat the currently approved Interview Mirror design and product-flow matrix as the execution reference. Do not introduce strategic drift, unrelated features, or large architectural rewrites unless explicitly approved.

The agreed core user scenarios are:
1. New — upcoming interview: CV, target role, job description and interview date are required.
2. New — improve skills: CV and target role are required; job description is optional; no interview date is required.
3. Returning — upcoming interview: continue an existing interview-preparation journey using the saved context.
4. Returning — improve skills: continue an existing skills-development journey using the saved context.

## Implementation discipline
- Inspect the existing implementation before changing it.
- Make the smallest controlled change that fixes the identified defect or implements the approved item.
- Do not rewrite working components merely to make them cleaner or different.
- Do not modify unrelated functionality.
- Preserve existing behaviour unless the approved change explicitly requires a behaviour change.
- Work through the corrective implementation plan one controlled item at a time.
- When a requirement is ambiguous, stop and clarify rather than inventing a new product rule.

## Audit-version rule
- `audit-version` is the controlled branch used for the current audit/corrective implementation work.
- When auditing or correcting the project, inspect `audit-version` first unless explicitly instructed otherwise.
- Do not assume `main` contains the latest approved audit work.
- Before declaring a correction complete, verify the relevant code/configuration and its surrounding state.

## Evidence-grounded analysis
Interview analysis must remain grounded in the evidence actually available to the system. Do not fabricate candidate experience, job requirements, interview evidence, scores, or conclusions.

When evidence is insufficient, the system should state the limitation rather than presenting an invented or unsupported conclusion.

## Product flow
Maintain the intended progression:
CV + role/job context → analysis/diagnosis → candidate strategy → interview practice → evidence-based evaluation → targeted coaching/improvement.

Do not bypass required state or invent missing inputs just to make a screen appear complete.

## Language
Interview Mirror must support the agreed French/English bilingual experience. Do not introduce English-only text into user-facing flows where bilingual behaviour is required.

## Data and integration discipline
GitHub, Supabase and the local VS Code working copy are separate sources of project state. Do not claim they are synchronized without verifying the relevant state.

When database changes are required, verify the schema/data assumptions before changing application code that depends on them.

## Testing discipline
- Static inspection is not a substitute for live testing.
- When live testing is unavailable, record what was verified statically and what still requires runtime verification.
- After the approved corrections are complete, perform live testing from the synchronized VS Code environment before treating the implementation as fully validated.

## Git discipline
- Keep commits focused and descriptive.
- Do not force-push or rewrite history unless explicitly approved.
- Do not merge audit work into `main` without explicit approval.
- Before pushing local work, confirm the intended branch.

## Scope control
The objective is a reliable, coherent Interview Mirror—not maximum feature count. Prefer correctness, evidence integrity, state consistency, maintainability and the approved user experience over adding new functionality.

## Working principle
If a proposed change is not necessary for the current approved objective, do not implement it merely because it is technically interesting.
