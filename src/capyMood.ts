import { useEffect, useState, useSyncExternalStore } from 'react';
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
 * The queue of reaction steps behind useCapyMood. Steps wait until the 3D Capy is on screen (markReady),
 * so a one-time reaction (a reset streak, a used freeze) is not spent while the model is still loading.
 */
export function createMoodQueue(initialSteps: CapyStep[] = []) {
  let steps = initialSteps, ready = false, active = true, timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  function arm() {
    clearTimeout(timer); timer = undefined;
    if (ready && active && steps.length) timer = setTimeout(() => { steps = steps.slice(1); arm(); listeners.forEach(listener => listener()); }, steps[0].ms);
  }
  function replace(next: CapyStep[]) { steps = next; arm(); listeners.forEach(listener => listener()); }
  return {
    steps: () => steps,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    play(next: CapyStep[]) { if (next.length) replace(next); },
    interrupt() { if (steps.length) replace([]); },
    markReady() { if (!ready) { ready = true; arm(); } },
    /** Stops the countdown while nothing shows the queue; resume restarts the current step. */
    pause() { active = false; arm(); },
    resume() { active = true; arm(); },
  };
}

/** Plays queued reaction steps over a resting mood (see createMoodQueue). */
export function useCapyMood(resting: CapyMood, initialSteps: CapyStep[] = []) {
  const [queue] = useState(() => createMoodQueue(initialSteps));
  const steps = useSyncExternalStore(queue.subscribe, queue.steps);
  useEffect(() => { queue.resume(); return queue.pause; }, [queue]);
  return { mood: steps[0]?.mood ?? resting, play: queue.play, interrupt: queue.interrupt, markReady: queue.markReady };
}

type Reaction = (mood: CapyMood) => void;
const reactions = new Set<Reaction>();
/**
 * Instant reactions (a poke) for whatever shows Capy's face, which is the logo. It never touches the mood queue:
 * a reaction plays over the current mood and returns to it.
 */
export const capyBus = {
  react: (mood: CapyMood) => { reactions.forEach(listener => listener(mood)); },
  listen: (listener: Reaction) => { reactions.add(listener); return () => { reactions.delete(listener); }; },
};

/** Counts pokes: Surprised, or Grumpy on the `grumpyAt`th poke within `windowMs`, after which the count starts over. */
export function pokeCounter(windowMs = 3000, grumpyAt = 4) {
  let pokes: number[] = [];
  return (now = performance.now()): CapyMood => {
    pokes = pokes.filter(time => now - time <= windowMs); pokes.push(now);
    if (pokes.length < grumpyAt) return 'Surprised';
    pokes = []; return 'Grumpy';
  };
}
/** The logo and the world Capy are two separate Capys: each counts its own pokes and only it reacts. */
export const nextLogoPoke = pokeCounter();
export const nextWorldPoke = pokeCounter();
