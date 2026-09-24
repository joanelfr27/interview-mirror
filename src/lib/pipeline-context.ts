import type { PipelineContext, EvidenceLanguage } from "@/lib/canonical-evidence-model";

/**
 * Language is context, not evidence.
 *
 * source_language = language of source material
 * product_language = language used by the Mirror UI/explanations
 * interview_language = language used for questions, answers and verbal cues
 */
export type { PipelineContext, EvidenceLanguage };

export function normalizePipelineContext(input: Partial<PipelineContext> & {
  source_language: EvidenceLanguage;
}): PipelineContext {
  return {
    source_language: input.source_language,
    product_language: input.product_language ?? "en",
    interview_language: input.interview_language ?? input.product_language ?? "en",
  };
}
