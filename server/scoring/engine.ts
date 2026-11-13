import { createHash, randomUUID } from 'node:crypto';
import rubric from '../rubrics/ielts-official-v1.json';
import { countWords, criterionKeys } from '../../src/scoring/types';
import type { CriterionKey, ExaminerOutput, ScoringInput, ScoringResult, TaskAnalysis } from '../../src/scoring/types';
import { analysisSchema, auditSchema, examinerSchema, parseInput, schemaErrors } from './schemas';
import { ANALYZER_PROMPT, AUDIT_PROMPT, CHECKLISTS, EXAMINER_PROMPT, PROMPT_VERSION } from './prompts';
import { ProviderError } from './gemini';
import type { Generate } from './gemini';

export type EngineOptions = { generate: Generate; analyzerModel?: string; examinerModel?: string; examinerFallbackModel?: string; signal?: AbortSignal; log?: (event: object) => void };
export function overallBand(bands: number[]): number {
  if (bands.length !== 4 || bands.some(b => !Number.isFinite(b) || b < 0 || b > 9 || b * 2 % 1 !== 0)) throw new Error('Exactly four valid bands required.');
  return Math.floor((bands.reduce((sum, b) => sum + b, 0) / 4) * 2 + 0.5) / 2;
}
type Issue = { criterion: CriterionKey; message: string; hard: boolean; diagnostics?: string[] };
export function validateAssessment(value: unknown, input: ScoringInput): Issue[] {
  const keys = criterionKeys(input.task_type);
  const shape = schemaErrors(examinerSchema(input.task_type), value);
  if (shape.length) return keys.map(criterion => ({ criterion, message: 'The scoring result is missing some criteria or contains invalid information. Please double-check the prompt and your original essay, then try scoring again.', hard: true, diagnostics: shape }));
  const result = value as ExaminerOutput;
  const issues: Issue[] = [];
  for (const criterion of keys) {
    const item = result.criteria[criterion]!;
    if (item.evidence_quotes.some(q => !q.trim() || !input.essay.includes(q))) issues.push({ criterion, message: 'The quote does not match the original text verbatim.', hard: true });
    if (item.band !== null && item.band > 0 && !item.evidence_quotes.length) issues.push({ criterion, message: 'Missing a quote as evidence for the band.', hard: true });
    if (item.band === null && result.status === 'scored') issues.push({ criterion, message: 'Some criteria in the scored result could not be evaluated.', hard: true });
    // A suspicion triggers an audit; it never changes a band automatically.
    if (item.band !== null && item.band >= 7 && /(?:does not|fails? to|missing|omits?|unaddressed|không|chưa|thiếu|bỏ sót).{0,65}(?:opinion|position|overview|required|quan điểm|lập trường|tổng quan|yêu cầu)/iu.test(item.reason)) {
      issues.push({ criterion, message: 'High band score, but the explanation seems to miss key requirements.', hard: false });
    }
  }
  if (result.status === 'review_required') issues.push({ criterion: keys[0], message: 'The Examiner requests a recheck of the result.', hard: false });
  if (result.quality_flags.some(flag => /contradict|inconsisten|mâu thuẫn|bất nhất/iu.test(flag))) issues.push({ criterion: keys[0], message: `The Examiner noted inconsistencies: ${result.quality_flags.join('; ')}`, hard: false });
  return issues;
}
export async function scoreWriting(raw: unknown, options: EngineOptions): Promise<ScoringResult> {
  const input = parseInput(raw);
  const requestId = randomUUID(), keys = criterionKeys(input.task_type);
  const analyzerModel = options.analyzerModel || 'gemini-3.5-flash-lite';
  let examinerModel = options.examinerModel || 'gemini-3.8-flash';
  let lastExaminerModel = examinerModel;
  const examinerModelsUsed = new Set<string>();
  let fallbackUsed = false;
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  let calls = 0;
  const call = async (stage: string, model: string, system: string, data: unknown, schema: object) => {
    calls++;
    options.log?.({ event: 'scoring_stage', request_id: requestId, stage, model, prompt_version: PROMPT_VERSION });
    try {
      const generated = await options.generate({ model, system, data, schema, image: input.task_image, signal: options.signal, maxOutputTokens: stage === 'analyze' || stage === 'audit' ? 2048 : 8192 });
      if (stage === 'examine' || stage === 'reassess') { lastExaminerModel = model; examinerModelsUsed.add(model); }
      return generated;
    } catch (error) {
      const fallback = options.examinerFallbackModel?.trim();
      if ((stage === 'examine' || stage === 'reassess') && !fallbackUsed && fallback && fallback !== model && error instanceof ProviderError && [429, 503].includes(error.httpStatus ?? 0) && !options.signal?.aborted) {
        fallbackUsed = true; examinerModel = fallback; calls++;
        options.log?.({ event: 'scoring_model_fallback', request_id: requestId, stage, from_model: model, to_model: fallback, http_status: error.httpStatus, prompt_version: PROMPT_VERSION });
        const generated = await options.generate({ model: fallback, system, data, schema, image: input.task_image, signal: options.signal, maxOutputTokens: 8192 });
        lastExaminerModel = fallback; examinerModelsUsed.add(fallback);
        return generated;
      }
      throw error;
    }
  };
  const candidate = { task_type: input.task_type, category_hint: input.question_category, question: input.question, original_essay: input.essay, word_count: countWords(input.essay), image_attached: !!input.task_image };
  const analysisRaw = await call('analyze', analyzerModel, ANALYZER_PROMPT, { task_type: input.task_type, category_hint: input.question_category, question: input.question, image_attached: !!input.task_image }, analysisSchema(input.task_type));
  if (schemaErrors(analysisSchema(input.task_type), analysisRaw).length) throw new ProviderError('invalid_response', 'The prompt analysis format is incorrect. Please try again.');
  const analysis = analysisRaw as TaskAnalysis;
  const pinnedRubric = input.task_type.endsWith('_1') ? rubric.tasks.task_1 : rubric.tasks.task_2;
  const examinerData = { ...candidate, analysis, official_rubric: pinnedRubric, rubric_version: rubric.version, rubric_source: rubric.source_url, checklist: CHECKLISTS[analysis.question_category ?? 'letter'] };
  let draft: unknown;
  try { draft = await call('examine', examinerModel, EXAMINER_PROMPT, examinerData, examinerSchema(input.task_type)); }
  catch (error) { if (!(error instanceof ProviderError) || error.code !== 'invalid_response') throw error; draft = null; }
  let issues = validateAssessment(draft, input), unresolved: string[] = [];
  options.log?.({ event: 'scoring_validation', request_id: requestId, stage: 'initial', assessment: draft, issues });
  let regraded = false;
  if (issues.length) {
    try {
      const auditRaw = await call('audit', analyzerModel, AUDIT_PROMPT, { ...examinerData, assessment: draft, validation_issues: issues }, auditSchema(input.task_type));
      if (schemaErrors(auditSchema(input.task_type), auditRaw).length) throw new Error('Invalid audit.');
      const audit = auditRaw as { affects_result: boolean; flagged_criteria: CriterionKey[]; issues: string[] };
      const affected = [...new Set([...issues.filter(i => i.hard).map(i => i.criterion), ...(audit.affects_result ? audit.flagged_criteria : [])])];
      if (audit.affects_result && !affected.length) affected.push(...keys);
      if (affected.length) {
        regraded = true;
        const focusedSchema = examinerSchema(input.task_type);
        focusedSchema.properties.criteria = { type: 'object', properties: Object.fromEntries(Object.entries(focusedSchema.properties.criteria.properties).filter(([key]) => affected.includes(key as CriterionKey))), required: affected, additionalProperties: false };
        const reassessment = await call('reassess', examinerModel, EXAMINER_PROMPT, { ...examinerData, previous_assessment: draft, requested_criteria: affected, issues: [...issues.map(i => i.message), ...audit.issues] }, focusedSchema);
        const focusErrors = schemaErrors(focusedSchema, reassessment);
        if (focusErrors.length) throw new Error('Invalid reassessment.');
        const focus = reassessment as ExaminerOutput;
        if (!schemaErrors(examinerSchema(input.task_type), draft).length) {
          const previous = draft as ExaminerOutput;
          draft = { ...focus, criteria: { ...previous.criteria, ...focus.criteria } };
        } else draft = focus;
        issues = validateAssessment(draft, input);
        options.log?.({ event: 'scoring_validation', request_id: requestId, stage: 'final', assessment: draft, issues });
        unresolved = issues.map(i => i.message);
      }
    } catch (error) {
      if (options.signal?.aborted) throw error;
      options.log?.({ event: 'scoring_review_failed', request_id: requestId, code: error instanceof ProviderError ? error.code : 'invalid_review', prompt_version: PROMPT_VERSION });
      unresolved = ['Unable to verify the inconsistencies in the scoring result.', ...issues.map(i => i.message)];
    }
  }
  const validShape = !schemaErrors(examinerSchema(input.task_type), draft).length;
  const assessment = validShape ? structuredClone(draft as ExaminerOutput) : null;
  if (issues.some(i => i.hard) && !unresolved.length) unresolved = issues.filter(i => i.hard).map(i => i.message);
  const flags = [...(assessment?.quality_flags ?? []), ...unresolved];
  let status = assessment?.status ?? 'review_required';
  let criteria = assessment?.criteria ?? null;
  if (!validShape || issues.some(i => i.hard)) criteria = null;
  if (unresolved.length || !criteria) status = 'review_required';
  if (analysis.classification_confidence === 'low') flags.push('Task type could not be definitively determined; please cross-check with the original prompt requirements.');
  if (input.task_type === 'academic_task_1' && !input.task_image) {
    const message = 'Missing Academic Task 1 prompt image: unable to verify data, features, and Task Achievement.';
    flags.push(message);
    if (criteria?.task_achievement) criteria.task_achievement = { band: null, reason: message, evidence_quotes: [], next_band_gap: 'Please add the chart, table, map, or process image for a full evaluation.' };
    if (status === 'scored') status = 'partial';
    if (!analysis.potential_missing_context.includes(message)) analysis.potential_missing_context.push(message);
  }
  const bands = keys.map(key => criteria?.[key]?.band ?? null);
  if (bands.some(b => b === null) && status === 'scored') status = 'partial';
  const result: ScoringResult = {
    ...analysis, status, task_type: input.task_type, word_count: countWords(input.essay),
    estimated_overall_band: status === 'scored' && bands.every((b): b is number => b !== null) ? overallBand(bands) : null,
    criteria, quality_flags: [...new Set(flags)], rubric_version: input.rubric_version, prompt_version: PROMPT_VERSION,
    examiner_model: lastExaminerModel, examiner_models_used: [...examinerModelsUsed], analyzer_model: analyzerModel, request_id: requestId, scored_at: new Date().toISOString(), rounding_rule: 'nearest_half_up',
  };
  options.log?.({ event: 'scoring_complete', request_id: requestId, question_sha256: hash(input.question), essay_sha256: hash(input.essay), rubric_sha256: rubric.source_sha256, calls, regraded, result });
  return result;
}
