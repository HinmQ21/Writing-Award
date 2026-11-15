import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachPrompt, createProgress, DRAFT_KEY, essaySource, nextVersion, parseProgress, PROMPT_DRAFTS_KEY, submitEssay } from './model';
import { blankPractice, clearPracticeDrafts, finishPracticeDraft, practiceDraftEpoch, readPracticeDraft, readScopedDraft, savePracticeDraft } from './practiceDrafts';
import type { PromptSelection } from './model';

const text = 'word '.repeat(260), now = new Date('2026-11-15T09:00:00Z');
const selection: PromptSelection = { promptId: null, question: 'Discuss the value of daily habits.\nGive your opinion.' };
const save = (progress = createProgress(false), chosen = selection, date = now) => submitEssay(progress, text, 2, date, chosen);
describe('prompts and immutable writing versions', () => {
  it('requires a prompt and appends versions without changing the previous essay or daily reward', () => {
    const original = createProgress(false), snapshot = structuredClone(original);
    expect(() => submitEssay(original, text, 2, now)).toThrow('prompt');
    const first = save(original), before = structuredClone(first.progress.essays[0]);
    const prompt = first.progress.prompts[0];
    const second = save(first.progress, { promptId: prompt.id, question: '' });
    expect(second.progress.prompts).toHaveLength(1);
    expect(second.progress.essays.map(essay => essay.versionNumber)).toEqual([2, 1]);
    expect(second.progress.essays[1]).toEqual(before); expect(original).toEqual(snapshot);
    expect(second.progress.pieces).toBe(1); expect(second.progress.streak).toBe(1); expect(second.rewarded).toBe(false);
    const third = save(second.progress, { promptId: prompt.id, question: '' }, new Date('2026-11-16T09:00:00Z'));
    expect(third.progress.essays[0].versionNumber).toBe(3); expect(third.progress.pieces).toBe(2);
    expect(essaySource(third.progress.essays[0], third.progress).question).toBe(prompt.question);
  });
  it('reuses explicit saved IDs and keeps new prompts separate even when their captions match', () => {
    const first = save();
    const second = save(first.progress, { promptId: first.progress.prompts[0].id, question: '' });
    expect(second.progress.prompts).toEqual(first.progress.prompts);
    expect(second.progress.essays[0].versionNumber).toBe(2);
    const separate = save(second.progress);
    expect(separate.progress.prompts).toHaveLength(2); expect(separate.progress.essays[0].versionNumber).toBe(1);
    const third = submitEssay(second.progress, text, 1, now, selection);
    expect(third.progress.prompts).toHaveLength(2); expect(third.progress.essays[0].versionNumber).toBe(1);
    expect(() => submitEssay(first.progress, text, 1, now, { promptId: first.progress.prompts[0].id, question: '' })).toThrow('selected task');
    expect(() => save(first.progress, { promptId: 'missing', question: '' })).toThrow('saved prompt');
  });
  it('migrates v1 without guessing prompts or altering original writing, dates and rewards', () => {
    const demo = createProgress(true), { prompts: _prompts, ...old } = demo;
    const legacy = { ...old, version: 1, essays: demo.essays.map(({ promptId: _id, versionNumber: _version, ...essay }) => essay) };
    const source = JSON.stringify(legacy), migrated = parseProgress(source);
    expect(migrated).toEqual({ ...legacy, version: 2, prompts: [] });
    expect(JSON.stringify(legacy)).toBe(source); expect(migrated.essays[0].text).toBe(demo.essays[0].text);
    const linked = attachPrompt(migrated, migrated.essays[0].id, selection, now);
    expect(linked.essays[0]).toMatchObject({ ...migrated.essays[0], versionNumber: 1 });
    expect(linked.essays[0].promptId).toBe(linked.prompts[0].id);
    expect(linked.pieces).toBe(migrated.pieces); expect(linked.lastRewardDay).toBe(migrated.lastRewardDay);
    const linkedAgain = attachPrompt(linked, migrated.essays[1].id, { promptId: linked.prompts[0].id, question: '' }, now);
    expect(linkedAgain.essays[1].versionNumber).toBe(2);
    expect(() => attachPrompt(linkedAgain, migrated.essays[0].id, selection)).toThrow('no longer');
  });
  it('rejects broken references and duplicate version numbers instead of discarding stored data', () => {
    const progress = save().progress, original = JSON.stringify(progress);
    expect(parseProgress(original)).toEqual(progress); expect(nextVersion(progress, progress.prompts[0].id)).toBe(2);
    expect(() => parseProgress(JSON.stringify({ ...progress, prompts: [] }))).toThrow('version');
    expect(() => parseProgress(JSON.stringify({ ...progress, prompts: [progress.prompts[0], progress.prompts[0]] }))).toThrow('prompt');
    expect(() => parseProgress(JSON.stringify({ ...progress, essays: [...progress.essays, { ...progress.essays[0], id: 'second' }] }))).toThrow('version');
    expect(() => parseProgress(JSON.stringify({ ...progress, essays: [{ ...progress.essays[0], task: 1 }] }))).toThrow('version');
    expect(JSON.stringify(progress)).toBe(original);
  });
});

describe('prompt-specific practice drafts', () => {
  beforeEach(() => { const store = new Map<string, string>(); vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) }); });
  afterEach(() => vi.unstubAllGlobals());
  it('retains legacy drafts and restores independent drafts for each prompt', () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: 'Bài viết cũ 😀', task: 2 }));
    expect(readPracticeDraft()).toMatchObject({ text: 'Bài viết cũ 😀', question: '', promptId: null });
    const first = { ...blankPractice(2, 'one', 'Question one.'), text: 'First version in progress.' };
    const second = { ...blankPractice(1, 'two', 'Question two.'), text: 'Second version in progress.' };
    savePracticeDraft(first); savePracticeDraft(second);
    expect(readScopedDraft(blankPractice(2, 'one', 'Question one.'))).toEqual(first);
    expect(readPracticeDraft()).toEqual(second);
    const clean = { ...first, text: '' }; finishPracticeDraft(first, clean);
    expect(readScopedDraft(blankPractice(1, 'two', 'Question two.'))).toEqual(second);
    expect(readPracticeDraft().text).toBe('');
  });
  it('does not overwrite an unreadable draft bank and honours an explicit reset', () => {
    localStorage.setItem(PROMPT_DRAFTS_KEY, '{broken');
    expect(() => savePracticeDraft({ ...blankPractice(), text: 'Keep me.' })).toThrow();
    expect(localStorage.getItem(PROMPT_DRAFTS_KEY)).toBe('{broken');
    const epoch = practiceDraftEpoch(); clearPracticeDrafts();
    expect(practiceDraftEpoch()).toBeGreaterThan(epoch); expect(localStorage.getItem(PROMPT_DRAFTS_KEY)).toBeNull();
  });
});
