import { AI_MODEL, getOpenAI, languageInstruction, normalizeLanguage } from "@/lib/openai";
import type { InterviewStrategy, SessionLanguage, SessionRecord } from "@/types";
import { buildEvidenceMap, runStrategyEngineV2 } from "@/lib/strategy-engine";
import type { StrategicPlan, StrategicTension, StrategicTensionMode } from "@/lib/strategy-plan-types";

type CandidateEvidenceItem = {
  id: string;
  source_text: string;
  facts: Array<{ fact: string; category: string; exact_source_text: string }>;
  relationships: Array<{ from_fact: number; to_fact: number; relationship: string }>;
  relevant_jd_requirements: string[];
};

type CandidateEvidencePack = {
  evidence: CandidateEvidenceItem[];
};

export type StrategicTensionMode = "DIRECT" | "TRANSFERABLE" | "VERIFY_GAP";

export type StrategicTension = {
  id: string;
  mode: StrategicTensionMode;
  primary_evidence_node_id: string;
  target_requirement: string;
  interviewer_belief: string;
  interviewer_doubt: string;
  allowed_positioning: string;
  forbidden_inference: string;
};

export type StrategicPlan = {
  candidate_positioning: string;
  tensions: StrategicTension[];
  verification_points: string[];
  likely_questions: string[];
};