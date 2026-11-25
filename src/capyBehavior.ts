/**
 * The world Capy's brain: an activity scheduler, a step executor with interrupts, and a locomotion controller that
 * keeps planted feet locked to the ground. Pure TypeScript, no three.js: it turns time and a few senses into a Pose
 * every frame, which capyWorld.ts copies onto the model. Design: docs/capy/logo-and-world-behavior.md §5–6.
 *
 * Locomotion rules (doc §5.6):
 * - Walk/WalkCan clip time advances by distance walked (PHASE_PER_UNIT), never by wall time, so feet cannot slide.
 * - A walk starts from Calm at a passing frame, ramping speed up over WALK.startRamp, and stops exactly on a passing
 *   frame: the walked distance is a whole number of half strides, and the WALK.stopRamp deceleration is planned to end there.
 * - While walking the heading turns at most WALK.maxTurnWhileWalking per second. Sharper corners, and turning to face
 *   something, stop and play TurnStep in place, its clip time advanced by the angle turned.
 */
import { LOOPING_CLIPS, TURN, WALK, WORLD_CLIP_SECONDS, WORLD_SCALE } from './capyWorldTypes';
import type { CapyMemory, NavMap, Point, Poi, Pose, Sense, WorldClip, WorldIndex } from './capyWorldTypes';
import { facing, findPath, inDoorLane, inInterior, isReachable, navFor, segmentClear, shelterSpot, wrapAngle } from './capyNav';
import { CAMERA_YAW, CHIMNEY_PIECE, CROWN_PIECE, MAILBOX_PIECE, PIECE_CENTRES, POUR, ROOF_PIECE, offsetFrom } from './capyNavData';

// ================================================================================================ constants
const DEG = Math.PI / 180;
/** Clip seconds of Walk/WalkCan per world unit walked: one 18-frame cycle per stride of 0.40 model units at WORLD_SCALE. */
export const PHASE_PER_UNIT = (WALK.cycleFrames / WALK.fps) / (WALK.stride * WORLD_SCALE);
/** Walking distance between two passing frames (half a stride). Every walk covers a whole number of these. */
export const HALF_STRIDE = WALK.stride * WORLD_SCALE / 2;
/** The passing frames of the 36-frame Walk/WalkCan clips, in clip seconds. */
export const PASSING_TIMES: readonly number[] = [0, WALK.cycleFrames].flatMap(o => WALK.passing.map(f => (f + o) / WALK.fps));
/**
 * TurnStep direction: +1 plays the clip forward for a left turn (heading increasing). Measured in the GLB: with the
 * phase moving forward the root's rotation.y must increase at 80°/s for the stance foot to stay put (the wrong way
 * slips it 35 mm a frame). One constant, so it can be flipped in one place.
 */
export const TURN_PHASE_SIGN = 1;
/** TurnStep starts at its double-support frame (both feet planted, frame 0.72 of 18). */
export const TURN_START_PHASE = .72 / WALK.fps;
/**
 * PickUp: the hand closes on the can at frame 10 (the GLB's hand-can scale goes 0 → 1 there, so the static can hides
 * from this clip time on) and is in the carrying pose by frame 22. PutDown is PickUp reversed, so it lets go at
 * PickUp time 10/24, i.e. PutDown time PUTDOWN_RELEASE.
 */
export const PICKUP_GRAB = 10 / 24;
export const PUTDOWN_RELEASE = WORLD_CLIP_SECONDS.PutDown - PICKUP_GRAB;
const PICKUP_CARRY = 22 / 24;
/** Standing still with the can: PickUp held at its last frame (the carrying pose, feet together, 2.3 cm from WalkCan f0). */
export const HOLD_CAN_PHASE = WORLD_CLIP_SECONDS.PickUp;
/** Lowest point of the dip at the pond: a frame after the grab, so the hand-can's scale key never reads as not yet grabbed. */
const DIP_BOTTOM = 11 / 24;
/** Hero frames for still poses (measured in the GLB: Water f14, Wave f22 of 43, Sniff f40, TurnStep f5). */
export const HERO = { Calm: 10 / 24, Water: 14 / 24, Wave: 22 / 24, WaveCan: 22 / 24, Sniff: 40 / 24, TurnStep: 5 / 24 } as const;

const WALK_LEN = WORLD_CLIP_SECONDS.Walk;
const TURN_LEN = WORLD_CLIP_SECONDS.TurnStep;
/** Corners up to this are walked through, turning at ≤ 15°/s; sharper ones stop and TurnStep. */
const SMALL_CORNER = 10 * DEG;
/** Before a walk, a heading error up to this is corrected while walking instead of turning in place. */
const TURN_SKIP = 6 * DEG;
/** Smaller turns just snap (sub-pixel). */
const MIN_TURN = 2.5 * DEG;
const LOOKAHEAD = .3;
const TURN_FADE = .15, CLIP_FADE = .25, STAND_FADE = .3;
/** Standing in Calm never lasts longer than this outside rests (the scheduler shortens idles). */
const STILL_LIMIT = 7.5;
/** Inside the house Capy is hidden behind the door's dark gap once its centre is past this z (enclosed house). */
const HIDE_Z = 1.05;
/** Just inside the door, in both the interior box and the door lane: walks between the door and the room pass here. */
const INNER: Point = { x: 0, z: .82 };

const mod = (a: number, m: number) => ((a % m) + m) % m;
/** The passing time nearest to clip time t (cyclically). */
function snapPassing(t: number) {
  let best = PASSING_TIMES[0], bd = Infinity;
  for (const p of PASSING_TIMES) { const d = Math.abs(mod(t - p + WALK_LEN / 2, WALK_LEN) - WALK_LEN / 2); if (d < bd) { bd = d; best = p; } }
  return best;
}
function circles(p0: Point, r0: number, p1: Point, r1: number): Point[] {
  const d = dist(p0, p1);
  if (d < 1e-9 || d > r0 + r1 || d < Math.abs(r0 - r1)) return [];
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r0 * r0 - a * a));
  const ux = (p1.x - p0.x) / d, uz = (p1.z - p0.z) / d, mx = p0.x + ux * a, mz = p0.z + uz * a;
  return [{ x: mx - uz * h, z: mz + ux * h }, { x: mx + uz * h, z: mz - ux * h }];
}
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ================================================================================================ public types
export type BrainOptions = {
  world: WorldIndex;
  pieces: number;
  /** Default navFor(world, pieces). */
  nav?: NavMap;
  /** Restore after a scene rebuild; null/undefined = first visit this session. */
  memory?: CapyMemory | null;
  /** Injected for deterministic tests (default Math.random). */
  rng?: () => number;
  /** Static signature pose; a tap shows a wave pose for 1.5 s. */
  reducedMotion?: boolean;
  /** The newest piece was built today: "admire the newest piece" weighs 4 instead of 1. */
  freshPiece?: boolean;
  /** Piece 20 is dropping now: start at nav.crownSpot facing the camera, hold Calm until pieceLanded(), then Bounce. */
  crownDrop?: boolean;
};
export type Brain = {
  tick(dt: number, sense: Sense): Pose;
  /** A tap on Capy (ignored while hidden inside). */
  tap(): void;
  /** A tap on the house while Capy is inside: the door opens, Capy peeks out and waves. */
  knock(): void;
  /** The new piece finished dropping: face it, Cheer, then go admire it. */
  pieceLanded(): void;
  memory(): CapyMemory;
};

// ================================================================================================ locomotion
type Region = 'nav' | 'lane' | 'interior';
type HeadingFn = () => number;
type Move = { kind: 'turn'; to: HeadingFn; beforeRun?: boolean } | { kind: 'run'; pts: Point[]; region: Region };
type Run = {
  pts: Point[]; cum: number[]; region: Region; dStop: number; s: number; v: number; phase0: number;
  dec: { s0: number; v0: number; a: number; T: number; tau: number } | null;
  /** Reached its stop this frame: the pose still shows the walk, on its passing frame; the next move starts next frame. */
  finished?: boolean;
};

function pointAt(pts: Point[], cum: number[], s: number): Point {
  const n = pts.length;
  if (s <= 0) return pts[0];
  for (let i = 1; i < n; i++) {
    if (s <= cum[i]) { const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]); return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t }; }
  }
  // past the end: keep going along the last leg
  const a = pts[n - 2], b = pts[n - 1], L = Math.max(1e-9, cum[n - 1] - cum[n - 2]), over = s - cum[n - 1];
  return { x: b.x + (b.x - a.x) / L * over, z: b.z + (b.z - a.z) / L * over };
}

/** Capy's body: position, heading, height, and the clip shown, driven by walk/turn moves. */
class Body {
  x: number; z: number; heading: number; y: number;
  private yTarget: number; private bobT = 9; private bobA = 0;
  mode: 'stand' | 'turn' | 'walk' = 'stand';
  holding = false;
  /** What Capy shows while standing, and the clip time to hold it at (undefined: let it play). */
  standClip: WorldClip = 'Calm'; standPhase?: number;
  walkPhase = PASSING_TIMES[0];
  turnPhase = TURN_START_PHASE;
  clip: WorldClip = 'Calm'; fade = STAND_FADE; cue = 0;
  private queue: Move[] = [];
  private run: Run | null = null;
  private turnTo: HeadingFn | null = null; private turnT = 0;
  private target: Point | null = null; private finalFace?: HeadingFn; private region: Region = 'nav'; private exact = false;
  /** Anti-stuck: walking time and position at the last progress check. */
  private stuckT = 0; private stuckAt: Point = { x: 0, z: 0 }; private replans = 0;
  failed = false;

  constructor(private nav: NavMap, p: Point, heading: number) {
    this.x = p.x; this.z = p.z; this.heading = heading;
    this.y = this.yTarget = nav.ground(p);
  }
  get pos(): Point { return { x: this.x, z: this.z }; }
  idle() { return this.mode === 'stand' && !this.queue.length; }

  place(p: Point, heading?: number) {
    this.x = p.x; this.z = p.z; if (heading !== undefined) this.heading = heading;
    this.y = this.yTarget = this.nav.ground(p);
  }

  /** Show `clip` while standing. `restart` restarts it (new cue) even if it is already showing. */
  stand(clip: WorldClip, opts: { phase?: number; restart?: boolean; fade?: number } = {}) {
    const changed = clip !== this.standClip || opts.restart;
    this.standClip = clip; this.standPhase = opts.phase;
    if (this.mode === 'stand') this.show(clip, changed ? (opts.fade ?? CLIP_FADE) : undefined, !!opts.restart);
  }
  /** The default standing pose: Calm, or the can-carrying pose while holding. */
  standDefault(fade = STAND_FADE) { this.stand('Calm', { fade }); }

  private show(clip: WorldClip, fade?: number, restart = false) {
    if (clip !== this.clip || restart) { this.clip = clip; this.cue++; if (fade !== undefined) this.fade = fade; }
  }

  /**
   * Walk through `points` (A* waypoints after the current position), then optionally turn to `face`. `exact` moves the
   * last corner so both final runs are whole numbers of half strides and Capy stops exactly on the target (the can, a
   * water stand); otherwise the stop is the passing frame nearest the target, at most a quarter stride off.
   */
  walk(points: Point[], region: Region, face: HeadingFn | undefined, target: Point, exact = false) {
    this.target = target; this.finalFace = face; this.region = region; this.failed = false; this.replans = 0; this.exact = exact;
    this.plan(points);
  }
  turn(to: HeadingFn) { this.queue = [{ kind: 'turn', to }]; this.target = null; if (this.mode === 'stand') this.next(); }

  private plan(points: Point[]) {
    this.queue = [];
    const runs: Point[][] = [];
    let cur: Point[] = [], prev = this.pos, prevDir: number | null = null;
    for (const p of points) {
      if (dist(prev, p) < 1e-4) continue;
      const d = facing(prev, p);
      if (prevDir !== null && Math.abs(wrapAngle(d - prevDir)) > SMALL_CORNER && cur.length) { runs.push(cur); cur = []; }
      cur.push(p); prevDir = d; prev = p;
    }
    if (cur.length) runs.push(cur);
    for (const r of runs) {
      this.queue.push({ kind: 'turn', to: () => this.runHeading(r), beforeRun: true });
      this.queue.push({ kind: 'run', pts: r, region: this.region });
    }
    if (this.finalFace) this.queue.push({ kind: 'turn', to: this.finalFace });
    if (this.mode === 'stand') this.next();
  }
  private runHeading(r: Point[]) {
    const pts = [this.pos, ...r], cum = cumulative(pts);
    return facing(this.pos, pointAt(pts, cum, Math.min(cum[cum.length - 1], LOOKAHEAD)));
  }

  /** Stop as soon as the feet allow: at the next reachable passing frame, or now if turning or standing. */
  stop() {
    this.queue = [];
    if (this.mode === 'turn') { this.mode = 'stand'; this.turnTo = null; this.show(this.standClipNow(), STAND_FADE); }
    else if (this.mode === 'walk' && this.run && !this.run.dec) {
      const r = this.run, aN = this.speed() / WALK.stopRamp, dMin = r.s + r.v * r.v / (2 * aN) + 1e-6;
      const d = Math.ceil(dMin / HALF_STRIDE - 1e-9) * HALF_STRIDE;
      if (d < r.dStop) r.dStop = d;
    }
  }

  private speed() { return this.holding ? WALK.carrySpeed : WALK.speed; }
  private standClipNow(): WorldClip { return this.standClip === 'Calm' && this.holding ? 'PickUp' : this.standClip; }

  private next() {
    for (;;) {
      const m = this.queue.shift();
      if (!m) { this.mode = 'stand'; this.run = null; this.turnTo = null; this.show(this.standClipNow(), WALK.stopFade); return; }
      if (m.kind === 'turn') {
        const r = m.beforeRun ? this.queue[0] : undefined;
        // a run too short for a single half stride is dropped with its turn (no turning round for a 3 cm shuffle)
        if (r?.kind === 'run' && cumulative([this.pos, ...r.pts]).pop()! < HALF_STRIDE / 2) { this.queue.shift(); continue; }
        if (m.beforeRun && this.exact) this.align();
        const d = wrapAngle(m.to() - this.heading);
        if (Math.abs(d) <= (m.beforeRun ? TURN_SKIP : MIN_TURN)) { if (!m.beforeRun) this.heading = m.to(); continue; }
        if (this.clip !== 'TurnStep') this.turnPhase = TURN_START_PHASE;
        this.mode = 'turn'; this.turnTo = m.to; this.turnT = 0; this.run = null;
        this.show('TurnStep', TURN_FADE);
        return;
      }
      if (this.startRun(m)) return;
    }
  }

  /**
   * Before the second-to-last run of an exact walk: move its end corner to where two circles meet, so this run and the
   * last one (straight to the target) are both whole numbers of half strides.
   */
  private align() {
    const runs = this.queue.filter((q): q is Extract<Move, { kind: 'run' }> => q.kind === 'run');
    if (runs.length !== 2 || runs[1].pts.length !== 1) return;
    const m1 = runs[0], T = runs[1].pts[0], pts = [this.pos, ...m1.pts], cum = cumulative(pts), n = pts.length;
    const q = pts[n - 2], c0 = pts[n - 1], P = cum[n - 2], L1 = cum[n - 1], L2 = dist(c0, T), H = HALF_STRIDE;
    // Capy may stand a hair inside a clearance edge after a gentle bend: check the new leg from just past its start
    const qFree = (c: Point) => {
      if (this.nav.walkable(q)) return q;
      const L = dist(q, c), u = Math.min(.08, L / 2) / Math.max(L, 1e-9);
      return { x: q.x + (c.x - q.x) * u, z: q.z + (c.z - q.z) * u };
    };
    let best: Point | null = null, bd = .25;
    for (const da of [0, -1, 1, 2, -2]) for (const db of [0, -1, 1, 2, -2]) {
      const a = Math.round(L1 / H) + da, b = Math.round(L2 / H) + db, r1 = a * H - P, r2 = b * H;
      if (a < 1 || b < 1 || r1 < H * .5) continue;
      for (const c of circles(q, r1, T, r2)) {
        const d = dist(c, c0);
        if (d >= bd || !this.nav.walkable(c) || !segmentClear(this.nav, qFree(c), c) || !segmentClear(this.nav, c, T)) continue;
        best = c; bd = d;
      }
    }
    if (best) m1.pts[m1.pts.length - 1] = best;
  }

  private safe(p: Point, region: Region) {
    if (region === 'lane') return inDoorLane(this.nav, p, .05) || this.nav.walkable(p);
    if (region === 'interior') return inInterior(this.nav, p) || inDoorLane(this.nav, p, .05);
    return this.nav.walkable(p);
  }

  private startRun(m: Extract<Move, { kind: 'run' }>): boolean {
    const pts = [this.pos, ...m.pts];
    // after a corner stop the first leg starts where the feet allowed us to stop: check it, else replan
    if (m.region === 'nav' && !segmentClear(this.nav, pts[0], pts[1]) && this.nav.walkable(pts[0]) && this.target) {
      const path = this.replans++ < 3 ? findPath(this.nav, this.pos, this.target) : null;
      if (path) { this.mode = 'stand'; this.turnTo = null; this.plan(path); return true; }
    }
    const cum = cumulative(pts), L = cum[cum.length - 1];
    if (L < HALF_STRIDE / 2) return false;
    // stop on a passing frame as close to the end as safety allows
    const n0 = Math.round(L / HALF_STRIDE), nextRun = this.queue.find(q => q.kind === 'run') as Extract<Move, { kind: 'run' }> | undefined;
    const cands = [n0, n0 - 1, n0 + 1].filter(n => n >= 1).sort((a, b) => Math.abs(a * HALF_STRIDE - L) - Math.abs(b * HALF_STRIDE - L));
    let dStop = 0;
    for (const n of cands) {
      const p = pointAt(pts, cum, n * HALF_STRIDE);
      if (!this.safe(p, m.region)) continue;
      if (nextRun && m.region === 'nav' && !segmentClear(this.nav, p, nextRun.pts[0])) continue;
      dStop = n * HALF_STRIDE; break;
    }
    if (!dStop) dStop = Math.floor(L / HALF_STRIDE) * HALF_STRIDE;
    if (!dStop) return false;
    this.run = { pts, cum, region: m.region, dStop, s: 0, v: 0, phase0: snapPassing(this.walkPhase), dec: null };
    this.mode = 'walk'; this.turnTo = null;
    this.stuckT = 0; this.stuckAt = this.pos;
    this.show(this.holding ? 'WalkCan' : 'Walk', WALK.startFade, true);
    return true;
  }

  update(dt: number) {
    if (this.mode === 'walk' && this.run?.finished) { this.run = null; this.next(); }
    if (this.mode === 'turn' && this.turnTo) {
      this.turnT += dt;
      const d = wrapAngle(this.turnTo() - this.heading);
      const w = TURN.radiansPerSecond * Math.min(1, this.turnT / TURN_FADE);
      const step = Math.sign(d) * Math.min(Math.abs(d), w * dt);
      this.heading = wrapAngle(this.heading + step);
      this.turnPhase = mod(this.turnPhase + TURN_PHASE_SIGN * step / TURN.radiansPerSecond, TURN_LEN);
      if (Math.abs(d) - Math.abs(step) < 1e-4) { this.heading = wrapAngle(this.turnTo()); this.turnTo = null; this.next(); }
    } else if (this.mode === 'walk' && this.run) this.updateRun(dt);
    // height: follow the ground, smoothed, with a little knee dip when stepping up or down
    const g = this.nav.ground(this.pos);
    if (Math.abs(g - this.yTarget) > .03) { this.bobT = 0; this.bobA = g > this.yTarget ? .016 : .01; }
    this.yTarget = g;
    this.y += (this.yTarget - this.y) * (1 - Math.exp(-dt / .07));
    this.bobT += dt;
  }
  get bob() { return this.bobT < .28 ? -this.bobA * Math.sin(Math.PI * this.bobT / .28) : 0; }

  private updateRun(dt: number) {
    const r = this.run!, vt = this.speed(), sPrev = r.s;
    if (!r.dec) {
      const rem = r.dStop - r.s, aN = vt / WALK.stopRamp;
      if (r.v > 1e-6 && rem <= r.v * r.v / (2 * aN) + r.v * dt * .5) {
        const R = Math.max(rem, 1e-6);
        r.dec = { s0: r.s, v0: r.v, a: r.v * r.v / (2 * R), T: 2 * R / r.v, tau: 0 };
      }
    }
    let done = false;
    if (r.dec) {
      const d = r.dec;
      d.tau = Math.min(d.T, d.tau + dt);
      r.s = Math.min(r.dStop, d.s0 + d.v0 * d.tau - .5 * d.a * d.tau * d.tau);
      r.v = Math.max(0, d.v0 - d.a * d.tau);
      if (d.tau >= d.T - 1e-9) { r.s = r.dStop; r.v = 0; done = true; }
    } else {
      const v = Math.min(vt, r.v + vt / WALK.startRamp * dt);
      r.s = Math.min(r.dStop, r.s + (r.v + v) * .5 * dt); r.v = v;
    }
    const ds = r.s - sPrev;
    // steer toward a point a little ahead on the path, turning no faster than the feet allow
    const c = pointAt(r.pts, r.cum, r.s + LOOKAHEAD), want = facing(this.pos, c), lim = WALK.maxTurnWhileWalking * dt;
    if (dist(this.pos, c) > .02) this.heading = wrapAngle(this.heading + clamp(wrapAngle(want - this.heading), -lim, lim));
    this.x += Math.sin(this.heading) * ds; this.z += Math.cos(this.heading) * ds;
    this.walkPhase = mod(r.phase0 + r.s * PHASE_PER_UNIT, WALK_LEN);
    // anti-stuck: 2 s of walking that moved less than 0.05 → replan
    this.stuckT += dt;
    if (this.stuckT >= 2) {
      if (dist(this.pos, this.stuckAt) < .05) this.unstick();
      this.stuckT = 0; this.stuckAt = this.pos;
    }
    if (done) r.finished = true;
  }

  private unstick() {
    const path = this.target && this.replans++ < 3 ? findPath(this.nav, this.pos, this.target) : null;
    this.run = null; this.mode = 'stand';
    if (path) this.plan(path); else { this.failed = true; this.queue = []; this.next(); }
  }

  /** The clip shown now, and its scrubbed time. */
  display(): { clip: WorldClip; phase?: number } {
    if (this.mode === 'walk') return { clip: this.clip, phase: this.walkPhase };
    if (this.mode === 'turn') return { clip: 'TurnStep', phase: this.turnPhase };
    const clip = this.standClipNow();
    if (clip === 'PickUp' && this.standClip === 'Calm') return { clip, phase: HOLD_CAN_PHASE };
    return { clip, phase: this.standPhase };
  }
}

function cumulative(pts: Point[]) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}

// ================================================================================================ the door
class Door {
  value = 0;
  private mode: 'still' | 'open' | 'close' | 'bounce' = 'still'; private t = 0; private from = 0;
  open() { if (this.mode !== 'open' && this.value < 1) { this.mode = 'open'; this.t = 0; this.from = this.value; } }
  close() { if (this.value > 0 || this.mode === 'open') { this.mode = 'close'; this.t = 0; this.from = this.value; } }
  get opened() { return this.value >= 1 && this.mode === 'still'; }
  update(dt: number) {
    this.t += dt;
    if (this.mode === 'open') {
      const u = Math.min(1, this.t / .45); this.value = this.from + (1 - this.from) * (1 - (1 - u) ** 3);
      if (u >= 1) { this.value = 1; this.mode = 'still'; }
    } else if (this.mode === 'close') {
      const u = Math.min(1, this.t / .35); this.value = this.from * (1 - u * u);
      if (u >= 1) { this.value = 0; this.mode = 'bounce'; this.t = 0; }
    } else if (this.mode === 'bounce') {
      // it meets the frame and bounces open a hair
      this.value = this.t < .16 ? .045 * Math.sin(Math.PI * this.t / .16) : 0;
      if (this.t >= .16) this.mode = 'still';
    }
  }
}

// ================================================================================================ steps and tasks
type Face = number | Point | 'camera';
type Step = { stay?: boolean } & (
  | { k: 'walk'; to: Point; face?: Face; region?: Region; exact?: boolean; via?: Point }
  | { k: 'face'; to: Face }
  | { k: 'clip'; clip: WorldClip; seconds?: number; water?: Point & { y: number }; mail?: boolean }
  | { k: 'wait'; seconds: number; rest?: boolean }
  | { k: 'until'; f: () => boolean }
  | { k: 'door'; open: boolean; wait?: boolean; exit?: boolean }
  | { k: 'pickup' } | { k: 'putdown' } | { k: 'dip' }
  | { k: 'settle' }
  | { k: 'mark'; f: () => void }
  | { k: 'call'; f: () => Step[] | null }
);
type Task = { id: string; steps: Step[]; i: number; t: number; started: boolean; resting?: boolean; resumeHeading?: number; interrupt?: boolean };

type Activity = {
  id: string;
  cooldown: number;
  weight: () => number;
  build: () => Step[] | null;
  resting?: boolean;
  /** While this holds the activity ignores its cooldown and may follow itself (sheltering from rain, staying in at night). */
  again?: () => boolean;
};

// ================================================================================================ the brain
class CapyBrain {
  readonly world: WorldIndex; readonly k: number; readonly nav: NavMap;
  private rng: () => number;
  private body: Body; private door = new Door();
  private tasks: Task[] = [];
  private time = 0;
  private sense: Sense = { cameraYaw: CAMERA_YAW, rainy: false, hour: 12 };
  private last = ''; private lastWasActivity = false;
  private readyAt = new Map<string, number>();
  private activities: Activity[];
  private pendingTap = false; private pendingLanded = false;
  private exitEarly = false; private waveOnExit = false;
  private inside = false; private visible = true; private lit = false; private smoke = false;
  private watering: (Point & { y: number }) | null = null;
  private mailUntil = -1;
  private stillT = 0;
  private crownLanded = false;
  private reduced: boolean; private waveUntil = -1; private still?: Pose;

  constructor(private o: BrainOptions) {
    this.world = o.world; this.k = clamp(Math.floor(o.pieces), 0, 21);
    this.nav = o.nav ?? navFor(o.world, this.k);
    this.rng = o.rng ?? Math.random;
    this.reduced = !!o.reducedMotion;
    this.activities = this.world === 0 ? this.cottageActivities() : this.treeActivities();
    const nav = this.nav, mem = o.memory && o.memory.world === o.world ? o.memory : null;
    this.body = new Body(nav, nav.spawn, nav.spawnHeading);
    if (this.reduced) { this.still = signaturePose(this.world, this.k); this.body.place(this.still, this.still.heading); return; }
    if (o.crownDrop) {
      this.body.place(isReachable(nav, nav.crownSpot) ? nav.crownSpot : nav.nearestWalkable(nav.crownSpot) ?? nav.spawn, CAMERA_YAW);
      this.push({ id: 'crown', resting: true, steps: [{ k: 'until', f: () => this.crownLanded }, { k: 'clip', clip: 'Bounce' }] });
    } else if (mem) this.restore(mem);
    else if (nav.door) this.startInside('goodMorning', 1.2, true);
    else this.body.place(nav.spawn, nav.spawnHeading);
  }

  // ---------------------------------------------------------------------------------------------- start states
  private restore(mem: CapyMemory) {
    const nav = this.nav, p = { x: mem.x, z: mem.z };
    this.body.holding = mem.holding;
    if (mem.inside && nav.door) { this.startInside('home', 2 + this.rng() * 4, false); return; }
    if (nav.door && inDoorLane(nav, p, .05) && !nav.walkable(p)) {
      // caught on the steps by the rebuild: back on the step where the lane meets the yard, door shut
      this.body.place(p.z < nav.door.sill.z ? nav.door.inside : nav.door.wait, mem.heading);
      if (p.z < nav.door.sill.z) { this.startInside('home', 1 + this.rng() * 2, false); return; }
    } else if (isReachable(nav, p)) this.body.place(p, mem.heading);
    else this.body.place(nav.nearestWalkable(p) ?? nav.spawn, mem.heading);
    if (mem.holding) this.push({ id: 'returnCan', steps: this.returnCanSteps() });
  }

  /** Capy starts inside the cottage, door shut, and comes out after `stay` seconds. */
  private startInside(id: string, stay: number, wave: boolean) {
    const door = this.nav.door!;
    this.body.place(door.inside, 0);
    this.inside = true; this.visible = !this.nav.interior!.enclosed;
    const steps: Step[] = [{ k: 'wait', seconds: stay, rest: true, stay: true }];
    if (this.body.holding && this.world === 0) steps.push({ k: 'mark', f: () => { this.body.holding = false; } });
    steps.push(...this.exitSteps());
    if (wave) steps.push({ k: 'face', to: 'camera' }, { k: 'clip', clip: 'Wave' });
    this.push({ id, steps });
  }

  // ---------------------------------------------------------------------------------------------- public API
  tap() {
    if (this.reduced) { this.waveUntil = this.time + 1.5; return; }
    if (!this.visible) return;
    if (this.top()?.id === 'greet') return;
    this.pendingTap = true;
  }
  knock() {
    if (this.reduced || !this.inside) return;
    this.exitEarly = true; this.waveOnExit = true;
  }
  pieceLanded() {
    if (this.reduced) return;
    if (this.top()?.id === 'crown') { this.crownLanded = true; return; }
    this.pendingLanded = true;
    if (this.inside) this.exitEarly = true;
  }
  memory(): CapyMemory {
    return { world: this.world, x: this.body.x, z: this.body.z, heading: this.body.heading, holding: this.body.holding, inside: this.inside };
  }

  tick(dt: number, sense: Sense): Pose {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    this.sense = sense; this.time += dt;
    if (this.reduced) return this.stillPose();
    this.door.update(dt);
    this.handleInterrupts();
    this.runSteps(dt);
    this.body.update(dt);
    // visibility through the door's dark gap: hidden once past it in an enclosed house
    if (this.nav.door && this.nav.interior?.enclosed && inDoorLane(this.nav, this.body.pos, .05)) this.visible = this.body.z >= HIDE_Z;
    const d = this.body.display();
    const still = this.body.mode === 'stand' && (d.clip === 'Calm' || (d.clip === 'PickUp' && d.phase === HOLD_CAN_PHASE));
    this.stillT = still ? this.stillT + dt : 0;
    return this.pose();
  }

  // ---------------------------------------------------------------------------------------------- pose
  private pose(): Pose {
    const b = this.body, d = b.display();
    return {
      x: b.x, y: b.y + b.bob, z: b.z, heading: b.heading,
      clip: d.clip, loop: LOOPING_CLIPS.has(d.clip), phase: d.phase, fade: b.fade, cue: b.cue,
      visible: this.visible, door: this.door.value, holding: b.holding,
      canAt: this.world === 1 && this.nav.can && !b.holding ? this.nav.can.at : null,
      windowsLit: this.inside && this.lit, smoke: this.inside && this.smoke,
      watering: this.watering, activity: this.top()?.id ?? 'idle', mailFlag: this.time < this.mailUntil,
    };
  }

  private stillPose(): Pose {
    const s = this.still!;
    if (this.time < this.waveUntil) {
      const clip: WorldClip = s.holding ? 'WaveCan' : 'Wave';
      return { ...s, clip, loop: false, phase: HERO[clip], fade: .2, cue: 2, activity: 'wave' };
    }
    return { ...s, cue: 1 };
  }

  // ---------------------------------------------------------------------------------------------- interrupts
  private interruptible(): boolean {
    const t = this.top();
    if (!t) return true;
    if (t.interrupt) return false;
    const s = t.steps[t.i];
    if (!s) return true;
    if (s.k === 'walk') return (s.region ?? 'nav') !== 'lane';
    return s.k === 'face' || s.k === 'clip' || s.k === 'wait' || s.k === 'settle';
  }

  private handleInterrupts() {
    if (this.pendingTap && !this.visible) this.pendingTap = false; // Capy went in before the tap was answered
    // a tap is answered where Capy is (inside too, when visible); a landed piece waits until Capy is out of the house
    const tap = this.pendingTap, landed = this.pendingLanded && !this.inside;
    if (!tap && !landed) return;
    if (!this.interruptible()) return;
    const cur = this.top();
    if (cur) { cur.resumeHeading = this.body.heading; cur.started = false; if (cur.id === 'idle') this.tasks.pop(); }
    this.body.stop();
    this.watering = null;
    if (tap) {
      this.pendingTap = false;
      this.push({ id: 'greet', interrupt: true, steps: [{ k: 'settle' }, { k: 'face', to: 'camera' }, { k: 'clip', clip: this.body.holding ? 'WaveCan' : 'Wave' }] });
    } else {
      this.pendingLanded = false;
      const steps: Step[] = [{ k: 'settle' }];
      const target = this.world === 0 && this.k === CROWN_PIECE ? null : this.pieceTarget();
      if (target) steps.push({ k: 'face', to: target });
      steps.push({ k: 'clip', clip: 'Cheer' });
      const admire = this.nav.pois.find(p => p.tags.includes('piece'));
      if (admire) steps.push(...this.visit(admire, { k: 'clip', clip: 'Bounce' }));
      this.push({ id: 'cheer', interrupt: true, steps });
    }
  }

  private pieceTarget(): Point | null {
    if (this.k < 1) return null;
    const c = PIECE_CENTRES[this.world][this.k - 1];
    return { x: c[0], z: c[2] };
  }

  // ---------------------------------------------------------------------------------------------- executor
  private top(): Task | undefined { return this.tasks[this.tasks.length - 1]; }
  private push(t: Omit<Task, 'i' | 't' | 'started'>) { this.tasks.push({ ...t, i: 0, t: 0, started: false }); }

  private runSteps(dt: number) {
    for (let guard = 0; guard < 40; guard++) {
      let task = this.top();
      if (!task) { this.schedule(); task = this.top()!; }
      if (task.resumeHeading !== undefined && !task.started) {
        const s = task.steps[task.i];
        if (s && s.k !== 'walk' && s.k !== 'face' && Math.abs(wrapAngle(this.body.heading - task.resumeHeading)) > MIN_TURN) task.steps.splice(task.i, 0, { k: 'face', to: task.resumeHeading });
        task.resumeHeading = undefined;
      }
      let step = task.steps[task.i];
      if (step?.stay && this.exitEarly) {
        // a knock or a landed piece: skip the rest of the stay
        while (step && step.stay) step = task.steps[++task.i];
        if (task.started) { task.started = false; this.body.stop(); this.body.standDefault(); }
      }
      if (!step) { this.finish(task, true); continue; }
      if (!task.started) {
        task.started = true; task.t = 0;
        const r = this.enter(task, step);
        if (r === 'fail') { this.finish(task, false); continue; }
        if (r === 'done') { this.advance(task); continue; }
      } else task.t += dt;
      const r = this.update(task, step);
      if (r === 'fail') { this.finish(task, false); continue; }
      if (r === 'done') { this.advance(task); dt = 0; continue; }
      return;
    }
  }

  private advance(task: Task) {
    const s = task.steps[task.i];
    if (s?.k === 'clip') { this.watering = null; this.body.standDefault(); }
    task.i++; task.started = false;
  }

  private finish(task: Task, ok: boolean) {
    const i = this.tasks.lastIndexOf(task);
    if (i >= 0) this.tasks.splice(i, 1);
    this.watering = null;
    if (task.id !== 'idle' && !task.interrupt) {
      const act = this.activities.find(a => a.id === task.id);
      this.readyAt.set(task.id, this.time + (ok ? act?.cooldown ?? 0 : 15));
      this.last = task.id; this.lastWasActivity = true;
    }
    if (task.id === 'idle') this.lastWasActivity = false;
    if (!ok && this.body.holding && !this.tasks.length && task.id !== 'returnCan') this.push({ id: 'returnCan', steps: this.returnCanSteps() });
    if (!this.tasks.length) this.body.standDefault();
  }

  private heading(f: Face): HeadingFn {
    if (f === 'camera') return () => this.sense.cameraYaw;
    if (typeof f === 'number') return () => f;
    return () => facing(this.body.pos, f);
  }

  private enter(task: Task, s: Step): 'run' | 'done' | 'fail' {
    const b = this.body;
    switch (s.k) {
      case 'walk': {
        const region = s.region ?? 'nav';
        let path: Point[] | null;
        if (region === 'nav') path = (s.exact && typeof s.face === 'number' ? this.approach(s.to, s.face) : null) ?? findPath(this.nav, b.pos, s.to);
        else path = s.via && dist(b.pos, s.via) > .05 ? [s.via, s.to] : [s.to];
        if (!path) return 'fail';
        b.walk(path, region, s.face !== undefined ? this.heading(s.face) : undefined, s.to, !!s.exact && region === 'nav');
        if (region === 'lane' && this.inside && s.to.z > b.z) this.inside = false; // walking out: Capy shows
        return 'run';
      }
      case 'face': b.turn(this.heading(s.to)); return 'run';
      case 'clip':
        if (s.water && this.sense.rainy) return 'done'; // the rain waters for Capy
        b.stand(s.clip, { restart: true });
        // where the pour lands from where Capy actually stands, at the watered thing's height
        if (s.water) this.watering = { ...offsetFrom(b.pos, b.heading, POUR.forward, POUR.right), y: s.water.y };
        if (s.mail) this.mailUntil = this.time + 7;
        return 'run';
      case 'wait': b.standDefault(); return 'run';
      case 'until': b.standDefault(); return 'run';
      case 'settle': return 'run';
      case 'door':
        if (s.open) this.door.open();
        else {
          this.door.close();
          if (s.exit) {
            this.inside = false; this.lit = false; this.smoke = false; this.exitEarly = false;
            if (this.waveOnExit) { this.waveOnExit = false; task.steps.splice(task.i + 1, 0, { k: 'face', to: 'camera' }, { k: 'clip', clip: b.holding ? 'WaveCan' : 'Wave' }); }
          }
        }
        return s.open && s.wait ? 'run' : 'done';
      case 'pickup': b.stand('PickUp', { restart: true }); return 'run';
      case 'putdown': b.stand('PutDown', { restart: true }); return 'run';
      case 'dip': b.stand('PickUp', { phase: HOLD_CAN_PHASE, restart: true, fade: .15 }); return 'run';
      case 'mark': s.f(); return 'done';
      case 'call': {
        const more = s.f();
        if (!more) return 'fail';
        task.steps.splice(task.i + 1, 0, ...more);
        return 'done';
      }
    }
  }

  private update(task: Task, s: Step): 'run' | 'done' | 'fail' {
    const b = this.body, t = task.t;
    switch (s.k) {
      case 'walk':
        if (!b.idle()) return 'run';
        if (b.failed) return 'fail';
        return 'done';
      case 'face': case 'settle': return b.idle() ? 'done' : 'run';
      case 'clip': {
        if (s.water && this.sense.rainy) return 'done';
        const len = s.seconds ?? (LOOPING_CLIPS.has(s.clip) ? WORLD_CLIP_SECONDS[s.clip] : WORLD_CLIP_SECONDS[s.clip] - .15);
        return t >= len ? 'done' : 'run';
      }
      case 'wait': {
        if (s.stay && this.exitEarly) return 'done';
        const limit = s.rest || task.resting || (this.inside && !this.visible) ? s.seconds : Math.min(s.seconds, Math.max(.5, STILL_LIMIT - (this.stillT - t)));
        return t >= limit ? 'done' : 'run';
      }
      case 'until': return s.f() ? 'done' : 'run';
      case 'door': return this.door.opened ? 'done' : 'run';
      case 'pickup':
        if (t >= PICKUP_GRAB) b.holding = true;
        if (t >= PICKUP_CARRY) { b.stand('Calm', { fade: .15 }); return 'done'; }
        return 'run';
      case 'putdown':
        if (t >= PUTDOWN_RELEASE) b.holding = false;
        return t >= WORLD_CLIP_SECONDS.PutDown - .12 ? 'done' : 'run';
      case 'dip': {
        // squat with the can to the water and back up (PickUp scrubbed 23 → 11 → 23)
        const down = .55, hold = .45, ph = t < down ? HOLD_CAN_PHASE - (HOLD_CAN_PHASE - DIP_BOTTOM) * ease(t / down)
          : t < down + hold ? DIP_BOTTOM : DIP_BOTTOM + (HOLD_CAN_PHASE - DIP_BOTTOM) * ease(Math.min(1, (t - down - hold) / down));
        b.stand('PickUp', { phase: ph });
        if (t >= 2 * down + hold) { b.standDefault(.15); return 'done'; }
        return 'run';
      }
      default: return 'done';
    }
  }

  // ---------------------------------------------------------------------------------------------- scheduler
  private schedule() {
    if (this.inside) { this.push({ id: 'leave', steps: this.exitSteps() }); return; } // a task ended inside: come out first
    if (this.lastWasActivity) {
      // idle 2–6 s between activities, never letting Calm run past the still limit
      const d = Math.min(2 + this.rng() * 4, Math.max(.6, STILL_LIMIT - this.stillT));
      this.lastWasActivity = false;
      this.push({ id: 'idle', steps: [{ k: 'wait', seconds: d }] });
      return;
    }
    const ready = (a: Activity) => !!a.again?.() || (this.readyAt.get(a.id) ?? -Infinity) <= this.time;
    for (const allowRepeat of [false, true]) {
      let pool = this.activities.filter(a => ready(a) && (allowRepeat || a.id !== this.last || !!a.again?.())).map(a => ({ a, w: a.weight() })).filter(x => x.w > 0);
      for (let tries = 0; tries < 6 && pool.length; tries++) {
        const total = pool.reduce((s, x) => s + x.w, 0);
        let r = this.rng() * total, pick = pool[pool.length - 1];
        for (const x of pool) { r -= x.w; if (r <= 0) { pick = x; break; } }
        const steps = pick.a.build();
        if (steps && steps.length) { this.push({ id: pick.a.id, steps, resting: pick.a.resting }); return; }
        this.readyAt.set(pick.a.id, this.time + 10);
        pool = pool.filter(x => x !== pick);
      }
    }
    this.lastWasActivity = true;
    this.push({ id: 'idle', steps: [{ k: 'wait', seconds: Math.max(.6, Math.min(2, STILL_LIMIT - this.stillT)) }] });
  }

  // ---------------------------------------------------------------------------------------------- building blocks
  private get night() { const h = this.sense.hour; return h >= 22 || h < 6; }
  private get rainy() { return this.sense.rainy; }
  private rand(a: number, b: number) { return a + this.rng() * (b - a); }
  private poi(id: string) { return this.nav.pois.find(p => p.id === id); }
  private reachable(p: Point) { return !!findPath(this.nav, this.body.pos, p); }

  /**
   * A path for an exact arrival: come in along the final heading over the last few half strides (so no turn is left
   * at the end and the corner before can be aligned), when that lead-in is clear. Null: use the plain path.
   */
  private approach(T: Point, face: number): Point[] | null {
    const here = this.body.pos;
    if (dist(here, T) < .02) return null;
    // straight in along the final heading if possible, else slightly angled (a small TurnStep at the end). The corner at
    // the lead-in point must be a real stop (over SMALL_CORNER), and a sharp one is preferred: the sharper it is, the
    // less it has to move to make both runs whole half strides.
    for (const sharp of [35 * DEG, SMALL_CORNER + 3 * DEG]) for (const skew of [0, .35, -.35, .7, -.7]) for (const n of [4, 3, 5, 2]) {
      const pre = offsetFrom(T, face + skew, -n * HALF_STRIDE, 0);
      if (dist(here, pre) < .3 || !isReachable(this.nav, pre) || !segmentClear(this.nav, pre, T)) continue;
      const p = findPath(this.nav, here, pre);
      if (!p || !p.length) continue;
      const from = p.length > 1 ? p[p.length - 2] : here;
      if (Math.abs(wrapAngle(facing(from, pre) - facing(pre, T))) < sharp) continue;
      return [...p, T];
    }
    return null;
  }

  /** Walk to a POI and do something there. */
  private visit(p: Poi, ...then: Step[]): Step[] { return [{ k: 'walk', to: p.at, face: p.face }, ...then]; }

  /** The landing spot of the pour from a water stand, at the watered thing's height. */
  private pour(p: Poi): Point & { y: number } {
    const w = p.water!, l = offsetFrom(w.at, w.face, POUR.forward, POUR.right);
    return { x: l.x, z: l.z, y: p.target?.y ?? .3 };
  }

  private enterSteps(): Step[] {
    const d = this.nav.door!;
    return [
      { k: 'walk', to: d.approach, face: d.heading },
      { k: 'walk', to: d.wait, region: 'lane', face: d.heading },
      { k: 'door', open: true, wait: true },
      { k: 'walk', to: d.inside, region: 'lane' },
      { k: 'mark', f: () => { this.inside = true; if (this.nav.interior!.enclosed) this.visible = false; } },
      { k: 'door', open: false },
    ];
  }
  private exitSteps(): Step[] {
    const d = this.nav.door!;
    return [
      // back to the door from the writing spot (seen), or simply lined up with it (hidden)
      { k: 'call', f: () => !this.visible ? [] : dist(this.body.pos, d.inside) > .1 ? [{ k: 'walk', to: d.inside, region: 'interior', via: INNER }] : [] },
      { k: 'mark', f: () => { if (!this.visible) this.body.place({ x: d.inside.x, z: Math.min(this.body.z, d.inside.z) }, 0); } },
      { k: 'face', to: 0 },
      { k: 'door', open: true, wait: true },
      { k: 'walk', to: d.wait, region: 'lane' },
      { k: 'door', open: false, exit: true },
    ];
  }
  /** A stay inside: hidden from piece 10; at pieces 7–9 Capy walks to a spot and writes, visible from a high orbit. */
  private stay(seconds: number, o: { lit?: boolean; smoke?: boolean; fetch?: boolean; store?: boolean } = {}): Step[] {
    const steps: Step[] = [{ k: 'mark', f: () => { this.lit = !!o.lit || this.night || this.rainy; this.smoke = !!o.smoke; if (o.store) this.body.holding = false; } }];
    if (this.nav.interior!.enclosed) steps.push({ k: 'wait', seconds, rest: true, stay: true });
    else {
      const spot = { x: this.rand(-.55, .55), z: this.rand(-.45, .45) };
      steps.push(
        { k: 'walk', to: spot, region: 'interior', via: INNER, face: 'camera', stay: true },
        { k: 'clip', clip: 'Write', seconds: Math.max(2, seconds), stay: true },
        { k: 'walk', to: this.nav.door!.inside, region: 'interior', via: INNER },
      );
    }
    if (o.fetch) steps.push({ k: 'mark', f: () => { this.body.holding = true; } });
    return steps;
  }

  private returnCanSteps(): Step[] {
    if (this.world === 1) {
      const c = this.nav.can!;
      return [{ k: 'walk', to: c.stand, face: c.heading, exact: true }, { k: 'putdown' }];
    }
    if (!this.nav.door) return [{ k: 'mark', f: () => { this.body.holding = false; } }];
    return [...this.enterSteps(), ...this.stay(1.2, { store: true }), ...this.exitSteps()];
  }

  private wander(): Step[] | null {
    const here = this.body.pos;
    for (let i = 0; i < 6; i++) {
      const spot = this.nav.randomSpot(this.rng, here, 2.6);
      if (!spot || dist(spot, here) < .5) continue;
      const look: Step = this.rng() < .5 ? { k: 'face', to: 'camera' } : { k: 'face', to: wrapAngle(this.sense.cameraYaw + this.rand(-.9, .9)) };
      return [{ k: 'walk', to: spot }, look, { k: 'wait', seconds: this.rand(1, 2.2) }];
    }
    return null;
  }

  private admire(): Step[] | null {
    const p = this.nav.pois.find(q => q.tags.includes('piece'));
    return p && this.reachable(p.at) ? this.visit(p, { k: 'clip', clip: 'Bounce' }) : null;
  }

  private pondGaze(): Step[] | null {
    const p = this.poi('pond');
    // World 2 gazes from the can's stand: arrive exactly, so a pickup straight after starts on the mark
    return p && this.reachable(p.at) ? [{ k: 'walk', to: p.at, face: p.face, exact: this.world === 1 }, { k: 'wait', seconds: this.rand(1, 2) }, { k: 'clip', clip: 'Sniff' }] : null;
  }

  private shelter(): Step[] | null {
    const s = shelterSpot(this.nav);
    return s ? [{ k: 'walk', to: s.at, face: 'camera' }, { k: 'wait', seconds: this.rand(15, 30), rest: true }] : null;
  }

  private pickReachable(ps: Poi[]): Poi | null {
    const order = ps.slice().sort(() => this.rng() - .5);
    return order.find(p => this.reachable(p.at)) ?? null;
  }

  // ---------------------------------------------------------------------------------------------- World 1
  private cottageActivities(): Activity[] {
    const k = this.k, roof = k >= ROOF_PIECE;
    const outdoor = (w: number) => () => this.rainy ? w * (roof ? .25 : .35) : w;
    const acts: Activity[] = [
      { id: 'wander', cooldown: 0, weight: outdoor(3), build: () => this.wander() },
      { id: 'sniff', cooldown: 25, weight: outdoor(2), build: () => { const p = this.pickReachable(this.nav.pois.filter(q => q.tags.includes('flower'))); return p ? this.visit(p, { k: 'clip', clip: 'Sniff' }) : null; } },
      { id: 'journal', cooldown: 60, weight: outdoor(1.5), build: () => {
        const p = this.poi('doorstep');
        if (p && this.reachable(p.at)) return this.visit(p, { k: 'clip', clip: 'Write', seconds: this.rand(5, 7.5) });
        const spot = this.nav.randomSpot(this.rng, this.body.pos, 1.5);
        return spot ? [{ k: 'walk', to: spot, face: 'camera' }, { k: 'clip', clip: 'Write', seconds: this.rand(5, 7.5) }] : null;
      } },
    ];
    if (k >= 1) acts.push({ id: 'admire', cooldown: 60, weight: outdoor(this.o.freshPiece ? 4 : 1), build: () => this.admire() });
    if (this.poi('pond')) acts.push({ id: 'pond', cooldown: 40, weight: outdoor(1.5), build: () => this.pondGaze() });
    if (this.nav.door) acts.push({
      id: 'home', cooldown: 50, again: () => (this.rainy && roof) || this.night,
      weight: () => 2 * (this.rainy && roof ? 6 : 1) * (this.night ? 3 : 1),
      build: () => {
        // quick pop in 2–4 s or a long stay 12–20 s; much longer when it rains (under a roof) or at night
        const long = this.rng() < (this.night || this.rainy ? .85 : .55);
        const secs = !long ? this.rand(2, 4) : this.rainy && roof ? this.rand(30, 50) : this.night ? this.rand(20, 35) : this.rand(12, 20);
        return [...this.enterSteps(), ...this.stay(secs, { lit: long, smoke: long && k >= CHIMNEY_PIECE }), ...this.exitSteps()];
      },
    });
    if (k >= MAILBOX_PIECE) acts.push({ id: 'mailbox', cooldown: 60, weight: outdoor(1.5), build: () => {
      const p = this.poi('mailbox');
      return p && this.reachable(p.at) ? this.visit(p, { k: 'wait', seconds: .5 }, { k: 'clip', clip: 'Bounce', mail: true }) : null;
    } });
    if (k >= 17 && this.nav.door) acts.push({ id: 'water', cooldown: 90, weight: () => this.rainy ? 0 : 1.5, build: () => {
      const bush = this.poi('bush17'), garden = this.poi('garden18');
      if (!bush?.water || !this.reachable(bush.water.at)) return null;
      const steps: Step[] = [...this.enterSteps(), ...this.stay(this.rand(1.5, 2.5), { fetch: true }), ...this.exitSteps()];
      steps.push({ k: 'walk', to: bush.water.at, face: bush.water.face, exact: true }, { k: 'clip', clip: 'Water', seconds: 4, water: this.pour(bush) });
      if (garden?.water) steps.push({ k: 'walk', to: garden.water.at, face: garden.water.face, exact: true }, { k: 'clip', clip: 'Water', seconds: 4, water: this.pour(garden) });
      steps.push(...this.enterSteps(), ...this.stay(1.2, { store: true }), ...this.exitSteps());
      return steps;
    } });
    if (k >= 21) acts.push({ id: 'sign', cooldown: 90, weight: outdoor(.5), build: () => {
      const p = this.poi('sign');
      return p && this.reachable(p.at) ? this.visit(p, { k: 'face', to: 'camera' }, { k: 'clip', clip: 'Wave' }) : null;
    } });
    if (!roof) acts.push({ id: 'shelter', cooldown: 25, resting: true, again: () => this.rainy, weight: () => this.rainy ? 6 : 0, build: () => this.shelter() });
    return acts;
  }

  // ---------------------------------------------------------------------------------------------- World 2
  private treeActivities(): Activity[] {
    const k = this.k;
    const outdoor = (w: number) => () => this.rainy ? w * .35 : w;
    const acts: Activity[] = [
      { id: 'wander', cooldown: 0, weight: outdoor(3), build: () => this.wander() },
      { id: 'pond', cooldown: 40, weight: outdoor(1.5), build: () => this.pondGaze() },
      { id: 'shelter', cooldown: 25, resting: true, again: () => this.rainy, weight: () => this.rainy ? 6 : 0, build: () => this.shelter() },
    ];
    if (k >= 1) {
      acts.push({ id: 'admire', cooldown: 60, weight: outdoor(this.o.freshPiece ? 4 : 1), build: () => this.admire() });
      acts.push({ id: 'water', cooldown: 45, weight: () => this.rainy ? 0 : 4, build: () => {
        const c = this.nav.can!, tree = this.poi('tree');
        if (!tree?.water || !this.reachable(c.stand)) return null;
        const steps: Step[] = [
          { k: 'walk', to: c.stand, face: c.heading, exact: true }, { k: 'pickup' }, { k: 'dip' },
          { k: 'walk', to: tree.water.at, face: tree.water.face, exact: true }, { k: 'clip', clip: 'Water', seconds: this.rng() < .5 ? 4 : 6, water: this.pour(tree) },
        ];
        const flowers = this.nav.pois.filter(p => p.tags.includes('bigFlower') && p.water);
        if (flowers.length && this.rng() < .5) {
          const f = flowers[Math.floor(this.rng() * flowers.length)];
          steps.push({ k: 'walk', to: f.water!.at, face: f.water!.face, exact: true }, { k: 'clip', clip: 'Water', seconds: this.rng() < .5 ? 2 : 4, water: this.pour(f) });
        }
        steps.push({ k: 'walk', to: c.stand, face: c.heading, exact: true }, { k: 'putdown' });
        return steps;
      } });
    }
    if (k >= 15) acts.push({ id: 'books', cooldown: 60, weight: outdoor(2), build: () => {
      const p = this.poi('books');
      return p && this.reachable(p.at) ? this.visit(p, { k: 'clip', clip: 'Write', seconds: this.rand(5, 7.5) }) : null;
    } });
    if (k >= 16) acts.push({ id: 'table', cooldown: 60, weight: outdoor(1.5), build: () => {
      const p = this.pickReachable([this.poi('table'), this.poi('bench')].filter((q): q is Poi => !!q));
      return p ? this.visit(p, { k: 'clip', clip: 'Write', seconds: this.rand(5, 7.5) }) : null;
    } });
    if (k >= 18) acts.push({ id: 'bigFlower', cooldown: 30, weight: outdoor(1.5), build: () => {
      const p = this.pickReachable(this.nav.pois.filter(q => q.tags.includes('bigFlower')));
      return p ? this.visit(p, { k: 'clip', clip: 'Bounce' }) : null;
    } });
    return acts;
  }
}

function ease(u: number) { return u * u * (3 - 2 * u); }

// ================================================================================================ public API
export function createBrain(o: BrainOptions): Brain {
  const b = new CapyBrain(o);
  return { tick: (dt, s) => b.tick(dt, s), tap: () => b.tap(), knock: () => b.knock(), pieceLanded: () => b.pieceLanded(), memory: () => b.memory() };
}

/**
 * The still signature pose (Collection cards and reduced motion, doc §5.8): World 1 stands in front of the steps
 * facing the camera (at the rest spot before the steps exist); World 2 waters the tree, can in hand, at the Water clip's
 * hero frame. `phase` holds the clip there.
 */
export function signaturePose(world: WorldIndex, pieces: number): Pose {
  const nav = navFor(world, pieces);
  const base = (at: Point, heading: number, clip: WorldClip, holding: boolean): Pose => ({
    x: at.x, y: nav.ground(at), z: at.z, heading, clip, loop: false, phase: HERO[clip as keyof typeof HERO], fade: 0, cue: 1,
    visible: true, door: 0, holding, canAt: world === 1 && nav.can && !holding ? nav.can.at : null,
    windowsLit: false, smoke: false, watering: null, activity: 'signature', mailFlag: false,
  });
  if (world === 0) {
    const step = nav.pois.find(p => p.id === 'doorstep');
    return step ? base(step.at, CAMERA_YAW, 'Calm', false) : base(nav.spawn, nav.spawnHeading, 'Calm', false);
  }
  const tree = nav.pois.find(p => p.id === 'tree');
  return tree?.water ? base(tree.water.at, tree.water.face, 'Water', true) : base(nav.spawn, nav.spawnHeading, 'Calm', false);
}
