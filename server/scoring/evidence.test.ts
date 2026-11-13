import { describe, expect, it, vi } from 'vitest';
import career from '../../tests/fixtures/career-scoring.json';
import type { ScoringInput } from '../../src/scoring/types';
import { TASK_TYPES, criterionKeys } from '../../src/scoring/types';
import { prepareEvidence, sourceEvidence } from './evidence';
import { scoreWriting } from './engine';
import { createGemini } from './gemini';
import { auditSchema, criterionSchema, examinerSchema } from './schemas';

const input = career as ScoringInput;
const analysis = { question_category: 'discussion', classification_confidence: 'high', classification_notes: 'Both views and a personal opinion are requested.', task_requirements: ['Discuss higher education.', 'Discuss getting a job.', 'Give an opinion.'], potential_missing_context: [] };
const response = (value: unknown) => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });

describe('original source evidence', () => {
  it('preserves mistakes, casing, punctuation and internal whitespace from the career essay', () => {
    const sources = sourceEvidence(input.essay);
    expect(sources.some(source => source.text.includes('people believed'))).toBe(true);
    expect(sources.some(source => source.text.includes('early financial dependence'))).toBe(true);
    expect(sources.some(source => source.text.startsWith('Secondly, the earlier youngsters'))).toBe(true);
    expect(sources.every(source => input.essay.includes(source.text))).toBe(true);
    const unicode = 'First line.\r\n\r\nA  little\tpractice — mỗi ngày 😀.';
    expect(sourceEvidence(unicode).map(source => source.text)).toEqual(['First line.', 'A  little\tpractice — mỗi ngày 😀.']);
  });

  it('keeps long source excerpts within the quote limit without cutting surrogate pairs', () => {
    const essay = 'word 😀 '.repeat(2000);
    const sources = sourceEvidence(essay);
    expect(sources.length).toBeGreaterThan(1);
    expect(sources.every(source => source.text.length <= 2000 && essay.includes(source.text))).toBe(true);
    expect(sources.every(source => !/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(source.text))).toBe(true);
  });

  it('scores the reported case using source IDs and returns only exact original quotations', async () => {
    const sources = sourceEvidence(input.essay);
    const source = (text: string) => sources.find(item => item.text.includes(text))!.id;
    const criterion = (id: string) => ({ band: 7, reason: 'The argument is supported but could be more precise.', evidence_ids: [id], next_band_gap: 'Develop the supporting points more precisely.' });
    const fetcher = vi.fn().mockResolvedValueOnce(response(analysis)).mockResolvedValueOnce(response({
      status: 'scored', quality_flags: [], criteria: {
        task_response: criterion(source('people believed')),
        coherence_cohesion: criterion(source('Secondly, the earlier')),
        lexical_resource: criterion(source('early financial dependence')),
        grammatical_range_accuracy: criterion(source('which plays an important role')),
      },
    }));
    const result = await scoreWriting(input, { generate: createGemini('test-key', fetcher) });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('scored');
    expect(result.estimated_overall_band).toBe(7);
    expect(Object.values(result.criteria!).every(item => item.evidence_quotes.every(quote => input.essay.includes(quote)))).toBe(true);
    expect(result.criteria?.task_response?.evidence_quotes[0]).toContain('people believed');
    expect(result.criteria?.coherence_cohesion?.evidence_quotes[0]).toContain('Secondly, the earlier');
    expect(JSON.stringify(result)).not.toContain('evidence_ids');

    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    const data = JSON.parse(body.contents[0].parts[0].text).untrusted_candidate_data;
    expect(data.original_essay).toBe(input.essay);
    expect(data.original_evidence).toEqual(sources);
    const property = body.generationConfig.responseJsonSchema.properties.criteria.properties.task_response;
    expect(property.properties.evidence_ids.items.enum).toEqual(sources.map(item => item.id));
    expect(property.properties.evidence_quotes).toBeUndefined();
    expect(examinerSchema(input.task_type).properties.criteria.properties.task_response.properties).toHaveProperty('evidence_quotes');
  });

  it.each([
    { evidence_ids: ['invented-id'] },
    { evidence_ids: ['On the one hand...'] },
    { evidence_ids: [1] },
    { evidence_quotes: ['While a number of people believe'] },
    { evidence_ids: ['s1'], evidence_quotes: ['corrected text'] },
  ])('rejects invented references and free-form corrections: %j', async invalid => {
    const fetcher = vi.fn().mockResolvedValue(response({ status: 'scored', quality_flags: [], criteria: { task_response: { band: 7, reason: 'Reason.', next_band_gap: 'Gap.', ...invalid } } }));
    await expect(createGemini('test-key', fetcher)({ model: 'test', system: 'Test.', data: { original_essay: input.essay }, schema: examinerSchema(input.task_type) })).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('uses the same source evidence for focused reassessment and leaves audit responses unchanged', () => {
    const schema = examinerSchema(input.task_type);
    schema.properties.criteria = { type: 'object', properties: { lexical_resource: criterionSchema }, required: ['lexical_resource'], additionalProperties: false };
    const transport = prepareEvidence(schema, { original_essay: input.essay })!;
    const original = { band: 6, reason: 'Reason.', next_band_gap: 'Gap.', evidence_ids: ['s1'] };
    expect(transport.resolve({ status: 'scored', quality_flags: [], criteria: { lexical_resource: original } })).toEqual({
      status: 'scored', quality_flags: [], criteria: { lexical_resource: { band: 6, reason: 'Reason.', next_band_gap: 'Gap.', evidence_quotes: [sourceEvidence(input.essay)[0].text] } },
    });
    expect(prepareEvidence(auditSchema(input.task_type), { original_essay: input.essay })).toBeNull();
  });

  it.each(TASK_TYPES)('preserves task-specific criteria and null bands for %s', task => {
    const transport = prepareEvidence(examinerSchema(task), { original_essay: input.essay })!;
    const criteria = Object.fromEntries(criterionKeys(task).map(key => [key, { band: null, reason: 'Needs context.', next_band_gap: 'Add context.', evidence_ids: [] }]));
    const resolved = transport.resolve({ status: 'partial', criteria, quality_flags: [] });
    expect(resolved).toEqual({ status: 'partial', criteria: Object.fromEntries(criterionKeys(task).map(key => [key, { band: null, reason: 'Needs context.', next_band_gap: 'Add context.', evidence_quotes: [] }])), quality_flags: [] });
  });
});
