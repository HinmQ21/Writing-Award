export const TASK_TYPES = ['academic_task_1', 'general_task_1', 'academic_task_2', 'general_task_2'] as const;
export type TaskType = typeof TASK_TYPES[number];
export const CHART_CATEGORIES = ['bar_chart', 'pie_chart', 'process', 'map', 'line_graph', 'table', 'mixed_chart'] as const;
export const ESSAY_CATEGORIES = ['advantages_disadvantages', 'causes', 'effects_solutions', 'discussion', 'opinion', 'mixed', 'other'] as const;
export type QuestionCategory = typeof CHART_CATEGORIES[number] | typeof ESSAY_CATEGORIES[number];
export type Confidence = 'high' | 'medium' | 'low';
export type ScoringStatus = 'scored' | 'partial' | 'needs_input' | 'review_required';
export const COMMON_CRITERIA = ['coherence_cohesion', 'lexical_resource', 'grammatical_range_accuracy'] as const;
export type CriterionKey = 'task_achievement' | 'task_response' | typeof COMMON_CRITERIA[number];
export type TaskImage = { mime_type: 'image/png' | 'image/jpeg' | 'image/webp'; data: string };
export type ScoringInput = {
  task_type: TaskType; question_category: QuestionCategory | 'auto' | null;
  question: string; essay: string; task_image: TaskImage | null; rubric_version: 'ielts_official_v1';
};
export type TaskAnalysis = {
  question_category: QuestionCategory | null; classification_confidence: Confidence;
  classification_notes: string; task_requirements: string[]; potential_missing_context: string[];
};
export type Criterion = { band: number | null; reason: string; evidence_quotes: string[]; next_band_gap: string };
export type ExaminerOutput = { status: ScoringStatus; criteria: Partial<Record<CriterionKey, Criterion>>; quality_flags: string[] };
export type ScoringResult = TaskAnalysis & {
  status: ScoringStatus; task_type: TaskType; word_count: number; estimated_overall_band: number | null;
  criteria: Partial<Record<CriterionKey, Criterion>> | null; quality_flags: string[];
  rubric_version: 'ielts_official_v1'; prompt_version: string; examiner_model: string; analyzer_model: string;
  request_id: string; scored_at: string; rounding_rule: 'nearest_half_up';
  examiner_models_used?: string[];
};
export function criterionKeys(task: TaskType): CriterionKey[] {
  return [task.endsWith('_1') ? 'task_achievement' : 'task_response', ...COMMON_CRITERIA];
}
export function allowedCategories(task: TaskType): readonly QuestionCategory[] {
  return task === 'general_task_1' ? [] : task === 'academic_task_1' ? CHART_CATEGORIES : ESSAY_CATEGORIES;
}
export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length;
}
