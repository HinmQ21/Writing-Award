import { describe, expect, it } from 'vitest';
import { benchmarkScoring } from './benchmark-scoring.mjs';
const keys = ['task_response', 'coherence_cohesion', 'lexical_resource', 'grammatical_range_accuracy'];
const run = band => ({ task_type: 'academic_task_2', status: 'scored', criteria: Object.fromEntries(keys.map(key => [key, { band, evidence_quotes: ['practice'] }])) });
const item = () => ({ id: 'human-reference-1', task_type: 'academic_task_2', essay: 'Daily practice helps.', reference: Object.fromEntries(keys.map(key => [key, 6])), runs: [run(6), run(7)] });
describe('reference benchmark metrics', () => {
  it('computes per-criterion MAE, half-band agreement, repeat variation and quote mismatch', () => {
    const data = item(); data.runs[1].criteria.lexical_resource.evidence_quotes = ['invented'];
    const result = benchmarkScoring({ cases: [data] });
    expect(result.criteria.task_response).toEqual({ observations: 2, mae: 0.5, within_0_5_rate: 0.5 });
    expect(result.evidence.invalid_quote_rate).toBe(1 / 8); expect(result.stability.identical_criteria_rate).toBe(0);
    expect(result.stability.per_case[0].criterion_band_ranges.lexical_resource).toBe(1);
  });
  it('reports rejected runs and coverage rather than treating them as accurate zero scores', () => {
    const data = item(); data.runs.push({ ...run(6), status: 'review_required' });
    const result = benchmarkScoring({ cases: [data] }); expect(result.rejected_or_incomplete_runs).toBe(1); expect(result.scored_coverage).toBe(2 / 3);
  });
  it('requires actual reference data and never reports a benchmark from an empty dataset', () => {
    expect(() => benchmarkScoring({ cases: [] })).toThrow(); const data = item(); delete data.reference.task_response;
    expect(() => benchmarkScoring({ cases: [data] })).toThrow('human reference');
  });
});
