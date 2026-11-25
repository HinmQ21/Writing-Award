import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CAPY_MOODS, type CapyMood } from './capyMood';
import { createCapy, heroHeadCenters, type CapyActor } from './capyModel';

let gltf: GLTF;
beforeAll(async () => {
  const file = await readFile(new URL('../public/models/capy.glb', import.meta.url));
  // Node has no image decoding; the tests only need bones and clips.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => ({ name: 'no_images', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  await MeshoptDecoder.ready;
  gltf = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, '');
});

const STEP = 1 / 30;
const bone = (actor: CapyActor, name: string) => actor.root.getObjectByName(name)!;
function headAt(actor: CapyActor) { actor.root.updateWorldMatrix(true, true); return bone(actor, 'head').getWorldPosition(new THREE.Vector3()); }
/** The HERO still of a mood, to compare a resting pose against. */
function hero(mood: CapyMood) { return createCapy(gltf, { mood, still: true }); }
/** Updates at 30 fps until the actor rests; returns the seconds it took. */
function runToRest(actor: CapyActor, limit = 10) {
  let time = 0;
  while (actor.isMoving() && time < limit) { actor.update(STEP); time += STEP; }
  return time;
}

describe('Capy model', () => {
  it('drops world props such as the static watering can from every clone', () => {
    const can = gltf.scene.getObjectByName('WateringCan');
    expect(can).toBeDefined();
    const actor = createCapy(gltf, { mood: 'Calm', still: true });
    expect(actor.root.getObjectByName('WateringCan')).toBeUndefined();
    expect(gltf.scene.getObjectByName('WateringCan')).toBe(can);
    actor.dispose();
  });

  it('enlarges floating symbols and pulls them toward the head only when asked', () => {
    const plain = createCapy(gltf, { mood: 'Sad', still: true }), logo = createCapy(gltf, { mood: 'Sad', still: true, fx: { scale: 1.25, pull: .15 } });
    for (const actor of [plain, logo]) actor.root.updateWorldMatrix(true, true);
    const center = (actor: CapyActor) => bone(actor, 'head').localToWorld(new THREE.Vector3(0, .32, .08));
    const shown = ['cloud', 'tearL', 'tearR'].filter(name => bone(plain, name).scale.x > .01);
    expect(shown.length).toBeGreaterThan(0);
    for (const name of shown) {
      const a = bone(plain, name), b = bone(logo, name);
      expect(b.scale.x / a.scale.x).toBeCloseTo(1.25, 5);
      const pa = a.getWorldPosition(new THREE.Vector3()).sub(center(plain)), pb = b.getWorldPosition(new THREE.Vector3()).sub(center(logo));
      expect(Math.hypot(pb.x, pb.z) / Math.hypot(pa.x, pa.z)).toBeCloseTo(.85, 3);
      expect(pb.y).toBeCloseTo(pa.y, 5);
    }
    // The body itself is untouched.
    expect(headAt(logo).distanceTo(headAt(plain))).toBeLessThan(1e-6);
  });

  it('keeps the symbols at the same size while a clip holds them still', () => {
    // The mixer skips bones whose animated value did not change, so an enlargement must not compound frame after frame.
    const plain = createCapy(gltf, { mood: 'Sad', still: false }), logo = createCapy(gltf, { mood: 'Sad', still: false, fx: { scale: 1.25, pull: .15 } });
    for (let frame = 0; frame < 150; frame++) {
      plain.update(STEP); logo.update(STEP);
      const a = bone(plain, 'cloud').scale.x, b = bone(logo, 'cloud').scale.x;
      if (a > .01) expect(b / a).toBeCloseTo(1.25, 5);
    }
  });

  it('bursts from the HERO frame and eases to a stop back on it', () => {
    const actor = createCapy(gltf, { mood: 'Calm', still: false });
    const expected = actor.burst('Happy');
    expect(expected).toBeCloseTo(3 + .3, 5);
    actor.update(STEP);
    expect(actor.isMoving()).toBe(true);
    const took = runToRest(actor) + STEP;
    expect(Math.abs(took - expected)).toBeLessThan(2 * STEP);
    expect(headAt(actor).distanceTo(headAt(hero('Happy')))).toBeLessThan(1e-4);
  });

  it('keeps every mood burst within five seconds, Celebrate included at two loops', () => {
    const actor = createCapy(gltf, { mood: 'Calm', still: false });
    for (const mood of CAPY_MOODS) expect(actor.burst(mood, mood === 'Celebrate' ? 2 : 1), mood).toBeLessThanOrEqual(5);
  });

  it('lets a poke play out, then settles on the resting mood', () => {
    const actor = createCapy(gltf, { mood: 'Calm', still: false });
    actor.burst('Sleepy'); runToRest(actor);
    actor.react('Surprised');
    const expected = actor.halt();
    expect(expected).toBeCloseTo(35 / 24 + .6, 2);
    const took = runToRest(actor);
    expect(Math.abs(took - expected)).toBeLessThan(2 * STEP);
    expect(headAt(actor).distanceTo(headAt(hero('Sleepy')))).toBeLessThan(1e-4);
  });

  it('halts a looping mood on its next HERO frame', () => {
    const actor = createCapy(gltf, { mood: 'Calm', still: false });
    actor.setMood('Sad');
    for (let i = 0; i < 60; i++) actor.update(STEP);
    expect(actor.isMoving()).toBe(true);
    const expected = actor.halt();
    expect(expected).toBeGreaterThan(0); expect(expected).toBeLessThanOrEqual(4 + .6);
    runToRest(actor);
    expect(headAt(actor).distanceTo(headAt(hero('Sad')))).toBeLessThan(1e-4);
  });

  it('never moves on the still path', () => {
    const actor = createCapy(gltf, { mood: 'Calm', still: true });
    expect(actor.burst('Proud')).toBe(0);
    expect(actor.isMoving()).toBe(false);
    expect(headAt(actor).distanceTo(headAt(hero('Proud')))).toBeLessThan(1e-6);
  });

  it('measures the head in every HERO pose, so the logo can follow it', () => {
    const heads = heroHeadCenters(gltf);
    expect(Object.keys(heads).sort()).toEqual([...CAPY_MOODS].sort());
    expect(heads.Calm.y).toBeGreaterThan(.6); expect(heads.Calm.y).toBeLessThan(1.4);
    expect(heads.Calm.distanceTo(headAt(hero('Calm')))).toBeLessThan(.5);
    expect(heads.Sleepy.y).toBeLessThan(heads.Calm.y); // a nodding head
  });
});
