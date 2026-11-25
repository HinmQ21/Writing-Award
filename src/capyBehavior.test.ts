import { describe, expect, it } from 'vitest';
import { createBrain, HERO, HOLD_CAN_PHASE, PASSING_TIMES, PHASE_PER_UNIT, PICKUP_GRAB, signaturePose, TURN_PHASE_SIGN } from './capyBehavior';
import type { Brain, BrainOptions } from './capyBehavior';
import { clearance, inDoorLane, inInterior, isReachable, navFor, shelterSpot, wrapAngle } from './capyNav';
import { CAMERA_YAW, GRAB, offsetFrom } from './capyNavData';
import { TURN, WALK, WORLD_CLIP_SECONDS } from './capyWorldTypes';
import type { NavMap, Point, Pose, Sense, WorldIndex } from './capyWorldTypes';

function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const DT = 1 / 30;
const DAY: Sense = { cameraYaw: CAMERA_YAW, rainy: false, hour: 12 };
type Frame = Pose & { t: number };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const mod = (a: number, m: number) => ((a % m) + m) % m;
const walking = (p: Pose) => p.clip === 'Walk' || p.clip === 'WalkCan';

function brainFor(world: WorldIndex, pieces: number, seed: number, o: Partial<BrainOptions> = {}) {
  return createBrain({ world, pieces, rng: seeded(seed), ...o });
}
/** Ticks `seconds` at 30 fps; `each` may poke the brain (tap, knock) before a tick and stop early by returning true. */
function run(b: Brain, seconds: number, sense: Partial<Sense> = {}, each?: (t: number, last: Frame | undefined) => boolean | void, from = 0): Frame[] {
  const out: Frame[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = from + i * DT;
    if (each?.(t, out[out.length - 1])) break;
    out.push({ ...b.tick(DT, { ...DAY, ...sense }), t });
  }
  return out;
}
/** Activity runs: [id, start, end]. */
function spans(frames: Frame[]) {
  const s: { id: string; t0: number; t1: number }[] = [];
  for (const f of frames) {
    const last = s[s.length - 1];
    if (last && last.id === f.activity) last.t1 = f.t; else s.push({ id: f.activity, t0: f.t, t1: f.t });
  }
  return s;
}

/** Every locomotion rule, frame by frame. Returns the first few violations. */
function locomotionErrors(nav: NavMap, frames: Frame[]): string[] {
  const errs: string[] = [];
  const err = (f: Frame, m: string) => { if (errs.length < 8) errs.push(`${f.t.toFixed(2)} ${f.activity} ${f.clip}: ${m}`); };
  let still = 0;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], p = { x: f.x, z: f.z }, prev = frames[i - 1];
    const lane = inDoorLane(nav, p), room = inInterior(nav, p);
    // stays on the map, the door lane or the cottage floor (1 cm of grazing allowed where a gentle bend is walked through)
    if (!nav.walkable(p) && !lane && !room && clearance(nav, p) < -.01) err(f, `off the map at (${f.x.toFixed(3)}, ${f.z.toFixed(3)})`);
    if (Math.abs(f.y - nav.ground(p)) > .1) err(f, `y ${f.y.toFixed(3)} vs ground ${nav.ground(p)}`);
    if (!prev) continue;
    const same = f.clip === prev.clip && f.cue === prev.cue, moved = dist(f, prev);
    if (walking(f) && same) {
      // feet stay planted: clip time advances by exactly the distance walked
      const dPhase = mod(f.phase! - prev.phase!, WORLD_CLIP_SECONDS.Walk);
      if (Math.abs(dPhase - moved * PHASE_PER_UNIT) > 1e-6) err(f, `walk phase +${dPhase.toFixed(5)} for ${moved.toFixed(5)} walked`);
      if (Math.abs(wrapAngle(f.heading - prev.heading)) > WALK.maxTurnWhileWalking * DT + 1e-9) err(f, `turned ${(wrapAngle(f.heading - prev.heading) / DT * 180 / Math.PI).toFixed(1)}°/s while walking`);
    }
    if (walking(f) && !same) {
      // a walk starts at a passing frame
      const d = Math.min(...PASSING_TIMES.map(q => Math.abs(mod(f.phase! - q + .75, 1.5) - .75))) * WALK.fps;
      if (d > .3) err(f, `walk started ${d.toFixed(2)} frames off a passing frame`);
    }
    if (walking(prev) && !(walking(f) && same)) {
      // and stops on one
      const d = Math.min(...PASSING_TIMES.map(q => Math.abs(mod(prev.phase! - q + .75, 1.5) - .75))) * WALK.fps;
      if (d > .3) err(f, `walk stopped ${d.toFixed(2)} frames off a passing frame`);
    }
    if (f.clip === 'TurnStep' && prev.clip === 'TurnStep') {
      // turning in place: the stance foot counter-rotates at the root's yaw
      if (moved > 1e-9) err(f, `moved ${moved} during TurnStep`);
      const want = mod(TURN_PHASE_SIGN * wrapAngle(f.heading - prev.heading) / TURN.radiansPerSecond, WORLD_CLIP_SECONDS.TurnStep);
      const got = mod(f.phase! - prev.phase!, WORLD_CLIP_SECONDS.TurnStep);
      if (Math.abs(mod(got - want + .75, 1.5) - .75) > 1e-6) err(f, `TurnStep phase +${got.toFixed(4)} for ${wrapAngle(f.heading - prev.heading).toFixed(4)} rad`);
    }
    // (hidden inside the cottage Capy may be lined up with the door unseen)
    if (!walking(f) && f.clip !== 'TurnStep' && moved > 1e-9 && f.visible) err(f, `slid ${moved.toFixed(6)} without walking`);
    // never frozen for more than 8 s, unless resting (sheltering, inside)
    const changed = moved > 1e-9 || Math.abs(f.heading - prev.heading) > 1e-9 || f.cue !== prev.cue || f.phase !== prev.phase && f.clip !== 'Calm';
    const resting = f.activity === 'shelter' || !f.visible || room || (lane && f.z < 1.46);
    still = changed || resting ? 0 : still + DT;
    if (still > 8) { err(f, 'still for over 8 s'); still = 0; }
  }
  return errs;
}

describe('Capy brain locomotion', { timeout: 60_000 }, () => { // whole-map and 10-minute checks: allow a busy machine
  const cases: [WorldIndex, number, number, Partial<Sense>?][] = [
    [0, 0, 1], [0, 7, 2], [0, 9, 3], [0, 13, 4], [0, 17, 5], [0, 21, 6],
    [1, 1, 7], [1, 6, 8], [1, 14, 9], [1, 21, 10],
    [0, 12, 11, { rainy: true }], [0, 5, 12, { rainy: true }], [1, 14, 13, { rainy: true }], [0, 15, 14, { hour: 23 }],
  ];
  for (const [w, k, seed, sense] of cases) {
    it(`keeps every foot planted for 10 minutes: world ${w + 1}, ${k} pieces, seed ${seed}${sense ? ' ' + JSON.stringify(sense) : ''}`, () => {
      const frames = run(brainFor(w, k, seed), 600, sense);
      expect(locomotionErrors(navFor(w, k), frames)).toEqual([]);
      expect(frames.filter(walking).length * DT, 'walks some of the time').toBeGreaterThan(30);
    });
  }

  it('idles 2–6 s between activities and never repeats one straight away', () => {
    for (const [w, k, seed] of [[0, 3, 21], [0, 19, 22], [1, 18, 23]] as [WorldIndex, number, number][]) {
      const s = spans(run(brainFor(w, k, seed), 400)).filter(x => x.id !== 'goodMorning');
      const acts = s.filter(x => x.id !== 'idle');
      for (let i = 1; i < acts.length; i++) expect(acts[i].id, `w${w} k${k} at ${acts[i].t0.toFixed(1)}`).not.toBe(acts[i - 1].id);
      for (const x of s.slice(0, -1)) if (x.id === 'idle') expect(x.t1 - x.t0).toBeLessThanOrEqual(6 + 2 * DT);
      expect(new Set(acts.map(x => x.id)).size).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('Capy brain activities', { timeout: 60_000 }, () => { // whole-map and 10-minute checks: allow a busy machine
  it('does nothing before it is unlocked', () => {
    const banned: [WorldIndex, number, string[]][] = [
      [0, 6, ['home', 'water', 'mailbox', 'sign']], [0, 16, ['water', 'mailbox', 'sign']], [0, 18, ['sign']],
      [1, 0, ['water', 'admire', 'books', 'table', 'bigFlower']], [1, 14, ['books', 'table', 'bigFlower']],
    ];
    for (const [w, k, ids] of banned) {
      const frames = run(brainFor(w, k, 30 + k), 300);
      const seen = new Set(frames.map(f => f.activity));
      for (const id of ids) expect(seen.has(id), `w${w} k${k} ${id}`).toBe(false);
      if (w === 0 && k < 7) expect(frames.every(f => f.visible && f.door === 0)).toBe(true);
      if ((w === 0 && k < 17) || (w === 1 && k < 1)) expect(frames.some(f => f.holding || f.watering)).toBe(false);
    }
  });

  it('greets a tap, facing the camera, then resumes what it was doing', () => {
    const b = brainFor(0, 0, 3);
    let before = run(b, 120, {}, (_t, f) => !!f && walking(f) && f.activity !== 'idle' && f.t > 5);
    const doing = before[before.length - 1].activity;
    b.tap();
    const after = run(b, 30, {}, undefined, 120);
    const wave = after.findIndex(f => f.clip === 'Wave');
    expect(wave).toBeGreaterThan(-1);
    expect(after[wave].t - after[0].t).toBeLessThan(4);
    expect(after[wave].activity).toBe('greet');
    expect(Math.abs(wrapAngle(after[wave].heading - CAMERA_YAW))).toBeLessThan(.02);
    const resumed = after.slice(wave).find(f => f.activity !== 'greet')!;
    expect(resumed.activity).toBe(doing);
    expect(locomotionErrors(navFor(0, 0), [...before, ...after])).toEqual([]);
    before = [];
  });

  it('waves with the can when tapped while carrying it, keeps it, and goes on watering', () => {
    const nav = navFor(1, 1), b = brainFor(1, 1, 5);
    const a = run(b, 120, {}, (_t, f) => !!f && f.clip === 'WalkCan');
    expect(a[a.length - 1].holding).toBe(true);
    b.tap();
    const c = run(b, 60, {}, undefined, a[a.length - 1].t + DT);
    const wave = c.find(f => f.clip === 'WaveCan' || f.clip === 'Wave')!;
    expect(wave.clip).toBe('WaveCan');
    const done = c.findIndex(f => f.activity === 'water' && f.clip === 'PutDown');
    expect(done).toBeGreaterThan(-1);
    expect(c.slice(0, done).every(f => f.holding && f.canAt === null)).toBe(true);
    expect(c.some(f => f.clip === 'Water' && f.watering)).toBe(true);
    const after = c.slice(done).find(f => !f.holding)!;
    expect(after.canAt).toEqual(nav.can!.at);
    expect(locomotionErrors(nav, [...a, ...c])).toEqual([]);
  });

  it('picks up the can on its grab frame, from the right spot, and pours onto the tree', () => {
    const nav = navFor(1, 1), can = nav.can!;
    const grabErr: number[] = [];
    for (const seed of [41, 42, 43]) {
      const frames = run(brainFor(1, 1, seed), 240);
      for (let i = 1; i < frames.length; i++) {
        const f = frames[i], prev = frames[i - 1];
        if (f.clip === 'PickUp' && f.phase === undefined && (prev.clip !== 'PickUp' || prev.cue !== f.cue)) {
          grabErr.push(dist(offsetFrom(f, f.heading, GRAB.forward, GRAB.right), can.at));
          expect(Math.abs(wrapAngle(f.heading - can.heading))).toBeLessThan(.03);
          // the static can disappears exactly when the hand closes on it (frame 10)
          const grab = frames.slice(i).find(g => g.holding)!;
          expect(grab.t - f.t).toBeGreaterThanOrEqual(PICKUP_GRAB - DT);
          expect(grab.t - f.t).toBeLessThanOrEqual(PICKUP_GRAB + DT);
          expect(grab.canAt).toBeNull();
        }
        if (f.watering) {
          expect(f.clip).toBe('Water');
          if (f.activity === 'water' && Math.hypot(f.x, f.z) < 1.2) expect(Math.abs(Math.hypot(f.watering.x, f.watering.z) - .36)).toBeLessThan(.1);
        }
        if (f.clip === 'PickUp' && f.phase !== undefined && f.holding && f.phase !== HOLD_CAN_PHASE) expect(f.phase).toBeGreaterThan(PICKUP_GRAB); // the dip
        expect(f.canAt === null).toBe(f.holding);
      }
    }
    expect(grabErr.length).toBeGreaterThanOrEqual(3);
    grabErr.sort((x, y) => x - y);
    expect(grabErr[Math.floor(grabErr.length / 2)], 'median grab error').toBeLessThan(.01);
    expect(grabErr[grabErr.length - 1], 'worst grab error (quarter stride)').toBeLessThan(.09);
  });

  it('fetches the can from the cottage to water the bush in World 1', () => {
    const frames = run(brainFor(0, 17, 5), 600);
    const water = frames.filter(f => f.watering);
    expect(water.length).toBeGreaterThan(0);
    for (const f of water) { expect(Math.abs(f.watering!.x + .845)).toBeLessThan(.3); expect(Math.abs(f.watering!.z - 1.73)).toBeLessThan(.2); }
    const first = frames.findIndex(f => f.holding);
    expect(frames[first].visible && !inInterior(navFor(0, 17), frames[first])).toBe(false); // picked up out of sight
    expect(frames.every(f => f.canAt === null)).toBe(true);
  });

  it('never waters in the rain', () => {
    for (const [w, k, seed] of [[1, 21, 51], [1, 1, 52], [0, 21, 53]] as [WorldIndex, number, number][]) {
      const frames = run(brainFor(w, k, seed), 600, { rainy: true });
      expect(frames.some(f => f.watering || f.holding || f.clip === 'Water' || f.clip === 'PickUp'), `w${w} k${k}`).toBe(false);
    }
  });

  it('shelters from the rain: inside under a roof, under a tree without one, under the canopy in World 2', () => {
    const inside = run(brainFor(0, 12, 61), 600, { rainy: true });
    expect(inside.filter(f => !f.visible).length / inside.length).toBeGreaterThan(.5);
    for (const [w, k, seed] of [[0, 5, 62], [1, 14, 63]] as [WorldIndex, number, number][]) {
      const nav = navFor(w, k), s = shelterSpot(nav)!, frames = run(brainFor(w, k, seed), 600, { rainy: true });
      const near = frames.filter(f => dist(f, s.at) < .12).length / frames.length;
      expect(near, `w${w} k${k}`).toBeGreaterThan(.5);
    }
  });

  it('stays in more at night', () => {
    const lit = (hour: number) => run(brainFor(0, 15, 71), 600, { hour }).filter(f => !f.visible || f.windowsLit).length;
    expect(lit(23)).toBeGreaterThan(lit(12) * 1.5);
  });

  it('always comes out of the cottage, and writes inside where it can be seen (pieces 7–9)', () => {
    for (const seed of [81, 82, 83]) {
      const frames = run(brainFor(0, 12, seed), 600, seed === 83 ? { rainy: true } : {});
      let hiddenSince = -1;
      for (const f of frames) {
        if (!f.visible) { if (hiddenSince < 0) hiddenSince = f.t; expect(f.t - hiddenSince, `seed ${seed}`).toBeLessThan(60); }
        else hiddenSince = -1;
      }
      expect(frames.some(f => !f.visible)).toBe(true);
    }
    const nav = navFor(0, 8), open = run(brainFor(0, 8, 84), 600);
    const inRoom = open.filter(f => inInterior(nav, f));
    expect(inRoom.length).toBeGreaterThan(0);
    expect(inRoom.every(f => f.visible)).toBe(true);
    expect(inRoom.some(f => f.clip === 'Write')).toBe(true);
    expect(open.some(f => f.windowsLit === true || f.door > .9)).toBe(true);
  });

  it('comes out and waves when the house is knocked on', () => {
    const b = brainFor(0, 12, 91, { memory: { world: 0, x: 0, z: 1, heading: 0, holding: false, inside: true } });
    const a = run(b, .5);
    expect(a.every(f => !f.visible)).toBe(true);
    b.knock();
    const c = run(b, 15, {}, undefined, .5);
    const out = c.find(f => f.visible)!;
    expect(out.t).toBeLessThan(6);
    expect(c.some(f => f.door > .9)).toBe(true);
    const wave = c.find(f => f.clip === 'Wave')!;
    expect(wave.t).toBeLessThan(12);
    expect(c[c.length - 1].door).toBe(0);
  });

  it('opens the day with a good-morning walk out of the cottage', () => {
    const frames = run(brainFor(0, 14, 92), 12);
    expect(frames[0].activity).toBe('goodMorning');
    expect(frames[0].visible).toBe(false);
    expect(frames.some(f => f.clip === 'Wave' && f.visible)).toBe(true);
  });

  it('restores memory, moving off a blocked spot to the nearest free one', () => {
    const nav = navFor(1, 21);
    const restored = brainFor(1, 21, 1, { memory: { world: 1, x: 0, z: 0, heading: 1, holding: false, inside: false } });
    expect(restored.memory().heading).toBe(1);
    const first = run(restored, DT)[0];
    const near = nav.nearestWalkable({ x: 0, z: 0 })!;
    expect(dist(first, near)).toBeLessThan(1e-6);
    expect(nav.walkable(first)).toBe(true);
    const kept = run(brainFor(1, 21, 1, { memory: { world: 1, x: 1, z: 1.9, heading: 2, holding: false, inside: false } }), DT)[0];
    expect(isReachable(nav, { x: 1, z: 1.9 }) ? dist(kept, { x: 1, z: 1.9 }) : 0).toBeLessThan(1e-6);
    // another world's memory is ignored
    const other = run(brainFor(1, 21, 1, { memory: { world: 0, x: 0, z: 0, heading: 0, holding: true, inside: true } }), DT)[0];
    expect(dist(other, nav.spawn)).toBeLessThan(1e-6);
    expect(other.holding).toBe(false);
  });

  it('puts the can back after a rebuild that caught it carrying', () => {
    const nav = navFor(1, 9), b = brainFor(1, 9, 2, { memory: { world: 1, x: -1, z: 1.5, heading: 0, holding: true, inside: false } });
    const frames = run(b, 90, {}, (_t, f) => !!f && !f.holding);
    expect(frames[0].activity).toBe('returnCan');
    expect(frames[0].holding).toBe(true);
    const last = run(b, 1)[0];
    expect(last.holding).toBe(false);
    expect(last.canAt).toEqual(nav.can!.at);
    expect(b.memory()).toMatchObject({ world: 1, holding: false, inside: false });
  });

  it('waits for the crown at its spot, then bounces when it lands', () => {
    const nav = navFor(0, 20), b = brainFor(0, 20, 3, { crownDrop: true });
    const wait = run(b, 10);
    for (const f of wait) {
      expect(dist(f, nav.crownSpot)).toBeLessThan(1e-9);
      expect(f.heading).toBeCloseTo(CAMERA_YAW);
      expect(f.clip).toBe('Calm');
    }
    b.pieceLanded();
    const c = run(b, 1, {}, undefined, 10);
    expect(c.find(f => f.clip === 'Bounce')!.t).toBeLessThan(10.2);
  });

  it('cheers a landed piece, then goes to admire it', () => {
    const nav = navFor(0, 5), b = brainFor(0, 5, 4, { freshPiece: true });
    run(b, 8);
    b.pieceLanded();
    const c = run(b, 40, {}, undefined, 8);
    const cheer = c.findIndex(f => f.clip === 'Cheer');
    expect(cheer).toBeGreaterThan(-1);
    expect(c[cheer].t - 8).toBeLessThan(6);
    const spot = nav.pois.find(p => p.id === 'piece5')!;
    const bounce = c.slice(cheer).find(f => f.clip === 'Bounce' && f.activity === 'cheer')!;
    expect(dist(bounce, spot.at)).toBeLessThan(.09);
  });
});

describe('Capy still poses', () => {
  it('gives each world its signature pose', () => {
    const w1 = signaturePose(0, 21);
    expect(w1).toMatchObject({ x: 0, z: 2.15, clip: 'Calm', phase: HERO.Calm, holding: false, visible: true, door: 0, watering: null });
    expect(w1.heading).toBeCloseTo(CAMERA_YAW);
    expect(w1.y).toBeCloseTo(.18);
    expect(signaturePose(0, 0)).toMatchObject({ x: -1.85, z: 1.55, clip: 'Calm' });
    const tree = navFor(1, 21).pois.find(p => p.id === 'tree')!;
    const w2 = signaturePose(1, 21);
    expect(w2).toMatchObject({ x: tree.water!.at.x, z: tree.water!.at.z, heading: tree.water!.face, clip: 'Water', phase: HERO.Water, holding: true, canAt: null });
    expect(signaturePose(1, 0)).toMatchObject({ clip: 'Calm', holding: false, canAt: navFor(1, 0).can!.at });
  });

  it('holds the signature pose under reduced motion, waving for 1.5 s on a tap', () => {
    const b = brainFor(1, 21, 1, { reducedMotion: true }), sig = signaturePose(1, 21);
    const a = run(b, 5);
    expect(a.every(f => f.x === sig.x && f.z === sig.z && f.clip === 'Water' && f.phase === HERO.Water)).toBe(true);
    b.tap();
    const c = run(b, 2.5, {}, undefined, 5);
    const waving = c.filter(f => f.clip === 'WaveCan');
    expect(waving.length * DT).toBeCloseTo(1.5, 1);
    expect(waving.every(f => f.phase === HERO.WaveCan && f.x === sig.x)).toBe(true);
    expect(c[c.length - 1].clip).toBe('Water');
  });
});
