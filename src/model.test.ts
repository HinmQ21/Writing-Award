import { describe, expect, it } from 'vitest';
import { activeWorld, addDays, createProgress, dayKey, parseProgress, reconcileProgress, submitEssay, wordCount, worldPieces } from './model';

const essay = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ');
const now = new Date('2026-11-09T04:00:00Z');
describe('daily IELTS writing progression', () => {
  it('uses account midnight rather than UTC midnight', () => {
    expect(dayKey(new Date('2026-11-08T17:00:00Z'))).toBe('2026-11-09');
    expect(dayKey(new Date('2026-11-08T16:59:59Z'))).toBe('2026-11-08');
  });
  it('counts real words including apostrophes and ignores punctuation', () => {
    expect(wordCount("  It's a well-written essay.\nViết nhé! 123 ... 😀 ")).toBe(7);
    expect(wordCount('... 😀 —')).toBe(0);
  });
  it('enforces the correct threshold for each task and keeps the original progress', () => {
    const p = createProgress(false, dayKey(now));
    expect(() => submitEssay(p, essay(149), 1, now)).toThrow('150');
    expect(() => submitEssay(p, essay(249), 2, now)).toThrow('250');
    expect(submitEssay(p, essay(150), 1, now).progress.pieces).toBe(1);
    expect(p.essays).toHaveLength(0);
  });
  it('saves multiple essays while rewarding only one per calendar day', () => {
    const first = submitEssay(createProgress(false, dayKey(now)), essay(250), 2, now);
    const second = submitEssay(first.progress, essay(150), 1, now);
    expect(first.rewarded).toBe(true); expect(second.rewarded).toBe(false);
    expect(second.progress.pieces).toBe(1); expect(second.progress.streak).toBe(1);
    expect(second.progress.essays).toHaveLength(2);
  });
  it('rewards streak freezes every seven days and caps them at two', () => {
    const p = { ...createProgress(false, dayKey(now)), streak: 6, freezes: 1, lastRewardDay: '2026-11-08' };
    expect(submitEssay(p, essay(150), 1, now).progress.freezes).toBe(2);
    expect(submitEssay({ ...p, freezes: 2 }, essay(150), 1, now).progress.freezes).toBe(2);
  });
  it('consumes exactly one freeze for a single missed day without awarding a piece', () => {
    const p = { ...createProgress(false, '2026-11-07'), streak: 12, freezes: 2, pieces: 12, lastRewardDay: '2026-11-07' };
    const reconciled = reconcileProgress(p, '2026-11-09');
    expect(reconciled.freezes).toBe(1); expect(reconciled.streak).toBe(12); expect(reconciled.pieces).toBe(12);
    expect(reconcileProgress(reconciled, '2026-11-09').freezes).toBe(1);
    expect(submitEssay(reconciled, essay(150), 1, now).progress.streak).toBe(13);
  });
  it('resets streak after a larger gap while preserving essays and buildings', () => {
    const p = { ...createProgress(true, '2026-11-07'), lastRewardDay: '2026-11-06', evaluatedDay: '2026-11-07' };
    const next = reconcileProgress(p, '2026-11-09');
    expect(next.streak).toBe(0); expect(next.stars).toBe(2);
    expect(next.pieces).toBe(p.pieces); expect(next.essays).toEqual(p.essays);
    expect(reconcileProgress(next, '2026-11-10').stars).toBe(2);
    expect(reconcileProgress(next, '2026-11-12').rainyUntil).toBe('2026-11-10');
  });
  it('resets without a freeze even for one missed day', () => {
    const p = { ...createProgress(false, '2026-11-07'), streak: 3, lastRewardDay: '2026-11-07' };
    expect(reconcileProgress(p, '2026-11-09').streak).toBe(0);
  });
  it('completes exactly 21 pieces before starting the next world', () => {
    const p = { ...createProgress(true, dayKey(now)), pieces: 20 };
    const completed = submitEssay(p, essay(250), 2, now);
    expect(completed.complete).toBe(true); expect(completed.world).toBe(0);
    expect(activeWorld(completed.progress.pieces)).toBe(1);
    expect(worldPieces(completed.progress.pieces, 0)).toBe(21);
    expect(worldPieces(completed.progress.pieces, 1)).toBe(0);
    const next = submitEssay(completed.progress, essay(250), 2, new Date('2026-11-10T04:00:00Z'));
    expect(next.world).toBe(1); expect(next.piece).toBe(1);
  });
  it('rejects invalid stored state instead of silently overwriting it', () => {
    expect(() => parseProgress('{bad')).toThrow();
    expect(() => parseProgress(JSON.stringify({ ...createProgress(), freezes: -1 }))).toThrow();
    expect(() => parseProgress(JSON.stringify({ ...createProgress(), pieces: 90 }))).toThrow();
    expect(parseProgress(JSON.stringify(createProgress()))).toEqual(createProgress());
  });
  it('handles month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('keeps writing and streaks after all worlds without inventing more pieces', () => {
    const p = { ...createProgress(true, dayKey(now)), pieces: 63 };
    const next = submitEssay(p, essay(250), 2, now);
    expect(next.rewarded).toBe(false); expect(next.progress.pieces).toBe(63);
    expect(next.progress.streak).toBe(13); expect(next.progress.essays).toHaveLength(13);
  });
});
