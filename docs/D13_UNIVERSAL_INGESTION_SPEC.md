# D13 — Universal CV/JD Ingestion Specification

## Purpose
D13 establishes one source-independent ingestion boundary for CVs and job descriptions. D12 must only select the journey; it must not contain document parsing or source-specific ingestion logic.

## Supported sources
For both CV and JD:
- PDF upload
- Word upload (.docx)
- link
- paste

Plain text/markdown may remain supported as a compatibility convenience.

## Canonical output
Every source is normalized before analysis:
- `text`: cleaned candidate/JD text
- `sourceType`: `pdf` | `word` | `link` | `paste` | `text`
- `sourceName`: optional original file name
- `sourceUrl`: optional URL
- `contentHash`: SHA-256 of normalized text

The analysis engine receives canonical text, never raw file bytes or source-specific structures.

## Rules
1. CV and JD use the same ingestion contract.
2. PDF/Word parsing is deterministic and fails closed when no readable text is produced.
3. Links are server-fetched through an authenticated ingestion endpoint.
4. Only http/https links are accepted.
5. Link redirects are bounded and fetches have a timeout.
6. Candidate-facing UI explains when link extraction fails and offers paste/upload fallback.
7. D13 does not implement Professional Mirror, Story, Strategy, or new journey logic.
8. D12 remains responsible only for journey/continuity routing.
9. Existing PDF behavior remains compatible.
10. Unsupported files are rejected with an actionable error.

## Acceptance
- D13-01: PDF CV works.
- D13-02: Word CV works.
- D13-03: CV link works.
- D13-04: CV paste works.
- D13-05: PDF JD works.
- D13-06: Word JD works.
- D13-07: JD link works.
- D13-08: JD paste works.
- D13-09: all sources normalize to one text contract.
- D13-10: empty/unreadable sources fail closed.
- D13-11: invalid URL schemes fail closed.
- D13-12: link fetching has timeout and bounded redirects.
- D13-13: D12 journey semantics remain unchanged.
- D13-14: canonical tests, typecheck and build pass.
