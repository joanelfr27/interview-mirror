import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { CvAnalysis, EvidenceChainItem, InterviewStrategy, SessionLanguage, SessionRecord } from "@/types";
import type { StrategicPlan } from "@/lib/strategy-plan-types";

// ---------------------------------------------------------------------------
// Internal strategic reasoning model (Pass 1 output). Never exposed to the UI
// or persisted; it only exists to constrain and validate Pass 2 generation.
// ---------------------------------------------------------------------------