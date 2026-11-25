/**
 * The world Capy's walkable map: per world and piece count, which points Capy's centre may stand on, how high the
 * ground is, what the default camera sees, the points of interest, and a grid A* with line-of-sight smoothing.
 * Pure TypeScript, no three.js. Design: docs/capy/logo-and-world-behavior.md §4; geometry in capyNavData.ts.
 *
 * Walkability is analytic: every hard shape that overlaps Capy's body band (0.15–1.0 above the ground under Capy)
 * must stay R_HARD (0.38) from Capy's centre, every one in the feet band (0.035–0.15) R_LOW (0.28); the pond rim 0.24;
 * decor flower stems 0.36. The grid (0.1 cells, 72 × 60) is these tests at cell centres.
 */
import type { NavMap, Point, Poi, WorldIndex } from './capyWorldTypes';
import {
  CAMERA_DIR, CAMERA_YAW, CAN_AT, CAN_HEADING, CAN_STAND, CAPY_HEIGHT, CROWN_PIECE, CROWN_SPOT, DECOR_TREES, CANOPY, DOOR, DOOR_PIECE,
  ENCLOSED_PIECE, GRASS_Y, INTERIOR, NAV, PIECE_CENTRES, POIS, POND_RIM, SNIFF_REACH, SPAWN, BLOSSOMS, BLOSSOM_PIECE, decorFlowers, flowerTop, worldPrims, worldSurfaces,
} from './capyNavData';
import type { Prim, Surface, Vec3 } from './capyNavData';

const N = NAV.nx * NAV.nz;
const SQ2 = Math.SQRT2;

// ================================================================================================ geometry helpers
/** Distance from (x, z) to the ellipse with semi-axes a, b centred at the origin; negative inside (Eberly's method). */
export function ellipseDistance(x: number, z: number, a: number, b: number): number {
  let y0 = Math.abs(x), y1 = Math.abs(z), e0 = a, e1 = b;
  if (e0 < e1) { [e0, e1] = [e1, e0]; [y0, y1] = [y1, y0]; }
  const inside = (y0 / e0) ** 2 + (y1 / e1) ** 2 < 1;
  let d: number;
  if (y1 > 0) {
    if (y0 > 0) {
      const z0 = y0 / e0, z1 = y1 / e1, g = z0 * z0 + z1 * z1 - 1;
      if (g === 0) return 0;
      const r0 = (e0 / e1) ** 2, n0 = r0 * z0;
      let s0 = z1 - 1, s1 = g < 0 ? 0 : Math.hypot(n0, z1) - 1, s = 0;
      for (let i = 0; i < 60; i++) {
        s = (s0 + s1) / 2;
        if (s === s0 || s === s1 || s1 - s0 < 1e-9) break;
        const g1 = (n0 / (s + r0)) ** 2 + (z1 / (s + 1)) ** 2 - 1;
        if (g1 > 0) s0 = s; else if (g1 < 0) s1 = s; else break;
      }
      const x0 = r0 * y0 / (s + r0), x1 = y1 / (s + 1);
      d = Math.hypot(x0 - y0, x1 - y1);
    } else d = Math.abs(y1 - e1);
  } else {
    const numer0 = e0 * y0, denom0 = e0 * e0 - e1 * e1;
    if (numer0 < denom0) { const q = numer0 / denom0, x0 = e0 * q, x1 = e1 * Math.sqrt(1 - q * q); d = Math.hypot(x0 - y0, x1); }
    else d = Math.abs(y0 - e0);
  }
  return inside ? -d : d;
}

function segDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
}

/** three.js heading (rotation.y) that turns Capy at `from` toward `to`. */
export const facing = (from: Point, to: Point) => Math.atan2(to.x - from.x, to.z - from.z);
/** Wraps an angle to (−π, π]. */
export function wrapAngle(a: number) { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; }
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

// ================================================================================================ footprints
/** A shape's footprint record, bucketed in plan. */
type RecClass = 'hard' | 'soft' | 'low';
type Rec =
  | { k: 'rect'; cls: RecClass; y0: number; y1: number; cx: number; cz: number; hx: number; hz: number }
  | { k: 'ell'; cls: RecClass; y0: number; y1: number; cx: number; cy: number; cz: number; ax: number; ay: number; az: number }
  | { k: 'cyl'; cls: RecClass; y0: number; y1: number; a: Vec3; b: Vec3; r: number; e: number }
  | { k: 'stem'; x: number; z: number }
  | { k: 'rim' };

/** Distance in plan from (px, pz) to the part of a shape inside the height band [lo, hi]; Infinity if it misses the band. */
function footDistance(r: Rec, px: number, pz: number, lo: number, hi: number): number {
  if (r.k === 'stem') return Math.hypot(px - r.x, pz - r.z);
  if (r.k === 'rim') return ellipseDistance(px - POND_RIM.cx, pz - POND_RIM.cz, POND_RIM.ax, POND_RIM.az);
  if (Math.min(r.y1, hi) - Math.max(r.y0, lo) <= NAV.bandEps) return Infinity;
  if (r.k === 'rect') return Math.hypot(Math.max(Math.abs(px - r.cx) - r.hx, 0), Math.max(Math.abs(pz - r.cz) - r.hz, 0));
  if (r.k === 'ell') {
    const y = Math.max(lo, Math.min(hi, r.cy)), q = (y - r.cy) / r.ay;
    if (Math.abs(q) >= 1) return Infinity;
    const s = Math.sqrt(1 - q * q);
    return ellipseDistance(px - r.cx, pz - r.cz, r.ax * s, r.az * s);
  }
  const { a, b } = r, dy = b[1] - a[1];
  if (r.e < 1e-9) return Math.hypot(px - a[0], pz - a[2]) - r.r; // vertical: a disc in plan
  if (Math.abs(dy) < 1e-9) {
    // horizontal (door arch, window discs): a rectangle as long as the cylinder, as wide as its chord at the band
    const cy = a[1], y = Math.max(lo, Math.min(hi, cy)), hw = Math.sqrt(Math.max(0, r.r * r.r - (y - cy) ** 2));
    const lx = b[0] - a[0], lz = b[2] - a[2], L = Math.hypot(lx, lz), ux = lx / L, uz = lz / L;
    const qx = px - (a[0] + b[0]) / 2, qz = pz - (a[2] + b[2]) / 2, along = qx * ux + qz * uz, across = -qx * uz + qz * ux;
    return Math.hypot(Math.max(Math.abs(along) - L / 2, 0), Math.max(Math.abs(across) - hw, 0));
  }
  // tilted (tree branches): the stretch of axis whose cross-section reaches into the band, as a plan capsule
  const u = (lo - r.e - a[1]) / dy, v = (hi + r.e - a[1]) / dy, s0 = Math.max(0, Math.min(u, v)), s1 = Math.min(1, Math.max(u, v));
  if (s0 > s1) return Infinity;
  const ax = a[0] + (b[0] - a[0]) * s0, az = a[2] + (b[2] - a[2]) * s0, bx = a[0] + (b[0] - a[0]) * s1, bz = a[2] + (b[2] - a[2]) * s1;
  return segDistance(px, pz, ax, az, bx, bz) - r.r;
}

function recOf(p: Prim): Rec | null {
  if (p.cls === 'ground' || p.kind === 'gable') return null;
  // The foundation slab is low: it only keeps Capy's feet away (R_LOW), like the design's analysis.
  const cls: RecClass = p.cls === 'soft' ? 'soft' : p.cls === 'foundation' ? 'low' : 'hard';
  if (p.kind === 'box') {
    if (p.rz) return null; // the roof halves: far above Capy
    return { k: 'rect', cls, y0: p.c[1] - p.h[1], y1: p.c[1] + p.h[1], cx: p.c[0], cz: p.c[2], hx: p.h[0], hz: p.h[2] };
  }
  if (p.kind === 'ell') return { k: 'ell', cls, y0: p.c[1] - p.r[1], y1: p.c[1] + p.r[1], cx: p.c[0], cy: p.c[1], cz: p.c[2], ax: p.r[0], ay: p.r[1], az: p.r[2] };
  const { a, b, r } = p, len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), uy = len > 0 ? (b[1] - a[1]) / len : 1;
  const e = r * Math.sqrt(Math.max(0, 1 - uy * uy));
  return { k: 'cyl', cls, y0: Math.min(a[1], b[1]) - e, y1: Math.max(a[1], b[1]) + e, a, b, r, e };
}

function recBounds(r: Rec): [number, number, number, number] {
  switch (r.k) {
    case 'rect': return [r.cx - r.hx, r.cx + r.hx, r.cz - r.hz, r.cz + r.hz];
    case 'ell': return [r.cx - r.ax, r.cx + r.ax, r.cz - r.az, r.cz + r.az];
    case 'cyl': return [Math.min(r.a[0], r.b[0]) - r.r, Math.max(r.a[0], r.b[0]) + r.r, Math.min(r.a[2], r.b[2]) - r.r, Math.max(r.a[2], r.b[2]) + r.r];
    case 'stem': return [r.x, r.x, r.z, r.z];
    case 'rim': return [POND_RIM.cx - POND_RIM.ax, POND_RIM.cx + POND_RIM.ax, POND_RIM.cz - POND_RIM.az, POND_RIM.cz + POND_RIM.az];
  }
}

const BUCKET = .5, BX0 = -3.75, BZ0 = -3.25, BNX = 15, BNZ = 13;

// ================================================================================================ occluders (visibility)
type Occ = { p: Prim; cx: number; cy: number; cz: number; r: number };

function occOf(p: Prim): Occ {
  if (p.kind === 'box') return { p, cx: p.c[0], cy: p.c[1], cz: p.c[2], r: Math.hypot(...p.h) };
  if (p.kind === 'ell') return { p, cx: p.c[0], cy: p.c[1], cz: p.c[2], r: Math.max(...p.r) };
  if (p.kind === 'cyl') {
    const l = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1], p.b[2] - p.a[2]);
    return { p, cx: (p.a[0] + p.b[0]) / 2, cy: (p.a[1] + p.b[1]) / 2, cz: (p.a[2] + p.b[2]) / 2, r: Math.hypot(l / 2, p.r) };
  }
  return { p, cx: 0, cy: 2.75, cz: 0, r: 1.96 };
}

const T_MIN = .03, T_MAX = 12;
const GABLE: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 1, 1.36], [0, 0, -1, 1.36], [0, -1, 0, -2.28], [.94, 1.31, 0, .94 * 1.31 + 1.31 * 2.28], [-.94, 1.31, 0, .94 * 1.31 + 1.31 * 2.28],
];

/** Does the ray o + t·d (t in [T_MIN, T_MAX]) hit the shape? */
function rayHits(p: Prim, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
  if (p.kind === 'box') {
    let x = ox - p.c[0], y = oy - p.c[1], z = oz - p.c[2], ux = dx, uy = dy;
    if (p.rz) {
      const c = Math.cos(p.rz), s = Math.sin(p.rz);
      [x, y] = [x * c + y * s, -x * s + y * c]; [ux, uy] = [dx * c + dy * s, -dx * s + dy * c];
    }
    let t0 = T_MIN, t1 = T_MAX;
    const slab = (o: number, u: number, h: number) => {
      if (Math.abs(u) < 1e-12) return Math.abs(o) <= h;
      let a = (-h - o) / u, b = (h - o) / u; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); return t0 <= t1;
    };
    return slab(x, ux, p.h[0]) && slab(y, uy, p.h[1]) && slab(z, dz, p.h[2]);
  }
  if (p.kind === 'ell') {
    const x = (ox - p.c[0]) / p.r[0], y = (oy - p.c[1]) / p.r[1], z = (oz - p.c[2]) / p.r[2];
    const ux = dx / p.r[0], uy = dy / p.r[1], uz = dz / p.r[2];
    const A = ux * ux + uy * uy + uz * uz, B = 2 * (x * ux + y * uy + z * uz), C = x * x + y * y + z * z - 1, D = B * B - 4 * A * C;
    if (D < 0) return false;
    const q = Math.sqrt(D), t0 = (-B - q) / (2 * A), t1 = (-B + q) / (2 * A);
    return t1 >= T_MIN && t0 <= T_MAX;
  }
  if (p.kind === 'cyl') {
    const { a, b, r } = p, L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ax = (b[0] - a[0]) / L, ay = (b[1] - a[1]) / L, az = (b[2] - a[2]) / L;
    const wx = ox - a[0], wy = oy - a[1], wz = oz - a[2];
    const wu = wx * ax + wy * ay + wz * az, du = dx * ax + dy * ay + dz * az;
    const px = wx - wu * ax, py = wy - wu * ay, pz = wz - wu * az, qx = dx - du * ax, qy = dy - du * ay, qz = dz - du * az;
    const A = qx * qx + qy * qy + qz * qz, B = 2 * (px * qx + py * qy + pz * qz), C = px * px + py * py + pz * pz - r * r;
    let t0 = T_MIN, t1 = T_MAX;
    if (A < 1e-12) { if (C > 0) return false; }
    else {
      const D = B * B - 4 * A * C; if (D < 0) return false;
      const q = Math.sqrt(D); t0 = Math.max(t0, (-B - q) / (2 * A)); t1 = Math.min(t1, (-B + q) / (2 * A));
    }
    if (Math.abs(du) < 1e-12) { if (wu < 0 || wu > L) return false; }
    else { let s0 = -wu / du, s1 = (L - wu) / du; if (s0 > s1) [s0, s1] = [s1, s0]; t0 = Math.max(t0, s0); t1 = Math.min(t1, s1); }
    return t0 <= t1;
  }
  let t0 = T_MIN, t1 = T_MAX;
  for (const [nx, ny, nz, d] of GABLE) {
    const nd = nx * dx + ny * dy + nz * dz, no = nx * ox + ny * oy + nz * oz;
    if (Math.abs(nd) < 1e-12) { if (no > d) return false; continue; }
    const t = (d - no) / nd;
    if (nd < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

const HP = (() => { const x = CAMERA_DIR[2], z = -CAMERA_DIR[0], n = Math.hypot(x, z); return [x / n, z / n] as const; })();
/** The 9 points on Capy tested against the camera (lateral offset along the screen's horizontal, height fraction). */
const SAMPLES: readonly (readonly [number, number])[] = [[0, .12], [0, .32], [0, .52], [0, .72], [0, .9], [-.22, .35], [.22, .35], [-.22, .7], [.22, .7]];

// ================================================================================================ the map
type Impl = NavMap & {
  free: Uint8Array;
  reach: Uint8Array;
  gCell: Float32Array;
  cost: Float32Array;
  vis: Float32Array;
  nbr: Uint8Array;
  buckets: Rec[][];
  surfaces: Surface[];
  occ: Occ[];
  shelter?: { at: Point; face: number } | null;
};
const impls = new WeakMap<NavMap, Impl>();
function impl(nav: NavMap): Impl {
  const m = impls.get(nav);
  if (!m) throw new Error('capyNav: this NavMap was not made by navFor()');
  return m;
}

export const cellX = (i: number) => NAV.x0 + i * NAV.cell;
export const cellZ = (k: number) => NAV.z0 + k * NAV.cell;
export function cellIndex(p: Point): number {
  const i = Math.round((p.x - NAV.x0) / NAV.cell), k = Math.round((p.z - NAV.z0) / NAV.cell);
  return i < 0 || k < 0 || i >= NAV.nx || k >= NAV.nz ? -1 : k * NAV.nx + i;
}
const cellPoint = (c: number): Point => ({ x: cellX(c % NAV.nx), z: cellZ(Math.floor(c / NAV.nx)) });
const insideBound = (x: number, z: number) => (x / NAV.ringA) ** 2 + (z / NAV.ringB) ** 2 <= 1 && Math.abs(x) <= NAV.boundX && Math.abs(z) <= NAV.boundZ;

function surfaceAt(m: Impl, x: number, z: number): Surface | null {
  let best: Surface | null = null;
  for (const s of m.surfaces) {
    let inside: boolean;
    if (s.rect) inside = x >= s.rect[0] && x <= s.rect[1] && z >= s.rect[2] && z <= s.rect[3];
    else { const e = s.ell!; inside = ((x - e[0]) / e[2]) ** 2 + ((z - e[1]) / e[3]) ** 2 <= 1; }
    if (inside && (!best || s.top > best.top)) best = s;
  }
  return best;
}
const groundAt = (m: Impl, x: number, z: number) => surfaceAt(m, x, z)?.top ?? GRASS_Y;

function bucketOf(m: Impl, x: number, z: number): Rec[] {
  const i = Math.floor((x - BX0) / BUCKET), k = Math.floor((z - BZ0) / BUCKET);
  return i < 0 || k < 0 || i >= BNX || k >= BNZ ? [] : m.buckets[k * BNX + i];
}

/** Free distance budget at p: the smallest (clearance − required clearance) over every obstacle class. ≥ 0 is walkable. */
function budgetAt(m: Impl, x: number, z: number): number {
  if (!insideBound(x, z)) return -1;
  const s = surfaceAt(m, x, z);
  if (!s || !s.walk) return -1;
  const g = s.top, bLo = g + NAV.bodyBand[0], bHi = g + NAV.bodyBand[1], fLo = g + NAV.feetBand[0], fHi = g + NAV.feetBand[1];
  let b = Infinity;
  for (const r of bucketOf(m, x, z)) {
    if (r.k === 'stem') b = Math.min(b, footDistance(r, x, z, 0, 0) - NAV.rStem);
    else if (r.k === 'rim') b = Math.min(b, footDistance(r, x, z, 0, 0) - NAV.rWater);
    else if (r.cls === 'hard') {
      b = Math.min(b, footDistance(r, x, z, bLo, bHi) - NAV.rHard, footDistance(r, x, z, fLo, fHi) - NAV.rLow);
    } else if (r.cls === 'low') b = Math.min(b, footDistance(r, x, z, fLo, fHi) - NAV.rLow);
  }
  return b;
}

function softDistanceAt(m: Impl, x: number, z: number): number {
  const g = groundAt(m, x, z), lo = g + NAV.feetBand[0], hi = g + NAV.bodyBand[1];
  let d = Infinity;
  for (const r of bucketOf(m, x, z)) if (r.k !== 'stem' && r.k !== 'rim' && r.cls === 'soft') d = Math.min(d, footDistance(r, x, z, lo, hi));
  return d;
}

function visibilityAt(m: Impl, x: number, z: number): number {
  const g = groundAt(m, x, z), [dx, dy, dz] = CAMERA_DIR;
  let seen = 0;
  for (const [lat, f] of SAMPLES) {
    const ox = x + HP[0] * lat, oy = g + f * CAPY_HEIGHT, oz = z + HP[1] * lat;
    let hit = false;
    for (const o of m.occ) {
      const cx = o.cx - ox, cy = o.cy - oy, cz = o.cz - oz, tc = cx * dx + cy * dy + cz * dz;
      if (tc + o.r < T_MIN || tc - o.r > T_MAX) continue;
      if (cx * cx + cy * cy + cz * cz - tc * tc > o.r * o.r) continue;
      if (rayHits(o.p, ox, oy, oz, dx, dy, dz)) { hit = true; break; }
    }
    if (!hit) seen++;
  }
  return seen / SAMPLES.length;
}

function cellVisibility(m: Impl, c: number): number {
  if (m.vis[c] < 0) { const p = cellPoint(c); m.vis[c] = visibilityAt(m, p.x, p.z); }
  return m.vis[c];
}

const DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function build(world: WorldIndex, pieces: number): Impl {
  const prims = worldPrims(world).filter(p => p.piece <= pieces);
  const recs: Rec[] = [];
  for (const p of prims) { const r = recOf(p); if (r) recs.push(r); }
  for (const f of decorFlowers()) recs.push({ k: 'stem', x: f.x, z: f.z });
  recs.push({ k: 'rim' });
  const buckets: Rec[][] = Array.from({ length: BNX * BNZ }, () => []);
  for (const r of recs) {
    const [x0, x1, z0, z1] = recBounds(r), pad = .45;
    for (let k = Math.max(0, Math.floor((z0 - pad - BZ0) / BUCKET)); k <= Math.min(BNZ - 1, Math.floor((z1 + pad - BZ0) / BUCKET)); k++)
      for (let i = Math.max(0, Math.floor((x0 - pad - BX0) / BUCKET)); i <= Math.min(BNX - 1, Math.floor((x1 + pad - BX0) / BUCKET)); i++) buckets[k * BNX + i].push(r);
  }
  const m = {
    world, pieces, cell: NAV.cell,
    free: new Uint8Array(N), reach: new Uint8Array(N), gCell: new Float32Array(N), cost: new Float32Array(N), vis: new Float32Array(N).fill(-1), nbr: new Uint8Array(N),
    buckets, surfaces: worldSurfaces(world).filter(s => s.piece <= pieces), occ: prims.map(occOf),
  } as unknown as Impl;

  for (let c = 0; c < N; c++) {
    const { x, z } = cellPoint(c);
    m.gCell[c] = groundAt(m, x, z);
    m.free[c] = budgetAt(m, x, z) >= 0 ? 1 : 0;
    m.cost[c] = 1 + NAV.softCost * Math.max(0, Math.min(1, (NAV.rSoft - softDistanceAt(m, x, z)) / NAV.rSoft));
  }
  for (let c = 0; c < N; c++) {
    if (!m.free[c]) continue;
    const i = c % NAV.nx, k = Math.floor(c / NAV.nx);
    let bits = 0;
    DIRS.forEach(([di, dk], d) => {
      const a = i + di, b = k + dk;
      if (a < 0 || b < 0 || a >= NAV.nx || b >= NAV.nz) return;
      const n = b * NAV.nx + a;
      if (!m.free[n] || Math.abs(m.gCell[n] - m.gCell[c]) > NAV.maxStep) return;
      if (di && dk && !(m.free[k * NAV.nx + a] && m.free[b * NAV.nx + i]) && budgetAt(m, (cellX(i) + cellX(a)) / 2, (cellZ(k) + cellZ(b)) / 2) < 0) return;
      bits |= 1 << d;
    });
    m.nbr[c] = bits;
  }
  // reachable from the spawn
  const seed = nearestCell(SPAWN, m.free);
  if (seed >= 0) {
    const stack = [seed]; m.reach[seed] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      forNeighbours(m, c, n => { if (!m.reach[n]) { m.reach[n] = 1; stack.push(n); } });
    }
  }

  m.walkable = p => budgetAt(m, p.x, p.z) >= 0;
  m.visible = p => visibilityAt(m, p.x, p.z) >= .5;
  m.ground = p => groundAt(m, p.x, p.z);
  m.spawn = SPAWN;
  m.spawnHeading = CAMERA_YAW;
  m.crownSpot = CROWN_SPOT;
  if (world === 0 && pieces >= DOOR_PIECE) {
    m.door = DOOR;
    m.interior = { min: INTERIOR.min, max: INTERIOR.max, floor: INTERIOR.floor, enclosed: pieces >= ENCLOSED_PIECE };
  }
  if (world === 1) m.can = { at: CAN_AT, stand: CAN_STAND, heading: CAN_HEADING };
  m.randomSpot = (rng, near, radius) => randomSpot(m, rng, near, radius);
  m.nearestWalkable = p => nearestWalkable(m, p);
  m.pois = makePois(m);
  return m;
}

function forNeighbours(m: Impl, c: number, f: (n: number, diagonal: boolean) => void) {
  const bits = m.nbr[c];
  if (!bits) return;
  const i = c % NAV.nx, k = Math.floor(c / NAV.nx);
  for (let d = 0; d < 8; d++) if (bits & (1 << d)) f((k + DIRS[d][1]) * NAV.nx + i + DIRS[d][0], d >= 4);
}

function nearestCell(p: Point, mask: Uint8Array): number {
  let best = -1, bd = Infinity;
  for (let c = 0; c < N; c++) {
    if (!mask[c]) continue;
    const q = cellPoint(c), d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** Is p a walkable point Capy can reach from the spawn (its cell, or one straight step from a reachable cell)? */
function reachablePoint(m: Impl, p: Point): boolean {
  if (budgetAt(m, p.x, p.z) < 0) return false;
  const c = cellIndex(p);
  if (c >= 0 && m.reach[c]) return true;
  const i = Math.round((p.x - NAV.x0) / NAV.cell), k = Math.round((p.z - NAV.z0) / NAV.cell);
  for (let b = k - 1; b <= k + 1; b++) for (let a = i - 1; a <= i + 1; a++) {
    if (a < 0 || b < 0 || a >= NAV.nx || b >= NAV.nz) continue;
    const n = b * NAV.nx + a;
    if (m.reach[n] && segmentOk(m, cellPoint(n), p)) return true;
  }
  return false;
}

function nearestWalkable(m: Impl, p: Point): Point | null {
  if (reachablePoint(m, p)) return { x: p.x, z: p.z };
  const c = nearestCell(p, m.reach);
  return c < 0 ? null : cellPoint(c);
}

function randomSpot(m: Impl, rng: () => number, near?: Point, radius?: number): Point | null {
  const pick = (minVis: number) => {
    const cells: number[] = [];
    for (let c = 0; c < N; c++) {
      if (!m.reach[c]) continue;
      if (near && radius !== undefined && dist(cellPoint(c), near) > radius) continue;
      if (cellVisibility(m, c) >= minVis) cells.push(c);
    }
    return cells.length ? cellPoint(cells[Math.min(cells.length - 1, Math.floor(rng() * cells.length))]) : null;
  };
  return pick(.85) ?? pick(.5);
}

/** Segment test: every sample walkable, and no rise over max_step between samples. Steps by the free budget where it is large. */
function segmentOk(m: Impl, p: Point, q: Point): boolean {
  const L = dist(p, q);
  if (L < 1e-9) return budgetAt(m, p.x, p.z) >= 0;
  const ux = (q.x - p.x) / L, uz = (q.z - p.z) / L;
  let t = 0, prevG = groundAt(m, p.x, p.z);
  for (;;) {
    const x = p.x + ux * t, z = p.z + uz * t, b = budgetAt(m, x, z);
    if (b < 0) return false;
    const g = groundAt(m, x, z);
    if (Math.abs(g - prevG) > NAV.maxStep) return false;
    prevG = g;
    if (t >= L) return true;
    let step = Math.max(.025, Math.min(.25, b * .9));
    // only stride over flat ground
    if (step > .025) {
      const t2 = Math.min(L, t + step);
      if (groundAt(m, p.x + ux * t2, p.z + uz * t2) !== g) step = .025;
    }
    t = Math.min(L, t + step);
  }
}

// ================================================================================================ POIs
function scoreFace(h: number) { return 1 - Math.abs(wrapAngle(h - CAMERA_YAW)) / Math.PI; }

function makePois(m: Impl): Poi[] {
  const k = m.pieces, out: Poi[] = [];
  for (const p of POIS[m.world]) if (p.unlock <= k && (p.until === undefined || k <= p.until)) out.push(p);
  // decor flowers to sniff: stand SNIFF_REACH from the stem, reachable and fully visible, facing the flower
  for (const f of decorFlowers()) {
    let best: Poi | null = null, bs = -Infinity;
    for (let a = 0; a < 24; a++) {
      const ang = a * Math.PI / 12, at = { x: f.x + Math.sin(ang) * SNIFF_REACH, z: f.z + Math.cos(ang) * SNIFF_REACH };
      if (!reachablePoint(m, at)) continue;
      const v = visibilityAt(m, at.x, at.z);
      if (v < .85) continue;
      const face = facing(at, f), s = scoreFace(face) + Math.min(budgetAt(m, at.x, at.z), .1) * 3;
      if (s > bs) { bs = s; best = { id: `flower#${f.i}`, tags: ['flower'], at, face, target: { x: f.x, z: f.z, y: flowerTop(.17, f.size) }, unlock: 0 }; }
    }
    if (best) out.push(best);
  }
  const admire = admirePoi(m, k);
  if (admire) out.push(admire);
  return out;
}

/** A stand point to admire piece `piece`: reachable, fully visible, about 1.1 away, face as much toward the camera as possible. */
function admirePoi(m: Impl, piece: number): Poi | null {
  if (piece < 1 || (m.world === 0 && piece === CROWN_PIECE)) return null;
  const [tx, ty, tz] = PIECE_CENTRES[m.world][piece - 1], target = { x: tx, z: tz, y: ty };
  const c = bestCell(m, at => {
    const d = dist(at, target);
    return d < .6 ? -Infinity : -Math.abs(d - 1.1) + .8 * scoreFace(facing(at, target)) + Math.min(budgetAt(m, at.x, at.z), .1) * 2;
  }, .85);
  if (c < 0) return null;
  const at = cellPoint(c);
  return { id: `piece${piece}`, tags: ['piece'], at, face: facing(at, target), target, unlock: piece };
}

/** The reachable cell with the best score whose visibility is at least minVis (or the best visible ≥ .5, or the best at all). */
function bestCell(m: Impl, score: (p: Point) => number, minVis: number): number {
  const cand: [number, number][] = [];
  for (let c = 0; c < N; c++) {
    if (!m.reach[c]) continue;
    const s = score(cellPoint(c));
    if (s > -Infinity) cand.push([s, c]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  for (const v of [minVis, .5]) for (const [, c] of cand) if (cellVisibility(m, c) >= v) return c;
  return cand.length ? cand[0][1] : -1;
}

// ================================================================================================ public API
const cache = new Map<number, NavMap>();
/** The walkable map for a world at a piece count (cached; obstacles only accumulate with pieces). */
export function navFor(world: WorldIndex, pieces: number): NavMap {
  const k = Math.max(0, Math.min(21, Math.floor(pieces))), key = world * 100 + k;
  let nav = cache.get(key);
  if (!nav) { const m = build(world, k); impls.set(m, m); nav = m; cache.set(key, m); }
  return nav;
}

/**
 * A walk from `from` to `to`: 0.1-grid A* (8 directions, no corner cutting, rise ≤ 0.10 per cell, a little extra cost
 * near ring tufts and decor petals), smoothed by line of sight to a few straight legs. Excludes `from`, includes `to`
 * (if `to` is not walkable the path ends at the nearest reachable cell). Null when there is no way.
 */
export function findPath(nav: NavMap, from: Point, to: Point): Point[] | null {
  const m = impl(nav);
  let s = cellIndex(from), t = cellIndex(to);
  if (s < 0 || !m.reach[s]) s = nearestCell(from, m.reach);
  if (t < 0 || !m.reach[t]) t = nearestCell(to, m.reach);
  if (s < 0 || t < 0) return null;
  const cells = astar(m, s, t);
  if (!cells) return null;
  const raw: Point[] = cells.map(cellPoint);
  const fromOk = budgetAt(m, from.x, from.z) >= 0, toOk = reachablePoint(m, to);
  if (fromOk) { if (dist(raw[0], from) < 1e-6) raw[0] = from; else raw.unshift(from); }
  if (toOk) { if (dist(raw[raw.length - 1], to) < 1e-6) raw[raw.length - 1] = to; else raw.push(to); }
  const out = smooth(m, raw);
  if (fromOk && out.length && out[0] === from) out.shift();
  if (!out.length) out.push(toOk ? { x: to.x, z: to.z } : raw[raw.length - 1]);
  return out.map(p => ({ x: p.x, z: p.z }));
}

function astar(m: Impl, s: number, t: number): number[] | null {
  const g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const ti = t % NAV.nx, tk = Math.floor(t / NAV.nx);
  const h = (c: number) => { const dx = Math.abs(c % NAV.nx - ti), dz = Math.abs(Math.floor(c / NAV.nx) - tk); return (Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz)) * NAV.cell; };
  // binary heap of [f, cell]
  const hf: number[] = [], hc: number[] = [];
  const push = (f: number, c: number) => {
    let i = hf.length; hf.push(f); hc.push(c);
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hc[i] = hc[p]; i = p; }
    hf[i] = f; hc[i] = c;
  };
  const pop = () => {
    const c = hc[0], lf = hf.pop()!, lc = hc.pop()!;
    if (hf.length) {
      let i = 0;
      for (;;) {
        let j = 2 * i + 1; if (j >= hf.length) break;
        if (j + 1 < hf.length && hf[j + 1] < hf[j]) j++;
        if (hf[j] >= lf) break;
        hf[i] = hf[j]; hc[i] = hc[j]; i = j;
      }
      hf[i] = lf; hc[i] = lc;
    }
    return c;
  };
  g[s] = 0; push(h(s), s);
  while (hf.length) {
    const c = pop();
    if (c === t) break;
    if (closed[c]) continue;
    closed[c] = 1;
    forNeighbours(m, c, (n, diag) => {
      if (closed[n]) return;
      const ng = g[c] + (diag ? SQ2 : 1) * NAV.cell * .5 * (m.cost[n] + m.cost[c]);
      if (ng < g[n]) { g[n] = ng; came[n] = c; push(ng + h(n), n); }
    });
  }
  if (s !== t && came[t] < 0) return null;
  const path: number[] = [];
  for (let c = t; c >= 0; c = c === s ? -1 : came[c]) path.push(c);
  return path.reverse();
}

function smooth(m: Impl, path: Point[]): Point[] {
  if (path.length < 3) return path.slice();
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !segmentOk(m, path[i], path[j])) j--;
    out.push(path[j]); i = j;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ extras for the brain and tests
/** The free budget at p (≥ 0 walkable); a measure of how far p is from the nearest obstacle's clearance edge. */
export function clearance(nav: NavMap, p: Point): number { return budgetAt(impl(nav), p.x, p.z); }
/** Straight walk test between two points (same rules as the path smoother). */
export function segmentClear(nav: NavMap, a: Point, b: Point): boolean { return segmentOk(impl(nav), a, b); }
/** Fraction (0–1) of Capy's 9 test points the default camera sees at p. */
export function visibility(nav: NavMap, p: Point): number { return visibilityAt(impl(nav), p.x, p.z); }
/** Walkable and connected to the spawn. */
export function isReachable(nav: NavMap, p: Point): boolean { return reachablePoint(impl(nav), p); }

/** On the scripted door lane (x = 0, from just inside the door to the approach stone). */
export function inDoorLane(nav: NavMap, p: Point, tol = .02): boolean {
  const d = nav.door;
  return !!d && Math.abs(p.x - d.inside.x) <= .02 + tol && p.z >= d.inside.z - .2 - tol && p.z <= d.approach.z + tol;
}
/** Inside the cottage's walk area. */
export function inInterior(nav: NavMap, p: Point, tol = .02): boolean {
  const r = nav.interior;
  return !!r && p.x >= r.min.x - tol && p.x <= r.max.x + tol && p.z >= r.min.z - tol && p.z <= r.max.z + tol;
}

/**
 * Where to wait out the rain outdoors: World 2 under the magic tree's canopy (7+ pieces), otherwise under a decor tree,
 * else as close to one as Capy can get. Reachable, and visible if at all possible. Null if nothing is reachable.
 */
export function shelterSpot(nav: NavMap): { at: Point; face: number } | null {
  const m = impl(nav);
  if (m.shelter !== undefined) return m.shelter;
  const balls: { x: number; z: number; r: number }[] = [];
  if (m.world === 1 && m.pieces >= BLOSSOM_PIECE) for (const b of BLOSSOMS) { if (b.piece <= m.pieces) balls.push(b); }
  else for (const t of DECOR_TREES) for (const [a, , c, r] of CANOPY) balls.push({ x: t.x + a * t.s, z: t.z + c * t.s, r: r * t.s });
  const c = bestCell(m, at => {
    let under = Infinity, cover = 0;
    for (const b of balls) { const d = Math.hypot(at.x - b.x, at.z - b.z) - b.r * .85; under = Math.min(under, d); if (d <= 0) cover++; }
    // under the canopy (more balls overhead is better), on the camera's side of the trunk, clear of obstacles
    return -Math.max(0, under) * 2 + (under <= 0 ? 1 : 0) + .15 * Math.min(cover, 4) + .3 * (at.x * CAMERA_DIR[0] + at.z * CAMERA_DIR[2]) + Math.min(budgetAt(m, at.x, at.z), .1);
  }, .85);
  m.shelter = c < 0 ? null : { at: cellPoint(c), face: CAMERA_YAW };
  return m.shelter;
}

/** Grid masks and counts, for tests and debug plots. */
export function navGrid(nav: NavMap) {
  const m = impl(nav);
  const vis = new Float32Array(N);
  for (let c = 0; c < N; c++) vis[c] = m.reach[c] ? cellVisibility(m, c) : -1;
  let free = 0, reach = 0, hidden = 0, partial = 0, visible = 0;
  for (let c = 0; c < N; c++) {
    free += m.free[c]; reach += m.reach[c];
    if (m.reach[c]) { if (vis[c] < .5) hidden++; else if (vis[c] < .85) partial++; else visible++; }
  }
  return { nx: NAV.nx, nz: NAV.nz, x0: NAV.x0, z0: NAV.z0, cell: NAV.cell, free: m.free, reach: m.reach, ground: m.gCell, cost: m.cost, vis, counts: { free, reach, hidden, partial, visible } };
}
