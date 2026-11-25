import { useCallback, useEffect, useState } from 'react';
import { dayKey, TIMEZONE } from './model';
import type { Progress } from './model';

export const CAPY_MOODS = ['Calm', 'Focused', 'Happy', 'Celebrate', 'Proud', 'Sleepy', 'Worried', 'Chilly', 'Sad', 'Grumpy', 'Confused', 'Surprised'] as const;
export type CapyMood = typeof CAPY_MOODS[number];
/** A mood held for a fixed time before the next step, or the resting mood, takes over. */
export type CapyStep = { mood: CapyMood; ms: number };

/** Clip lengths in public/models/capy.glb. Every clip loops except Surprised, which plays once. */
export const CLIP_SECONDS: Record<CapyMood, number> = { Calm: 4, Focused: 4, Happy: 3, Celebrate: 2, Proud: 3, Sleepy: 4, Worried: 3, Chilly: 3, Sad: 4, Grumpy: 3, Confused: 3, Surprised: 35 / 24 };

function step(mood: CapyMood, loops = 1): CapyStep { return { mood, ms: Math.round(CLIP_SECONDS[mood] * loops * 1000) }; }

export function localHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

/** Resting mood from saved progress and the account's local time. It never blames: a reset streak is shown by the rain, not by a sad Capy. */
export function baseMood(progress: Progress, now = new Date()): CapyMood {
  if (progress.lastRewardDay === dayKey(now)) return 'Happy';
  const hour = localHour(now);
  if (hour >= 22 || hour < 6) return 'Sleepy';
  if (hour >= 18 && progress.streak > 0) return 'Worried';
  return 'Calm';
}

/** Reaction to what reconcileProgress did when the app opened: the streak reset, or a freeze covered the missed day. */
export function reconcileSteps(before: Progress, after: Progress): CapyStep[] {
  if (before.streak > 0 && after.streak === 0) return [step('Sad'), step('Grumpy')];
  if (after.freezes < before.freezes) return [step('Chilly')];
  return [];
}

/** Reaction to a saved entry. Only the first entry of a day moves the streak; every seventh day or a finished world adds pride. */
export function entrySteps(newDay: boolean, milestone: boolean, complete: boolean): CapyStep[] {
  if (!newDay) return [];
  return milestone || complete ? [step('Celebrate', 2), step('Proud', 2)] : [step('Celebrate', 2)];
}

export const REJECTED_STEPS: CapyStep[] = [step('Confused')];

/**
 * Plays queued reaction steps over a resting mood. Steps wait until the 3D Capy is on screen,
 * so a one-time reaction (a reset streak, a used freeze) is not spent while the model is still loading.
 */
export function useCapyMood(resting: CapyMood, initialSteps: CapyStep[] = []) {
  const [queue, setQueue] = useState(initialSteps);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !queue.length) return;
    const timer = setTimeout(() => setQueue(steps => steps.slice(1)), queue[0].ms);
    return () => clearTimeout(timer);
  }, [queue, ready]);
  const play = useCallback((steps: CapyStep[]) => { if (steps.length) setQueue(steps); }, []);
  const interrupt = useCallback(() => setQueue(steps => steps.length ? [] : steps), []);
  const markReady = useCallback(() => setReady(true), []);
  return { mood: queue[0]?.mood ?? resting, play, interrupt, markReady };
}
