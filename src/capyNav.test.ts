import { describe, expect, it } from 'vitest';
import { clearance, ellipseDistance, facing, findPath, inDoorLane, isReachable, navFor, navGrid, segmentClear, shelterSpot, visibility, wrapAngle } from './capyNav';
import { BLOSSOMS, CAMERA_YAW, CAN_AT, CROWN_SPOT, GRAB, POND_RIM, POUR, SNIFF_REACH, SPAWN, decorFlowers, offsetFrom } from './capyNavData';
import type { NavMap, Point, WorldIndex } from './capyWorldTypes';

/** mulberry32: a small seeded RNG so the tests are deterministic. */
function seeded(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const PIECES = Array.from({ length: 22 }, (_, k) => k);
const WORLDS: WorldIndex[] = [0, 1];
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** Points every 0.02 along a polyline. */
function samples(pts: Point[]): Point[] {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(dist(a, b) / .02));
    for (let j = 1; j <= n; j++) out.push({ x: a.x + (b.x - a.x) * j / n, z: a.z + (b.z - a.z) * j / n });
  }
  return out;
}

describe('Capy navigation maps', { timeout: 60_000 }, () => { // whole-map and 10-minute checks: allow a busy machine
  it('match the design analysis (docs/capy/design/capy-nav-data.json stats) within a few cells', () => {
    // [world, pieces, reachable, hidden, partial] in 0.1 × 0.1 cells
    const stats: [WorldIndex, number, number, number?, number?][] = [
      [0, 0, 1680, 1, 0], [0, 7, 353, 53, 5], [0, 13, 353, 53, 5], [0, 17, 240], [0, 21, 158, 45, 5],
      [1, 1, 1508, 1, 0], [1, 6, 1508, 103, 68], [1, 14, 1508, 156, 57], [1, 17, 1089], [1, 21, 901, 159, 95],
    ];
    for (const [w, k, reach, hidden, partial] of stats) {
      const c = navGrid(navFor(w, k)).counts;
      expect(Math.abs(c.reach - reach), `w${w} k${k} reachable ${c.reach} vs ${reach}`).toBeLessThanOrEqual(Math.max(6, reach * .015));
      if (hidden !== undefined) expect(Math.abs(c.hidden - hidden), `w${w} k${k} hidden ${c.hidden} vs ${hidden}`).toBeLessThanOrEqual(10);
      if (partial !== undefined) expect(Math.abs(c.partial - partial), `w${w} k${k} partial ${c.partial} vs ${partial}`).toBeLessThanOrEqual(10);
    }
  });

  it('are cached per piece count and clamp the count to 0–21', () => {
    expect(navFor(0, 7)).toBe(navFor(0, 7));
    expect(navFor(0, 7)).not.toBe(navFor(0, 8));
    expect(navFor(1, 30).pieces).toBe(21);
    expect(navFor(1, -2).pieces).toBe(0);
    expect(navFor(0, 5).world).toBe(0);
  });

  it('reach every point of interest, water stand, lane entry and the can from the spawn, fully visible, for 0–21 pieces', () => {
    for (const w of WORLDS) for (const k of PIECES) {
      const nav = navFor(w, k), stands: [string, Point][] = [];
      for (const p of nav.pois) { stands.push([p.id, p.at]); if (p.water) stands.push([`${p.id} water`, p.water.at]); }
      if (nav.door) stands.push(['door approach', nav.door.approach]);
      if (nav.can) stands.push(['can stand', nav.can.stand]);
      if (w === 0 && (k === 19 || k === 20)) stands.push(['crown spot', nav.crownSpot]); // while the crown drops
      for (const [id, at] of stands) {
        const label = `w${w} k${k} ${id}`;
        expect(isReachable(nav, at), label).toBe(true);
        expect(nav.walkable(at), label).toBe(true);
        expect(visibility(nav, at), label).toBeGreaterThanOrEqual(.85);
        const path = findPath(nav, nav.spawn, at);
        expect(path, label).not.toBeNull();
        expect(dist(path![path!.length - 1], at), label).toBeLessThan(1e-9);
      }
    }
  });

  it('only offer points of interest from their unlock piece on (and until a later piece cuts them off)', () => {
    for (const w of WORLDS) for (const k of PIECES) for (const p of navFor(w, k).pois) {
      expect(p.unlock, `${p.id} at ${k}`).toBeLessThanOrEqual(k);
      if (p.until !== undefined) expect(k).toBeLessThanOrEqual(p.until);
    }
    expect(navFor(0, 16).pois.find(p => p.id === 'bush17')).toBeUndefined();
    expect(navFor(0, 17).pois.find(p => p.id === 'bush17')).toBeDefined();
    expect(navFor(0, 18).pois.find(p => p.id === 'pond')).toBeUndefined(); // the garden and bush cut the pond off
    expect(navFor(1, 0).pois.find(p => p.id === 'tree')).toBeUndefined();
    expect(navFor(1, 15).pois.find(p => p.id === 'books')).toBeDefined();
    expect(navFor(0, 6).pois.some(p => p.id === 'piece6' && p.tags.includes('piece'))).toBe(true);
  });

  it('plan paths that never cross an obstacle, a step over 0.10 or the yard edge, and end on the goal', () => {
    let count = 0, ms = 0;
    for (const [w, k] of [[0, 0], [0, 2], [0, 7], [0, 13], [0, 17], [0, 21], [1, 1], [1, 6], [1, 14], [1, 21]] as [WorldIndex, number][]) {
      const nav = navFor(w, k), rng = seeded(w * 100 + k);
      for (let i = 0; i < 40; i++) {
        const a = nav.randomSpot(rng)!, b = nav.randomSpot(rng)!;
        const t0 = performance.now(), path = findPath(nav, a, b);
        ms += performance.now() - t0;
        expect(path, `w${w} k${k} ${JSON.stringify([a, b])}`).not.toBeNull();
        count++;
        expect(dist(path![path!.length - 1], b)).toBeLessThan(1e-9);
        if (dist(a, b) > .2) expect(dist(path![0], a)).toBeGreaterThan(1e-9); // excludes `from`
        let prevG = nav.ground(a);
        for (const p of samples([a, ...path!])) {
          const label = `w${w} k${k} (${p.x.toFixed(3)}, ${p.z.toFixed(3)})`;
          expect(clearance(nav, p), label).toBeGreaterThanOrEqual(-1e-9);
          const g = nav.ground(p);
          expect(Math.abs(g - prevG), label).toBeLessThanOrEqual(.1 + 1e-9);
          prevG = g;
          // independent of the clearance model: the pond, the cottage floor and the magic tree's mound
          expect(ellipseDistance(p.x - POND_RIM.cx, p.z - POND_RIM.cz, POND_RIM.ax, POND_RIM.az), label).toBeGreaterThanOrEqual(.24 - 2e-3);
          if (w === 0 && k >= 1) expect(Math.hypot(Math.max(0, Math.abs(p.x) - 1.4), Math.max(0, Math.abs(p.z) - 1.46)), label).toBeGreaterThanOrEqual(.28 - 2e-3);
          if (w === 1 && k >= 1) expect(Math.hypot(p.x, p.z), label).toBeGreaterThanOrEqual(.45 + .28 - 2e-3); // the mound is knee-high: feet clearance
        }
        for (let j = 1; j < path!.length; j++) expect(segmentClear(nav, path![j - 1], path![j])).toBe(true);
      }
    }
    // about 1–3 ms on a desktop; generous so a loaded CI machine does not flake
    expect(ms / count, 'ms per findPath').toBeLessThan(15);
  });

  it('snap a goal inside an obstacle to the nearest reachable spot', () => {
    const nav = navFor(1, 21), path = findPath(nav, nav.spawn, { x: 2.5, z: 1.1 })!; // the pond
    const end = path[path.length - 1];
    expect(nav.walkable(end)).toBe(true);
    expect(dist(end, { x: 2.5, z: 1.1 })).toBeLessThan(1.4);
    const near = nav.nearestWalkable({ x: 0, z: 0 })!; // inside the trunk
    expect(isReachable(nav, near)).toBe(true);
    expect(dist(near, { x: 0, z: 0 })).toBeLessThan(.95);
    expect(nav.nearestWalkable(nav.spawn)).toEqual(nav.spawn);
  });

  it('open the door lane from piece 7, with the interior hidden from piece 10', () => {
    for (const k of PIECES) {
      const nav = navFor(0, k);
      if (k < 7) { expect(nav.door).toBeUndefined(); expect(nav.interior).toBeUndefined(); continue; }
      const d = nav.door!;
      expect(nav.interior!.enclosed).toBe(k >= 10);
      expect(isReachable(nav, d.approach)).toBe(true);
      expect(d.heading).toBeCloseTo(Math.PI);
      // the lane climbs the steps to the sill and the floor in rises of at most 0.10
      let prev = nav.ground(d.approach);
      for (let z = d.approach.z; z >= d.inside.z; z -= .01) {
        const p = { x: 0, z };
        expect(inDoorLane(nav, p)).toBe(true);
        expect(Math.abs(nav.ground(p) - prev), `k${k} z ${z.toFixed(2)}`).toBeLessThanOrEqual(.1);
        prev = nav.ground(p);
      }
      expect(nav.ground(d.step)).toBeCloseTo(.275);
      expect(nav.ground(d.sill)).toBeCloseTo(.36);
      expect(nav.ground(d.inside)).toBeCloseTo(.36);
      expect(nav.walkable(d.inside)).toBe(false); // only the scripted lane goes in
    }
    expect(navFor(1, 21).door).toBeUndefined();
  });

  it('give ground heights for grass, stones, steps and the floor', () => {
    const w1 = navFor(0, 21), w1bare = navFor(0, 1);
    expect(w1.ground({ x: -2, z: 0 })).toBeCloseTo(.13);
    expect(w1.ground({ x: .05 + Math.sin(2.4) * .2, z: 1.65 + 3 * .36 })).toBeCloseTo(.20); // the outermost stepping stone
    expect(w1.ground({ x: .5, z: 2.2 })).toBeCloseTo(.18); // lower step
    expect(w1.ground({ x: .4, z: 1.6 })).toBeCloseTo(.275); // upper step
    expect(w1.ground({ x: 0, z: 0 })).toBeCloseTo(.36); // floor
    expect(w1bare.ground({ x: .5, z: 2.2 })).toBeCloseTo(.13); // no steps before piece 2
    expect(navFor(1, 21).ground({ x: .05, z: 1.65 })).toBeCloseTo(.20);
  });

  it('pick idle spots that are walkable, reachable and visible', () => {
    for (const w of WORLDS) for (const k of [0, 3, 7, 10, 14, 17, 21]) {
      const nav = navFor(w, k), rng = seeded(7 + k);
      for (let i = 0; i < 60; i++) {
        const p = nav.randomSpot(rng)!;
        expect(nav.walkable(p) && isReachable(nav, p) && nav.visible(p), `w${w} k${k}`).toBe(true);
        expect(visibility(nav, p)).toBeGreaterThanOrEqual(.85);
        const q = nav.randomSpot(rng, p, 1)!;
        expect(dist(p, q)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('put the Water clip pour on what is watered, and the PickUp hand on the can', () => {
    for (const w of WORLDS) for (const k of PIECES) for (const p of navFor(w, k).pois) {
      if (!p.water) continue;
      const l = offsetFrom(p.water.at, p.water.face, POUR.forward, POUR.right), label = `w${w} k${k} ${p.id}`;
      if (p.id === 'bush17') { expect(Math.abs(l.x + .845), label).toBeLessThanOrEqual(.2); expect(Math.abs(l.z - 1.72), label).toBeLessThanOrEqual(.12); }
      else if (p.id === 'garden18') expect(dist(l, { x: 1.6, z: 1.8 }), label).toBeLessThanOrEqual(.42);
      else if (p.id === 'tree') expect(Math.abs(Math.hypot(l.x, l.z) - .36), label).toBeLessThanOrEqual(.07);
      else expect(dist(l, p.target!), label).toBeLessThanOrEqual(.1);
    }
    const can = navFor(1, 5).can!;
    expect(can.at).toEqual(CAN_AT);
    expect(dist(offsetFrom(can.stand, can.heading, GRAB.forward, GRAB.right), can.at)).toBeLessThan(1e-3);
    // GRAB is the GLB's Capy-local (−0.3375, 0, 0.4459) at WORLD_SCALE: right is −x when Capy faces +z
    expect(offsetFrom({ x: 0, z: 0 }, 0, GRAB.forward, GRAB.right).x).toBeCloseTo(-.3375 * .85, 4);
    expect(navFor(0, 21).can).toBeUndefined(); // World 1 keeps its can inside the cottage
  });

  it('stand sniff spots SNIFF_REACH from their flower, facing it', () => {
    const flowers = decorFlowers();
    for (const w of WORLDS) for (const k of [0, 9, 21]) for (const p of navFor(w, k).pois.filter(q => q.id.startsWith('flower#'))) {
      const f = flowers.find(q => p.id === `flower#${q.i}`)!;
      expect(dist(p.at, f)).toBeCloseTo(SNIFF_REACH, 6);
      expect(Math.abs(wrapAngle(p.face - facing(p.at, f)))).toBeLessThan(1e-9);
    }
    expect(navFor(0, 0).pois.filter(q => q.tags.includes('flower')).length).toBeGreaterThan(3);
  });

  it('find rain shelter under a tree, under the magic tree canopy from piece 7', () => {
    for (const [w, k] of [[0, 0], [0, 8], [1, 3], [1, 7], [1, 14], [1, 21]] as [WorldIndex, number][]) {
      const nav = navFor(w, k), s = shelterSpot(nav)!;
      expect(isReachable(nav, s.at), `w${w} k${k}`).toBe(true);
      expect(nav.visible(s.at), `w${w} k${k}`).toBe(true);
      expect(s.face).toBeCloseTo(CAMERA_YAW);
      if (w === 1 && k >= 7) expect(BLOSSOMS.some(b => b.piece <= k && Math.hypot(s.at.x - b.x, s.at.z - b.z) <= b.r), `w${w} k${k}`).toBe(true);
    }
  });

  it('keep the spawn and crown spot reachable', () => {
    for (const w of WORLDS) for (const k of PIECES) {
      const nav: NavMap = navFor(w, k);
      expect(nav.spawn).toEqual(SPAWN);
      expect(isReachable(nav, nav.spawn)).toBe(true);
    }
    expect(navFor(0, 20).crownSpot).toEqual(CROWN_SPOT);
  });
});
