export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export type SessionRecord = {
  id: string;
  user_id: string;
  title: string;
  cv_text: string;
  job_description: string;
  cv_analysis: CvAnalysis | null;
  status: "draft" | "analyzed" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
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

export type FeedbackResult = {
  overallScore: number;
  communication: number;
  relevance: number;
  structure: number;
  confidence: number;
  strengths: string[];
  improvements: string[];
  sampleRewrite: string;
  questionFeedback: {
    question: string;
    score: number;
    comment: string;
    keyStrength?: string;
    keyImprovement?: string;
    suggestedRewrite?: string;
  }[];
  summary: string;
};

export type InterviewFeedback = {
  id: string;
  session_id: string;
  feedback: FeedbackResult;
  created_at: string;
};
