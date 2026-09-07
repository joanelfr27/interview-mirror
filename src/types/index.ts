export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export type SessionLanguage = "en" | "fr";

export type SessionRecord = {
  id: string;
  user_id: string;
  title: string;
  cv_text: string;
  job_description: string;
  job_description_url?: string | null;
  cv_analysis: CvAnalysis | null;
  interview_strategy: InterviewStrategy | null;
  language?: SessionLanguage | null;
  interview_date?: string | null;
  coaching_focus?: string | null;
  status: "draft" | "analyzed" | "in_progress" | "completed";
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
};

export type CvAnalysis = {
  matchScore: number;
  strengths: string[];
  gaps: string[];
  keywordAlignment: string[];
  summary: string;
  suggestedFocusAreas: string[];
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
