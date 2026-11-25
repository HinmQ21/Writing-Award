/**
 * The contract between the world Capy's navigation (capyNav.ts), its behaviour (capyBehavior.ts)
 * and the three.js glue (capyWorld.ts). Design: docs/capy/logo-and-world-behavior.md, sections 4–7.
 *
 * Everything is in the scene's `root` space: x to the right, z toward the front (the camera side), y up.
 * The grass top is y = 0.13. A heading is Object3D.rotation.y, so a Capy with heading h faces (sin h, cos h).
 */

export type Point = { x: number; z: number };
/** 0 = Capy's Dream Cottage (World 1), 1 = Magic Tree (World 2). The Lego world has no Capy. */
export type WorldIndex = 0 | 1;

/** (Added in phase 3: 'piece', the stand point for admiring the newest piece.) */
export type PoiTag = 'rest' | 'doorstep' | 'flower' | 'bigFlower' | 'pond' | 'tree' | 'mailbox' | 'sign' | 'books' | 'table' | 'bench' | 'piece';
export type Poi = {
  id: string;
  tags: PoiTag[];
  /** Where Capy's centre stands. */
  at: Point;
  /** Heading to hold there. */
  face: number;
  /** What Capy looks at, sniffs or waters. y is its top, for sparkles. */
  target?: Point & { y: number };
  /** First piece count that has it. */
  unlock: number;
  /** Last piece count where it is still reachable, if a later piece cuts it off. */
  until?: number;
  /**
   * (Added in phase 3.) Where to stand and face so the Water clip's pour, which lands ahead and to Capy's right,
   * falls on `target`. Only on things Capy waters.
   */
  water?: { at: Point; face: number };
};

/** The scripted walk through the cottage door (World 1, 7+ pieces). Capy follows it in this order to go in, and in reverse to come out. */
export type DoorLane = { approach: Point; wait: Point; step: Point; sill: Point; inside: Point; heading: number };

export type NavMap = {
  world: WorldIndex;
  pieces: number;
  /** Grid cell size. */
  cell: number;
  /** Capy's centre may stand here: inside the yard and clear of every obstacle by Capy's clearances. */
  walkable(p: Point): boolean;
  /** At least half of Capy is visible from the default camera here. */
  visible(p: Point): boolean;
  /** Ground height under p: grass .13, stones .20, lower step .18, upper step .275, door sill and house floor .36. */
  ground(p: Point): number;
  /** Points of interest available at this piece count. */
  pois: Poi[];
  spawn: Point;
  spawnHeading: number;
  door?: DoorLane;
  /** Inside the cottage (7+ pieces). `enclosed` from piece 10, when the gable hides the interior from every view. */
  interior?: { min: Point; max: Point; floor: number; enclosed: boolean };
  /** Where Capy waits for the crown to land (World 1, piece 20). */
  crownSpot: Point;
  /** World 2: where the watering can rests by the pond, and where Capy stands (and faces) to pick it up and fill it. */
  can?: { at: Point; stand: Point; heading: number };
  /** A random walkable, visible point, optionally within `radius` of `near`. Null if there is none. */
  randomSpot(rng: () => number, near?: Point, radius?: number): Point | null;
  nearestWalkable(p: Point): Point | null;
};

/**
 * Clips the world Capy plays. Write, Cheer and Bounce are load-time remixes of Focused, Celebrate and Happy
 * (streak effects muted); WaveCan is Wave with the can arm from WalkCan; PutDown is PickUp played backwards.
 */
export type WorldClip = 'Calm' | 'Walk' | 'WalkCan' | 'TurnStep' | 'Water' | 'Sniff' | 'Wave' | 'WaveCan' | 'PickUp' | 'PutDown' | 'Cheer' | 'Bounce' | 'Write';

/**
 * Clip lengths in seconds at 24 fps. Walk, WalkCan and TurnStep hold two cycles each.
 * (Phase 3: Sniff, Wave, WaveCan, PickUp and PutDown set to the durations measured in the exported GLB; the looping
 * clips include their wrap frame.)
 */
export const WORLD_CLIP_SECONDS: Record<WorldClip, number> = {
  Calm: 4, Walk: 36 / 24, WalkCan: 36 / 24, TurnStep: 36 / 24, Water: 48 / 24, Sniff: 59 / 24, Wave: 43 / 24, WaveCan: 43 / 24,
  PickUp: 23 / 24, PutDown: 23 / 24, Cheer: 2, Bounce: 3, Write: 4,
};
/** Clips that loop; the others play once. */
export const LOOPING_CLIPS: ReadonlySet<WorldClip> = new Set<WorldClip>(['Calm', 'Walk', 'WalkCan', 'TurnStep', 'Water', 'Write']);

/** Capy's scale in the worlds: small enough for the 0.8-wide door. */
export const WORLD_SCALE = .85;

/**
 * The walk cycle (art/capy, measured): 18 frames per cycle at 24 fps, stride 0.40 model units per cycle.
 * At timeScale 1 and WORLD_SCALE that is 0.453 world units per second, so timeScale = speed / WALK.speedAtUnitScale.
 * Start and stop only at a passing frame (feet together), so a cross-fade never slides a planted foot.
 */
export const WALK = {
  fps: 24,
  cycleFrames: 18,
  stride: .40,
  speedAtUnitScale: .40 * WORLD_SCALE / (18 / 24),
  /** Passing frames within a cycle (the lifted foot passes the planted one), measured in the GLB; heel strikes at 0 and 9. */
  passing: [5.076, 14.076] as const,
  /** Begin the 0.2 s stop ramp this many frames before a passing frame. */
  stopLead: 2.4,
  startFade: .2,
  startRamp: .25,
  stopRamp: .2,
  stopFade: .2,
  /** Normal and can-carrying speeds, world units per second. */
  speed: .5,
  carrySpeed: .4,
  /** Heading changes while walking stay under this, or the feet slide. Sharper turns stop and use TurnStep. */
  maxTurnWhileWalking: 15 * Math.PI / 180,
} as const;

/** TurnStep: the planted foot counter-rotates at exactly the root's yaw. 60° per 18-frame cycle = 80°/s at timeScale 1; play it backwards to turn right. */
export const TURN = { radiansPerSecond: 80 * Math.PI / 180, cycleFrames: 18 } as const;

export type Sense = {
  /** Heading from Capy toward the camera in root space, so facing the camera means heading = cameraYaw. */
  cameraYaw: number;
  rainy: boolean;
  /** Local hour 0–23 in the account timezone. */
  hour: number;
};

export type Pose = {
  x: number;
  y: number;
  z: number;
  heading: number;
  clip: WorldClip;
  loop: boolean;
  /**
   * Walk, WalkCan and TurnStep: the clip time in seconds, scrubbed by the brain so planted feet stay put on the ground
   * (the glue sets action.time and keeps the action's own timeScale at 0). Undefined for other clips, which play at normal speed.
   * (Phase 3 addition: whenever `phase` is set the glue scrubs the clip the same way, whatever the clip. The brain also
   * sets it for PickUp held at its last frame (the carrying pose) while Capy stands with the can, for PickUp during the
   * dip at the pond, and for still poses: signaturePose() and reduced motion.)
   */
  phase?: number;
  /** Cross-fade to use when `clip` changes. */
  fade: number;
  /**
   * (Added in phase 3.) Goes up by one every time the brain starts a clip from its beginning, so the glue can restart
   * a one-shot clip that follows itself (Wave after Wave) even though `clip` did not change.
   */
  cue?: number;
  visible: boolean;
  /** Door opening, 0 (shut) to 1 (open, +92°). */
  door: number;
  holding: boolean;
  /** Where the static can stands, or null while Capy holds it or it is stored inside the house. */
  canAt: Point | null;
  windowsLit: boolean;
  smoke: boolean;
  /** Set while pouring: the spot being watered, for sparkles and the plant's little bounce. */
  watering: (Point & { y: number }) | null;
  /** (Added in phase 3.) World 1, piece 19: the mailbox flag is up (Capy checked the mail). */
  mailFlag?: boolean;
  /** Current activity id, for debugging and the scene's aria-label. */
  activity: string;
};

/** What survives a scene rebuild (a new piece, rain). Kept per world at module level by the glue. */
export type CapyMemory = { world: WorldIndex; x: number; z: number; heading: number; holding: boolean; inside: boolean };
