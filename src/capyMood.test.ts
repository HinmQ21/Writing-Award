import { describe, expect, it } from 'vitest';
import { baseMood, CAPY_MOODS, CLIP_SECONDS, entrySteps, localHour, reconcileSteps, REJECTED_STEPS } from './capyMood';
import { createProgress, reconcileProgress } from './model';

// 2026-11-09 in Asia/Ho_Chi_Minh (UTC+7).
const at = (utc: string) => new Date(`2026-11-09T${utc}:00Z`);
const fresh = (overrides = {}) => ({ ...createProgress(false, '2026-11-09'), streak: 4, lastRewardDay: '2026-11-08', ...overrides });

describe('Capy resting mood', () => {
  it('reads the hour in the account timezone', () => {
    expect(localHour(at('03:00'))).toBe(10);
    expect(localHour(at('17:00'))).toBe(0);
  });
  it('is happy all day once today\'s entry is in', () => {
    for (const time of ['03:00', '12:00', '16:30']) expect(baseMood(fresh({ lastRewardDay: '2026-11-09' }), at(time))).toBe('Happy');
  });
  it('is calm before 18:00, worried in the evening only while a streak is at stake, sleepy at night', () => {
    expect(baseMood(fresh(), at('03:00'))).toBe('Calm');
    expect(baseMood(fresh(), at('12:00'))).toBe('Worried');
    expect(baseMood(fresh({ streak: 0 }), at('12:00'))).toBe('Calm');
    expect(baseMood(fresh(), at('15:00'))).toBe('Sleepy');
    expect(baseMood(fresh(), new Date('2026-11-09T20:00:00Z'))).toBe('Sleepy'); // 03:00 the next morning
  });
  it('never rests on a negative mood, even while it rains after a reset', () => {
    const rainy = fresh({ streak: 0, stars: 2, rainyUntil: '2026-11-10', lastRewardDay: '2026-11-05' });
    for (let hour = 0; hour < 24; hour++) expect(['Calm', 'Sleepy']).toContain(baseMood(rainy, new Date(Date.UTC(2026, 10, 9, hour))));
  });
});

describe('Capy reactions', () => {
  it('shivers once when a freeze covered the missed day', () => {
    const saved = fresh({ streak: 9, freezes: 1, lastRewardDay: '2026-11-07', evaluatedDay: '2026-11-08' });
    expect(reconcileSteps(saved, reconcileProgress(saved, '2026-11-09'))).toEqual([{ mood: 'Chilly', ms: 3000 }]);
  });
  it('is sad, then huffs at the rain, when the streak resets', () => {
    const saved = fresh({ streak: 9, freezes: 0, lastRewardDay: '2026-11-07', evaluatedDay: '2026-11-08' });
    expect(reconcileSteps(saved, reconcileProgress(saved, '2026-11-09')).map(step => step.mood)).toEqual(['Sad', 'Grumpy']);
  });
  it('stays quiet when nothing changed or there was no streak to lose', () => {
    const yesterday = fresh({ evaluatedDay: '2026-11-08' });
    expect(reconcileSteps(yesterday, reconcileProgress(yesterday, '2026-11-09'))).toEqual([]);
    const idle = fresh({ streak: 0, lastRewardDay: '2026-11-01', evaluatedDay: '2026-11-02' });
    expect(reconcileSteps(idle, reconcileProgress(idle, '2026-11-09'))).toEqual([]);
  });
  it('celebrates the first entry of a day, adds pride on every seventh day or a finished world', () => {
    expect(entrySteps(true, false, false)).toEqual([{ mood: 'Celebrate', ms: 4000 }]);
    expect(entrySteps(true, true, false)).toEqual([{ mood: 'Celebrate', ms: 4000 }, { mood: 'Proud', ms: 6000 }]);
    expect(entrySteps(true, false, true).map(step => step.mood)).toEqual(['Celebrate', 'Proud']);
    expect(entrySteps(false, false, false)).toEqual([]);
  });
  it('is confused for one loop when an entry is turned away', () => {
    expect(REJECTED_STEPS).toEqual([{ mood: 'Confused', ms: 3000 }]);
  });
  it('knows a clip length for every mood in the model', () => {
    expect(Object.keys(CLIP_SECONDS).sort()).toEqual([...CAPY_MOODS].sort());
  });
});
