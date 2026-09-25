# D14x — Screenshot Capability

## Purpose

D14x adds screenshot/image input as a controlled supplemental ingestion capability without creating a second evidence architecture.

## Scope

- Accept an image/screenshot as an explicit user-provided source.
- Validate image type and bounded payload size before model processing.
- Preserve the original image as the source of visual evidence; do not silently convert visual content into fabricated text.
- Produce a canonical visual-ingestion result with source metadata and a deterministic content hash.
- Convert only the readable text produced by the explicit vision transcription step into the existing D13 canonical document contract; do not create a screenshot-specific evidence pipeline.
- Fail closed for unsupported media, empty payloads, and oversized payloads.
- The production path may use the existing OpenAI client for explicit screenshot transcription; this is transcription only, not evidence extraction.

## Non-goals

D14x does not replace D13 document ingestion, change the D14 CV/JD canonical gate, redesign evidence extraction, or introduce autonomous browser/computer use.

## Acceptance criteria

- **D14x-01 Image boundary:** screenshot/image input has one canonical validation and normalization boundary.
- **D14x-02 Type safety:** only explicitly supported image media types are accepted.
- **D14x-03 Size safety:** oversized image payloads are rejected before model processing.
- **D14x-04 Evidence integrity:** the original screenshot is SHA-256 hashed and that source hash is retained on the canonical document.
- **D14x-05 No hallucinated text:** visual ingestion never claims OCR/text extraction unless an explicit visual extraction step produced it.
- **D14x-06 Isolation:** D13/D14 document ingestion behavior remains unchanged.
- **D14x-07 Validation:** deterministic D14x tests cover validation, canonical convergence, and source-hash propagation; live vision behavior is isolated to the transcription step.

## Production invariant

> A screenshot is a canonical visual source, not an inferred text document. Any text or evidence derived from it must remain attributable to the visual source and to the explicit extraction step that produced it.
