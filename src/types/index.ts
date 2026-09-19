export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export type SessionLanguage = "en" | "fr";

export type AnalysisProvenance = {
  preparation_language: SessionLanguage;
  jd_content_hash: string;
  cv_content_hash: string;
  contract_version: "v5.1";
};

export type EvidenceChainFact = {
  fact_id: string;
  fact: string;
  category: string;
  exact_source_text: string;
  requirement_relations?: AtomicFactRequirementRelation[];
};

export type JDRequirementType = "CAPABILITY" | "STANDARD" | "RESPONSIBILITY" | "DOMAIN" | "TOOL" | "QUALIFICATION";
export type JDRequiredLevel = "PREFERRED" | "KNOWLEDGE" | "WORKING" | "ADVANCED" | "OWNERSHIP";
export type DocumentedEvidenceLevel = "MENTION" | "EXPOSURE" | "PRACTICE" | "RESPONSIBILITY" | "OWNERSHIP" | "MASTERY";
export type FactRequirementRelationType = "DIRECT" | "RELATED";

export type CanonicalJDRequirement = {
  requirement_id: string;
  capability: string;
  requirement_type: JDRequirementType;
  required_level: JDRequiredLevel;
  exact_jd_source_text: string;
};

export type AtomicFactRequirementRelation = {
  requirement_id: string;
  relation: FactRequirementRelationType;
  documented_level: DocumentedEvidenceLevel;
  exact_cv_source_text: string;
};

export type EvidenceChainItem = {
  jd_requirement: string;
  cv_evidence: string | null;
  gap_identified: string;
  interview_implication: string;
  actionable_recommendation: string;
  canonical_jd_requirements?: CanonicalJDRequirement[];
  evidence_facts?: EvidenceChainFact[];
};

export type SessionRecord = {
  id: string;
  user_id: string;
  title: string;
  cv_text: string;
  job_description: string;
  job_description_url?: string | null;
  cv_analysis: CvAnalysis | null;
  interview_strategy: InterviewStrategy | null;
  preparation_language?: SessionLanguage | null;
  preparation_purpose?: "upcoming_interview" | "improve_skills" | string | null;
  interview_date?: string | null;
  coaching_focus?: string | null;
  status: "draft" | "analyzed" | "in_progress" | "completed" | string;
  created_at: string;
  updated_at: string;
};

export type InterviewStrategy = {
  candidatePositioning: string;
  strongestValueProposition: string;
  strengthsToLeverage: string[];
  gapsOrRisks: string[];
  gapDefenseStrategy: string[];
  interviewPriorities: string[];
  likelyDifficultQuestions: string[];
  storiesToPrepare: string[];
  communicationPriorities: string;
  interviewPlan: string;
  personalization: string;
  _strategy_engine_version?: string;
  _strategy_status?: "INSUFFICIENT_EVIDENCE" | "AUTHORITATIVE_PLAN_FALLBACK";
  retest_priorities?: Array<{
    question: string;
    score: number;
    missing: string;
    next: string;
  }>;
};

export type CvAnalysis = {
  matchScore: number;
  strengths: string[];
  gaps: string[];
  keywordAlignment: string[];
  summary: string;
  suggestedFocusAreas: string[];
  evidenceChain: EvidenceChainItem[];
  provenance?: AnalysisProvenance;
};

export type InterviewQuestion = {
  id: string;
  session_id: string;
  question: string;
  category: string;
  order_index: number;
};

export type InterviewAnswer = {
  id: string;
  question_id: string;
  session_id: string;
  answer_text: string;
  created_at: string;
};

export type FeedbackQuestion = {
  questionId: string;
  question: string;
  questionText: string;
  candidateAnswer: string;
  score: number;
  scoreDeductions?: string[];
  scoreJustification?: string;
  evidenceExtracted?: string[];
  evidenceStatus?: "cv_verified" | "candidate_claim" | "mixed" | "no_material_evidence";
  comment: string;
  keyStrength?: string;
  keyImprovement?: string;
  whatWorked?: string;
  whatWasMissing?: string;
  actionableImprovement?: string;
  suggestedRewrite?: string;
  evidenceGroundedBetterAnswer?: string;
};

export type FeedbackResult = {
  overallScore: number;
  strategyEngineVersion?: string;
  strategySnapshot?: {
    strongestValueProposition: string;
    interviewPriorities: string[];
    gapsOrRisks: string[];
  };
  communication: number;
  relevance: number;
  structure: number;
  confidence: number;
  strengths: string[];
  improvements: string[];
  sampleRewrite: string;
  questionFeedback: FeedbackQuestion[];
  summary: string;
  focusScore?: number;
  focusEvidence?: string;
  focusNextStep?: string;
};

export type InterviewFeedback = {
  id: string;
  session_id: string;
  feedback: FeedbackResult;
  created_at: string;
};
