export type QuestionType = "single" | "multi";

export type Question = {
  id: string;
  text: string;
  options: string[];
  correctIndices: number[];
  type: QuestionType;
  explanation: string;
  subject: string;
};

export type Bookmark = {
  id: string;
  text: string;
  subject: string;
  savedAt?: Date | null;
};

export type SubjectStat = {
  subject: string;
  correct: number;
  total: number;
  wrong?: number;
  marks?: number;
};
