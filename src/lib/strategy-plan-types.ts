export type StrategicTensionMode = "DIRECT" | "TRANSFERABLE" | "VERIFY_GAP";

export type StrategicTension = {
  id: string;
  mode: StrategicTensionMode;
  target_requirement_id: string;
  primary_evidence_node_id: string;
  supporting_fact_ids: string[];
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
