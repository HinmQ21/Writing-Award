import type { CriterionKey } from './types';

export const REVIEW_CATEGORIES = ['grammar', 'vocabulary', 'spelling', 'punctuation', 'organisation', 'development', 'task_fulfilment'] as const;
export type ReviewCategory = typeof REVIEW_CATEGORIES[number];
export type ReviewPassage = { id: string; text: string; start: number; end: number };
export type ReviewItem = {
  id: string; kind: 'error' | 'improvement'; criterion: CriterionKey; category: ReviewCategory;
  priority: 'high' | 'medium' | 'low'; confidence: 'high' | 'medium'; title: string;
  explanation: string; impact: string; action: string; suggestion: string | null;
  passages: ReviewPassage[];
};
export type CorrectionsResult = {
  status: 'complete' | 'partial'; items: ReviewItem[]; limitations: string[]; omitted_items: number;
  request_id: string; review_model: string; review_version: string; essay_sha256: string; reviewed_at: string;
};
