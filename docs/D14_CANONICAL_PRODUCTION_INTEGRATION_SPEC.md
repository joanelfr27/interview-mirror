# D14 — Canonical Production Integration

## Purpose

D14 makes the validated D13 universal ingestion boundary the single production ingestion path used by the preparation flow and analysis API.

## Scope

- Keep D13's canonical PDF, Word, link, paste, normalization, hashing, timeout, redirect, and SSRF behavior unchanged.
- Remove the obsolete server PDF extraction endpoint and its dedicated `pdf-parse` dependency.
- Remove dead legacy job-description HTML scraping/fetch helpers from the analysis route.
- Keep analysis input validation fail-closed on canonical CV/JD documents.
- Preserve D12 journey semantics, session continuity, experience/interview language separation, and the D1–D10 canonical evidence architecture.
- Add regression tests proving the legacy ingestion path cannot silently return.

## Non-goals

D14 does not redesign Professional Mirror, Professional Story, Strategy, evidence extraction, coaching, voice, interviewer adaptation, or longitudinal learning.

## Acceptance criteria

- **D14-01 Single ingestion boundary:** CV/JD preparation uses `universal-ingestion.ts` for supported sources.
- **D14-02 No legacy PDF endpoint:** `src/app/api/extract-pdf/route.ts` is removed.
- **D14-03 No legacy PDF parser:** `pdf-parse` and `@types/pdf-parse` are absent from package manifests and lockfile.
- **D14-04 No legacy JD fetch path:** analysis no longer contains the old direct HTML scraping/fetch helpers.
- **D14-05 Canonical analysis gate:** analysis still rejects requests without a canonical CV and requires canonical JD input for upcoming interviews.
- **D14-06 D12 preserved:** journey/session/language semantics remain unchanged.
- **D14-07 Validation:** typecheck, canonical tests, and production build pass.

## Production invariant

> Every CV/JD source entering analysis is represented by the D13 canonical ingestion contract before analysis or persistence.

D14 is complete only when the invariant is enforced by code and protected by regression tests.
