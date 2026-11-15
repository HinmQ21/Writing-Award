import { describe, expect, it, vi } from 'vitest';
import career from '../../tests/fixtures/career-scoring.json';
import type { ScoringInput } from '../../src/scoring/types';
import { reviewPassages, reviewWriting, validateReview } from './corrections';
import { handleCorrections } from './corrections-http';
import { ProviderError } from './gemini';

const input = career as ScoringInput;
const sources = reviewPassages(input.essay);
const source = sources.find(item => item.text.includes('financial dependence'))!;
const item = { kind: 'error', criterion: 'lexical_resource', category: 'vocabulary', priority: 'high', confidence: 'high', title: 'Dependence reverses the intended meaning', explanation: 'This paragraph is about paying your own expenses, which suggests independence.', impact: 'The word choice makes the intended financial benefit less precise.', action: 'Use independence to express self-sufficiency.', suggestion: source.text.replace('financial dependence', 'financial independence'), evidence_ids: [source.id] };
const raw = (items: object[] = [item]) => ({ items, limitations: [] });
const audit = { decisions: [{ id: 'issue-1', verdict: 'confirm', title: item.title, explanation: item.explanation, impact: item.impact, action: item.action }] };
const generate = (...values: unknown[]) => vi.fn(async () => { const next = values.shift(); if (next instanceof Error) throw next; return next; });

describe('formative correction review', () => {
  it('anchors the original and preserves scores/input; does not generate numeric penalties', async () => {
    const original = JSON.stringify(input), provider = generate(raw(), audit);
    const review = await reviewWriting(input, { generate: provider, examinerModel: 'tutor' });
    expect(review.status).toBe('complete'); expect(review.items).toHaveLength(1);
    expect(review.items[0].passages[0]).toEqual(source);
    expect(review.items[0].suggestion).toContain('financial independence');
    expect(review.items[0].passages[0].text).toContain('financial dependence');
    expect(JSON.stringify(input)).toBe(original); expect(review).not.toHaveProperty('estimated_overall_band');
    expect(provider).toHaveBeenCalledTimes(2);
    const request = provider.mock.calls[0] as unknown as [{ system: string; data: object }];
    expect(request[0].system).toContain('never assigning, changing, deducting or predicting bands');
    expect(request[0].data).toHaveProperty('official_rubric');
  });
  it('locates repeated sentences at the correct occurrence with Unicode/whitespace intact', () => {
    const essay = 'Mỗi ngày 😀.\r\nA  repeated sentence.\n\nA  repeated sentence.';
    const passages = reviewPassages(essay);
    expect(passages.map(p => essay.slice(p.start, p.end))).toEqual(passages.map(p => p.text));
    expect(passages[2].start).toBe(essay.lastIndexOf('A  repeated sentence.'));
    expect(passages[2].start).toBeGreaterThan(passages[1].start);
  });
  it.each([
    { evidence_ids: ['unknown'] }, { confidence: 'medium' }, { criterion: 'task_response' },
    { evidence_ids: [] }, { suggestion: source.text }, { impact: 'This costs 0.5 band.' },
    { impact: 'This guarantees band 8.' }, { evidence_ids: [sources[0].id, source.id] },
  ])('omits invalid findings without discarding valid feedback: %j', invalid => {
    const result = validateReview(raw([{ ...item, ...invalid }, { ...item, title: 'Valid finding' }]), input);
    expect(result.status).toBe('partial'); expect(result.items).toHaveLength(1);
    expect(result.omitted_items).toBe(1); expect(result.limitations.join(' ')).toContain('omitted');
  });
  it('groups duplicates without pretending to count every occurrence', () => {
    const result = validateReview(raw([item, item]), input);
    expect(result.items).toHaveLength(1); expect(result.status).toBe('partial');
  });
  it('keeps internal source identifiers out of learner-facing explanations', () => {
    const result = validateReview(raw([{ ...item, explanation: `The phrase in ${source.id} reverses the meaning.` }]), input);
    expect(result.items[0].explanation).toBe('The phrase in the original passage reverses the meaning.');
    expect(result.items[0].passages[0].text).toBe(source.text);
  });
  it('supports whole-essay feedback without inventing an anchor or rewrite', () => {
    const global = { ...item, kind: 'improvement', criterion: 'task_response', category: 'development', title: 'Explain the causal link more clearly', suggestion: null, evidence_ids: [] };
    const result = validateReview(raw([global]), input);
    expect(result.items[0].passages).toEqual([]); expect(result.status).toBe('complete');
    expect(validateReview(raw([{ ...global, suggestion: 'Invented replacement essay.' }]), input).items).toHaveLength(0);
  });
  it('distinguishes an empty clean review from rejected findings and a malformed response', () => {
    expect(validateReview(raw([]), input)).toMatchObject({ status: 'complete', items: [], omitted_items: 0 });
    expect(validateReview(raw([{ ...item, evidence_ids: ['unknown'] }]), input)).toMatchObject({ status: 'partial', items: [] });
    expect(() => validateReview({ items: [{}], limitations: [] }, input)).toThrow('incomplete');
    expect(() => validateReview({ ...raw(), band: 8 }, input)).toThrow('incomplete');
  });
  it('limits missing-image feedback and uses Task Achievement for letters', () => {
    const task1 = { ...input, task_type: 'academic_task_1' as const };
    expect(validateReview(raw(), task1).limitations.join(' ')).toContain('Without the prompt image');
    const letter = { ...input, task_type: 'general_task_1' as const, question_category: null };
    const tone = { ...item, kind: 'improvement', category: 'task_fulfilment', criterion: 'task_achievement', suggestion: null };
    expect(validateReview(raw([tone]), letter).items[0].criterion).toBe('task_achievement');
  });
  it('reviews ambiguous feedback as an improvement, drops unsupported claims and fails closed on incomplete checks', async () => {
    const upgraded = { decisions: [{ ...audit.decisions[0], verdict: 'improvement', title: 'Clarify the intended meaning', explanation: 'There is more than one possible interpretation.', action: 'Clarify your intended reference.' }] };
    const result = await reviewWriting(input, { generate: generate(raw(), upgraded) });
    expect(result.items[0]).toMatchObject({ kind: 'improvement', confidence: 'medium', suggestion: null, title: 'Clarify the intended meaning' });
    const omitted = await reviewWriting(input, { generate: generate(raw(), { decisions: [{ ...audit.decisions[0], verdict: 'omit' }] }) });
    expect(omitted).toMatchObject({ status: 'partial', items: [], omitted_items: 1 });
    await expect(reviewWriting(input, { generate: generate(raw(), { decisions: [] }) })).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(reviewWriting(input, { generate: generate(raw(), new ProviderError('unavailable', 'Verifier unavailable', 503)) })).rejects.toThrow('Verifier unavailable');
  });
  it('labels development advice as improvement without mutating the proposed feedback', () => {
    const proposed = { ...item, category: 'development', criterion: 'task_response', suggestion: null };
    const before = structuredClone(proposed);
    expect(validateReview(raw([proposed]), input).items[0].kind).toBe('improvement');
    expect(proposed).toEqual(before);
  });
  it('retries overload once using the configured fallback and records the actual model', async () => {
    const provider = generate(new ProviderError('unavailable', 'Busy', 503), raw(), audit);
    const result = await reviewWriting(input, { generate: provider, examinerModel: 'primary', examinerFallbackModel: 'fallback' });
    expect(result.review_model).toBe('fallback'); expect(provider).toHaveBeenCalledTimes(3);
    const failing = generate(new ProviderError('unavailable', 'Busy', 503), new ProviderError('unavailable', 'Still busy', 503));
    await expect(reviewWriting(input, { generate: failing, examinerModel: 'primary', examinerFallbackModel: 'fallback' })).rejects.toThrow('Still busy');
    expect(failing).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid input before AI calls, retains origin/body protections and uses an optional review model', async () => {
    const provider = generate(raw(), audit);
    const request = (body: object, headers = {}) => new Request('https://app.test/api/corrections', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    expect((await handleCorrections(request({}), {}, provider)).status).toBe(400);
    expect((await handleCorrections(request(input, { origin: 'https://other.test' }), {}, provider)).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    const result = await handleCorrections(request(input), { GEMINI_FEEDBACK_MODEL: 'review-model' }, provider, () => {});
    expect(result.status).toBe(200); expect((await result.json()).review_model).toBe('review-model');
  });
});
