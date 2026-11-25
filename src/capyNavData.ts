/**
 * Hand-ported geometry for the world Capy's navigation (capyNav.ts). Pure data, no three.js.
 *
 * Every shape mirrors src/Scene.tsx (decor, buildCottage, buildTree) in the scene's `root` space, with the layout
 * changes of docs/capy/logo-and-world-behavior.md §4.4 already applied: no decor bush or flower in the door lane
 * (|x| < 1 and z > 1.3), the piece-17 flower bush is three balls at x −0.97 / −0.845 / −0.72, and the crown drops
 * at (−1.90, 1.70). The design agent's analysis (docs/capy/design/capy-nav-data.json) is the oracle for the numbers.
 *
 * Shapes carry the piece that makes them appear (0 = decor, always there); piece k is `parts[k - 1]` in Scene.tsx.
 */
import { WORLD_SCALE } from './capyWorldTypes';
import type { DoorLane, Point, Poi, WorldIndex } from './capyWorldTypes';

export type Vec3 = readonly [number, number, number];

/**
 * hard: blocks Capy where it meets Capy's body band (clearance R_HARD) or feet band (R_LOW).
 * soft: ring tufts and decor flowers. Only a path cost (and the stems of decor flowers keep R_STEM).
 * ground: steps. Walkable surfaces, so not an obstacle, but they hide what is right behind them.
 * foundation: the house slab. An obstacle like `hard`, and a non-walkable surface (y .36).
 */
export type PrimClass = 'hard' | 'soft' | 'ground' | 'foundation';
export type Prim =
  | { kind: 'box'; c: Vec3; h: Vec3; /** Rotation about z through c (the roof halves). */ rz?: number; piece: number; cls: PrimClass }
  | { kind: 'ell'; c: Vec3; r: Vec3; piece: number; cls: PrimClass }
  /** A finite cylinder from cap centre a to cap centre b. */
  | { kind: 'cyl'; a: Vec3; b: Vec3; r: number; piece: number; cls: PrimClass }
  /** The piece-10 gable: a triangular prism x ±1.31, y 2.28 → 3.22, z ±1.36. */
  | { kind: 'gable'; piece: number; cls: PrimClass };

/** A ground surface. The height under a point is the highest surface covering it; its `walk` decides walkability. */
export type Surface = {
  name: string;
  rect?: readonly [x0: number, x1: number, z0: number, z1: number];
  ell?: readonly [cx: number, cz: number, ax: number, az: number];
  top: number;
  walk: boolean;
  piece: number;
};

// ------------------------------------------------------------------------------------------------ Capy and camera
/** Capy's height in the worlds (beret top). */
export const CAPY_HEIGHT = 1.157 * WORLD_SCALE;
export const GRASS_Y = .13;

/** Clearances and the walk grid (doc §4.1, §4.3). */
export const NAV = {
  cell: .1,
  nx: 72,
  nz: 60,
  /** Centre of cell (0, 0). */
  x0: -3.55,
  z0: -2.95,
  /** Hard obstacles in the body band (≥ 0.15 above Capy's ground): body radius 0.36 + 0.02 margin. */
  rHard: .38,
  /** Hard obstacles in the feet band (0.035–0.15 above Capy's ground). */
  rLow: .28,
  /** From the pond rim. */
  rWater: .24,
  /** From a decor flower's stem (its petals may brush Capy's side). */
  rStem: .36,
  /** Soft decor closer than this costs extra. */
  rSoft: .36,
  softCost: 2.5,
  bodyBand: [.15, CAPY_HEIGHT + .02] as const,
  feetBand: [.035, .15] as const,
  /** A shape only counts in a band when it overlaps it by more than this (the design's 4 cm voxels). */
  bandEps: .025,
  maxStep: .10,
  /** Capy's centre stays inside the ring-tuft ellipse and this rectangle. */
  ringA: 3.32,
  ringB: 2.75,
  boundX: 3.085,
  boundZ: 2.535,
} as const;

/** The default camera's direction in root space (from the target toward the camera), and its heading. */
export const CAMERA_DIR: Vec3 = (() => {
  const v = [7.8, 6.2 - 1.25, 9.0], a = .15, c = Math.cos(a), s = Math.sin(a);
  const r = [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c], n = Math.hypot(r[0], r[1], r[2]);
  return [r[0] / n, r[1] / n, r[2] / n] as const;
})();
export const CAMERA_YAW = Math.atan2(CAMERA_DIR[0], CAMERA_DIR[2]);

/**
 * Where the water from the Water clip lands, relative to Capy's centre and heading, in world units at WORLD_SCALE
 * (measured in the GLB: 0.684 forward and 0.502 to Capy's right in model units, root-local (−0.502, 0.012, 0.684);
 * right = −x when Capy faces +z). Drops spread about 0.065 × 0.119.
 */
export const POUR = { forward: .684 * WORLD_SCALE, right: .502 * WORLD_SCALE } as const;
/**
 * Where the static can stands relative to Capy's centre and heading when PickUp's hand closes on it (frame 10, can
 * scale 0 → 1): Capy-local (−0.3375, 0, 0.4459) model units in the GLB.
 */
export const GRAB = { forward: .4459 * WORLD_SCALE, right: .3375 * WORLD_SCALE } as const;
/** Sniff's nose is lowest at frame 20, 0.581 model units ahead (0.494 world), so sniffing stands this far from a flower. */
export const SNIFF_REACH = .49;

// ------------------------------------------------------------------------------------------------ shape helpers
type Out = Prim[];
const box = (o: Out, w: number, h: number, d: number, x: number, y: number, z: number, piece: number, cls: PrimClass = 'hard') =>
  o.push({ kind: 'box', c: [x, y, z], h: [w / 2, h / 2, d / 2], piece, cls });
const ball = (o: Out, r: number, x: number, y: number, z: number, piece: number, cls: PrimClass = 'hard', s: Vec3 = [1, 1, 1]) =>
  o.push({ kind: 'ell', c: [x, y, z], r: [r * s[0], r * s[1], r * s[2]], piece, cls });
/** A vertical cylinder centred at (x, y, z), like Scene.tsx's cylinder(). */
const cylinder = (o: Out, r: number, h: number, x: number, y: number, z: number, piece: number, cls: PrimClass = 'hard') =>
  o.push({ kind: 'cyl', a: [x, y - h / 2, z], b: [x, y + h / 2, z], r, piece, cls });
const cylAxis = (o: Out, r: number, a: Vec3, b: Vec3, piece: number, cls: PrimClass = 'hard') => o.push({ kind: 'cyl', a, b, r, piece, cls });

/**
 * Scene.tsx flower(): a stem (r .022, h .28 at y + .06) and five petals plus a centre around y + .23, scaled by size.
 * The head is one flattened ellipsoid covering the petals (radius .2, depth −.039…+.135). `side` turns it to face +x
 * (the piece-9 window box, whose group is turned a quarter).
 */
function flower(o: Out, x: number, y: number, z: number, s: number, piece: number, cls: PrimClass, side = false) {
  cylinder(o, .022 * s, .28 * s, x, y + .06 * s, z, piece, cls);
  if (side) ball(o, 1, x + .048 * s, y + .23 * s, z, piece, cls, [.087 * s, .2 * s, .2 * s]);
  else ball(o, 1, x, y + .23 * s, z + .048 * s, piece, cls, [.2 * s, .2 * s, .087 * s]);
}
/** Scene.tsx tree(): trunk, a branch turned −0.65 about z, seven canopy balls. */
export const CANOPY: readonly (readonly [number, number, number, number])[] = [[0, 1.9, 0, .75], [-.5, 1.65, .04, .58], [.5, 1.75, .05, .62], [.15, 2.25, .05, .58], [-.3, 2.15, -.2, .55], [.1, 1.8, .5, .6], [-.2, 2, -.5, .5]];
function tree(o: Out, x: number, z: number, s: number, piece: number) {
  cylinder(o, .16 * s, 1.55 * s, x, .77 * s, z, piece);
  const ax = Math.sin(.65), ay = Math.cos(.65);
  cylAxis(o, .09 * s, [x + (.2 - .4 * ax) * s, (1.3 - .4 * ay) * s, z], [x + (.2 + .4 * ax) * s, (1.3 + .4 * ay) * s, z], piece);
  for (const [a, b, c, r] of CANOPY) ball(o, r * s, x + a * s, b * s, z + c * s, piece);
}
/** Scene.tsx windowRound() facing +z: glass disc, trim ring and cross bars as one disc. */
function windowRoundZ(o: Out, x: number, y: number, z: number, r: number, piece: number) {
  cylAxis(o, r + .065, [x, y, z - .0375], [x, y, z + .125], piece);
}

// ------------------------------------------------------------------------------------------------ decor (both worlds)
/** The old Capy spot that the decor loops keep clear (Scene.tsx CAPY_X, CAPY_Z). */
const CAPY_SPOT: Point = { x: -1.72, z: 1.8 };
/** §4.4: the decor loops also skip the door lane. */
export const inKeepClear = (x: number, z: number) => Math.abs(x) < 1 && z > 1.3;

export const DECOR_TREES: readonly { x: number; z: number; s: number }[] = [{ x: -2.65, z: -1.35, s: 1.05 }, { x: 2.55, z: -1.75, s: .65 }];
export const POND_RIM = { cx: 2.5, cz: 1.1, ax: .63, az: .63 * 1.45 } as const;

export function decorBushes(): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39, x = Math.sin(a) * 2.75, z = Math.cos(a) * 2.15;
    if (Math.hypot(x - CAPY_SPOT.x, z - CAPY_SPOT.z) > .92 && !inKeepClear(x, z)) out.push({ x, z });
  }
  return out;
}
export function decorFlowers(): { i: number; x: number; z: number; size: number }[] {
  const out: { i: number; x: number; z: number; size: number }[] = [];
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4, x = Math.sin(a) * (2.6 + (i % 2) * .2), z = Math.cos(a) * 2.3;
    if (Math.hypot(x - CAPY_SPOT.x, z - CAPY_SPOT.z) > .88 && !inKeepClear(x, z)) out.push({ i, x, z, size: .6 + (i % 3) * .18 });
  }
  return out;
}
/** Flower head top, for sniff sparkles. */
export const flowerTop = (y: number, size: number) => y + .43 * size;

function decor(o: Out) {
  for (let i = 0; i < 22; i++) {
    const a = i * Math.PI * 2 / 22, r = .2 + (i % 3) * .04;
    ball(o, r, Math.cos(a) * 3.32, .08, Math.sin(a) * 2.75, 0, 'soft', [1.3, .6, 1.1]);
  }
  for (const t of DECOR_TREES) tree(o, t.x, t.z, t.s, 0);
  for (const b of decorBushes()) ball(o, .26, b.x, .25, b.z, 0, 'hard', [1.3, .85, 1]);
  for (const f of decorFlowers()) flower(o, f.x, .17, f.z, f.size, 0, 'soft');
}

// ------------------------------------------------------------------------------------------------ World 1: the cottage
/** The piece-17 flower bush after §4.4: three balls. Scene.tsx must use the same x values. */
export const BUSH17_X = [-.97, -.845, -.72] as const;

function cottage(o: Out) {
  box(o, 2.8, .2, 2.92, 0, .26, 0, 1, 'foundation');
  box(o, 1.15, .15, .55, 0, .2, 1.72, 2, 'ground'); box(o, 1.4, .12, .52, 0, .12, 2.05, 2, 'ground');
  box(o, 2.6, 1.94, .18, 0, 1.31, 1.32, 3);
  for (const x of [-1.27, 1.27]) box(o, .13, 2.05, .13, x, 1.32, 1.43, 3);
  box(o, 2.6, .12, .12, 0, .47, 1.44, 3);
  box(o, .18, 1.94, 2.65, -1.3, 1.31, 0, 4);
  box(o, .18, 1.94, 2.65, 1.3, 1.31, 0, 5);
  box(o, 2.6, 1.94, .18, 0, 1.31, -1.32, 6);
  // 7: the arched door (extruded .12 + .025 bevel from z 1.405), knob, little round window
  box(o, .85, 1.025, .17, 0, .8475, 1.49, 7);
  cylAxis(o, .425, [0, 1.36, 1.405], [0, 1.36, 1.575], 7);
  ball(o, .055, .24, .98, 1.62, 7);
  windowRoundZ(o, 0, 1.38, 1.56, .19, 7);
  windowRoundZ(o, 0, 2.55, 1.49, .27, 8);
  // 9: the side window group sits at (1.43, 1.43, 0) turned a quarter, so its local (x, y, z) is root (1.43 + z, 1.43 + y, −x)
  cylAxis(o, .405, [1.3925, 1.43, 0], [1.555, 1.43, 0], 9);
  o.push({ kind: 'box', c: [1.49, .98, 0], h: [.1, .05, .47], piece: 9, cls: 'hard' });
  o.push({ kind: 'box', c: [1.49, .87, 0], h: [.11, .1, .415], piece: 9, cls: 'hard' });
  for (let i = 0; i < 4; i++) flower(o, 1.59, .97, .3 - i * .2, .5, 9, 'hard', true);
  o.push({ kind: 'gable', piece: 10, cls: 'hard' });
  // 11, 12: each roof half (slab, shingles, eave trims) as one box turned about z
  for (const side of [-1, 1]) {
    const a = side * -.59;
    o.push({ kind: 'box', c: [side * .74 - .045 * Math.sin(a), 2.86 + .045 * Math.cos(a), 0], h: [.995, .135, 1.68], rz: a, piece: side < 0 ? 11 : 12, cls: 'hard' });
  }
  box(o, .48, 1.12, .48, .68, 3.25, -.6, 13); box(o, .6, .14, .6, .68, 3.86, -.6, 13);
  for (const side of [-1, 1]) {
    const piece = side < 0 ? 14 : 15, x = side * 2.45;
    for (let i = 0; i < 4; i++) { box(o, .15, .73, .16, x, .47, .2 + i * .55, piece); ball(o, .09, x, .88, .2 + i * .55, piece); }
    box(o, .1, .12, 1.9, x, .45, 1, piece); box(o, .1, .12, 1.9, x, .7, 1, piece);
  }
  tree(o, 2.5, -1.9, .7, 16);
  for (const x of BUSH17_X) { ball(o, .25, x, .43, 1.62, 17); flower(o, x, .58, 1.8, .65, 17, 'hard'); }
  for (let i = 0; i < 10; i++) flower(o, 1.6 + Math.sin(i * 2) * .38, .21, 1.8 + Math.cos(i * 2) * .4, .8, 18, 'hard');
  cylinder(o, .055, .73, 1.8, .48, 2.13, 19); box(o, .39, .29, .3, 1.8, .97, 2.13, 19); box(o, .2, .03, .03, 1.8, 1, 2.3, 19);
  // 20 is the crown, worn by Capy.
  box(o, .7, .4, .1, -2.35, .84, 2.1, 21); box(o, .08, .65, .08, -2.35, .39, 2.1, 21);
}

// ------------------------------------------------------------------------------------------------ World 2: the magic tree
function magicTree(o: Out) {
  cylinder(o, .45, .2, 0, .2, 0, 1);
  for (let i = 1; i < 6; i++) cylinder(o, .3 - i * .025, .55, Math.sin(i) * .08, .25 + i * .5, 0, i + 1);
  for (let i = 6; i < 14; i++) { const a = (i - 6) * 2.4; ball(o, .8, Math.sin(a) * .95, 2.8 + Math.cos(a * 2) * .45, Math.cos(a) * .8, i + 1); }
  box(o, 1.15, .6, .5, -1.5, .45, .8, 15);
  for (let i = 0; i < 8; i++) box(o, .09, .3 + (i % 3) * .06, .22, -1.95 + i * .13, .88, .8, 15);
  cylinder(o, .6, .13, 1.4, .75, 1.2, 16); cylinder(o, .08, .6, 1.4, .4, 1.2, 16);
  box(o, .65, .15, .45, 1.45, .35, 2, 17);
  for (let i = 17; i < 21; i++) flower(o, Math.sin(i * 2) * 2, .2, Math.cos(i * 2) * 2, 1.3, i + 1, 'hard');
}

const primCache = new Map<WorldIndex, Prim[]>();
/** Every shape of a world (decor + all 21 pieces). Filter by `piece <= pieces`. */
export function worldPrims(world: WorldIndex): Prim[] {
  let p = primCache.get(world);
  if (!p) { p = []; decor(p); if (world === 0) cottage(p); else magicTree(p); primCache.set(world, p); }
  return p;
}

/** Ground surfaces (doc §4.1). */
export function worldSurfaces(world: WorldIndex): Surface[] {
  const s: Surface[] = [{ name: 'grass', rect: [-3.565, 3.565, -3.015, 3.015], top: GRASS_Y, walk: true, piece: 0 }];
  for (let i = 0; i < 4; i++) s.push({ name: `stone${i}`, ell: [.05 + Math.sin(i * .8) * .2, 1.65 + i * .36, .25 * 1.25, .25 * .67], top: .20, walk: true, piece: 0 });
  s.push({ name: 'pond rim', ell: [POND_RIM.cx, POND_RIM.cz, POND_RIM.ax, POND_RIM.az], top: .195, walk: false, piece: 0 });
  s.push({ name: 'pond', ell: [2.5, 1.1, .52, .52 * 1.45], top: .2275, walk: false, piece: 0 });
  if (world === 0) {
    s.push({ name: 'house floor', rect: [-1.4, 1.4, -1.46, 1.46], top: .36, walk: false, piece: 1 });
    s.push({ name: 'lower step', rect: [-.7, .7, 1.79, 2.31], top: .18, walk: true, piece: 2 });
    s.push({ name: 'upper step', rect: [-.575, .575, 1.445, 1.995], top: .275, walk: true, piece: 2 });
  }
  return s;
}

// ------------------------------------------------------------------------------------------------ places
export const SPAWN: Point = { x: -1.85, z: 1.55 };
export const CROWN_SPOT: Point = { x: -1.90, z: 1.70 };

/** World 1, 7+ pieces (doc §5.4). */
export const DOOR: DoorLane = { approach: { x: 0, z: 2.45 }, wait: { x: 0, z: 2.12 }, step: { x: 0, z: 1.72 }, sill: { x: 0, z: 1.46 }, inside: { x: 0, z: 1.0 }, heading: Math.PI };
export const DOOR_PIECE = 7;
/** From this piece the gable closes the house: Capy inside is hidden. */
export const ENCLOSED_PIECE = 10;
/** Capy's centre inside the cottage (inner faces ±1.21 / ±1.23 less Capy's body). */
export const INTERIOR = { min: { x: -.85, z: -.87 }, max: { x: .85, z: .87 }, floor: .36 } as const;
/** World 1 has a roof from this piece: rain keeps Capy mostly inside. */
export const ROOF_PIECE = 11;
export const CHIMNEY_PIECE = 13;
export const MAILBOX_PIECE = 19;
export const CROWN_PIECE = 20;

/**
 * World 2: the can rests by the pond where Capy's right hand finds it from the stand (GRAB offset), and the
 * stand faces the water. (The design's prop spot (2.24, 0.17) was on Capy's left; the right hand holds the can.)
 */
export const CAN_STAND: Point = { x: 1.95, z: .10 };
export const CAN_HEADING = .503;
export const CAN_AT: Point = offsetFrom(CAN_STAND, CAN_HEADING, GRAB.forward, GRAB.right);

/** A point `forward` ahead and `right` to Capy's right from p at heading h (right is −x when facing +z). */
export function offsetFrom(p: Point, h: number, forward: number, right: number): Point {
  const s = Math.sin(h), c = Math.cos(h);
  return { x: p.x + forward * s - right * c, z: p.z + forward * c + right * s };
}

/**
 * Points of interest (doc §4.2 and capy-nav-data.json). Stand points are visible from the default camera and stay valid
 * from `unlock` on. `water` stand points put the Water clip's pour (POUR) on the target; they were solved offline
 * against this geometry (see capyNav.test.ts, which checks the landing spot and reachability for every piece count).
 */
export const POIS: Record<WorldIndex, Poi[]> = {
  0: [
    { id: 'rest', tags: ['rest'], at: SPAWN, face: CAMERA_YAW, unlock: 0 },
    { id: 'doorstep', tags: ['doorstep'], at: { x: 0, z: 2.15 }, face: CAMERA_YAW, unlock: 2 },
    {
      id: 'bush17', tags: ['flower'], at: { x: -1.63, z: 1.82 }, face: 1.571, target: { x: -.845, z: 1.75, y: flowerTop(.58, .65) }, unlock: 17,
      water: { at: { x: -1.72, z: 1.70 }, face: 2.14 },
    },
    {
      id: 'garden18', tags: ['flower'], at: { x: .67, z: 2.02 }, face: 1.809, target: { x: 1.6, z: 1.8, y: flowerTop(.21, .8) }, unlock: 18,
      water: { at: { x: .70, z: 1.96 }, face: 1.95 },
    },
    { id: 'mailbox', tags: ['mailbox'], at: { x: .87, z: 2.47 }, face: 1.832, target: { x: 1.8, z: 2.13, y: 1.115 }, unlock: 19 },
    { id: 'sign', tags: ['sign'], at: { x: -1.93, z: 1.57 }, face: -.157, target: { x: -2.35, z: 2.1, y: 1.04 }, unlock: 21 },
    { id: 'pond', tags: ['pond'], at: { x: 1.95, z: 2.10 }, face: 2.639, target: { x: 2.5, z: 1.1, y: .2275 }, unlock: 0, until: 17 },
  ],
  1: [
    { id: 'rest', tags: ['rest'], at: SPAWN, face: CAMERA_YAW, unlock: 0 },
    {
      id: 'tree', tags: ['tree'], at: { x: -.03, z: -.83 }, face: .03, target: { x: 0, z: 0, y: .3 }, unlock: 1,
      water: { at: { x: .14, z: -.88 }, face: .87 },
    },
    { id: 'books', tags: ['books'], at: { x: -1.13, z: .07 }, face: 0, target: { x: -1.13, z: .8, y: 1.09 }, unlock: 15 },
    { id: 'table', tags: ['table'], at: { x: 1.42, z: .12 }, face: -.023, target: { x: 1.4, z: 1.2, y: .815 }, unlock: 16 },
    { id: 'bench', tags: ['bench'], at: { x: .47, z: 2.52 }, face: 2.003, target: { x: 1.45, z: 2, y: .425 }, unlock: 17 },
    ...[18, 19, 20, 21].map((k, n): Poi => {
      const a = (k - 1) * 2, fx = Math.sin(a) * 2, fz = Math.cos(a) * 2;
      const at = [{ x: .42, z: -1.98 }, { x: -1.53, z: -.68 }, { x: -.03, z: 1.62 }, { x: .82, z: -1.13 }][n];
      const face = [1.157, -.831, 1.139, 1.875][n];
      const water = [{ x: .58, z: -2.23, face: 1.36 }, { x: -1.41, z: -.64, face: -.35 }, { x: .13, z: 1.36, face: 1.33 }, { x: .78, z: -1.10, face: 2.52 }][n];
      return { id: `flower${k}`, tags: ['bigFlower'], at, face, target: { x: fx, z: fz, y: flowerTop(.2, 1.3) }, unlock: k, water: { at: { x: water.x, z: water.z }, face: water.face } };
    }),
    { id: 'pond', tags: ['pond'], at: CAN_STAND, face: CAN_HEADING, target: { x: 2.5, z: 1.1, y: .2275 }, unlock: 0 },
  ],
};

/** The middle of each piece (index k − 1), for "admire the newest piece" and pieceLanded(). */
export const PIECE_CENTRES: Record<WorldIndex, Vec3[]> = {
  0: [
    [0, .26, 0], [0, .2, 1.9], [0, 1.31, 1.35], [-1.3, 1.31, 0], [1.3, 1.31, 0], [0, 1.31, -1.32], [0, .95, 1.5], [0, 2.55, 1.5],
    [1.5, 1.2, 0], [0, 2.6, 0], [-.74, 2.86, 0], [.74, 2.86, 0], [.68, 3.4, -.6], [-2.45, .5, 1], [2.45, .5, 1], [2.5, 1.3, -1.9],
    [-.845, .55, 1.7], [1.6, .4, 1.8], [1.8, .97, 2.13], [-1.9, 1.11, 1.7], [-2.35, .84, 2.1],
  ],
  1: [
    [0, .2, 0],
    ...[1, 2, 3, 4, 5].map((i): Vec3 => [Math.sin(i) * .08, .25 + i * .5, 0]),
    ...[6, 7, 8, 9, 10, 11, 12, 13].map((i): Vec3 => { const a = (i - 6) * 2.4; return [Math.sin(a) * .95, 2.8 + Math.cos(a * 2) * .45, Math.cos(a) * .8]; }),
    [-1.5, .6, .8], [1.4, .75, 1.2], [1.45, .35, 2],
    ...[17, 18, 19, 20].map((i): Vec3 => [Math.sin(i * 2) * 2, .45, Math.cos(i * 2) * 2]),
  ],
};

/** The magic tree's canopy balls (pieces 7–14): rain shelter. */
export const BLOSSOMS: readonly { x: number; z: number; r: number; piece: number }[] =
  [6, 7, 8, 9, 10, 11, 12, 13].map(i => { const a = (i - 6) * 2.4; return { x: Math.sin(a) * .95, z: Math.cos(a) * .8, r: .8, piece: i + 1 }; });
export const BLOSSOM_PIECE = 7;
