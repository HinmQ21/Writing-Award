import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CAMERA_YAW } from './capyNavData';
import { createWorldCapy, worldClips, type WorldFixtures } from './capyWorld';
import { WORLD_CLIP_SECONDS, type Sense, type WorldClip } from './capyWorldTypes';

let gltf: GLTF;
beforeAll(async () => {
  const file = await readFile(new URL('../public/models/capy.glb', import.meta.url));
  // Node has no image decoding; the tests only need bones and clips.
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(() => ({ name: 'no_images', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  await MeshoptDecoder.ready;
  gltf = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, '');
});

const WORLD_CLIPS = Object.keys(WORLD_CLIP_SECONDS) as WorldClip[];
const sense: Sense = { cameraYaw: CAMERA_YAW, rainy: false, hour: 12 };
const scaleAt = (clip: THREE.AnimationClip, bone: string, t: number) => {
  const track = clip.tracks.find(k => k.name === `${bone}.scale`)!;
  const interpolant = (track as THREE.KeyframeTrack & { createInterpolant(): THREE.Interpolant }).createInterpolant();
  return Array.from(interpolant.evaluate(t) as ArrayLike<number>);
};
const noFixtures = (): WorldFixtures => ({ windows: [], plants: [] });

describe('world Capy clips', () => {
  it('has every clip the brain asks for, and every remixed track drives a real bone', () => {
    const clips = worldClips(gltf);
    for (const name of WORLD_CLIPS) expect(clips.has(name), name).toBe(true);
    for (const [name, clip] of clips) {
      for (const track of clip.tracks) {
        const { nodeName } = THREE.PropertyBinding.parseTrackName(track.name);
        expect(gltf.scene.getObjectByName(nodeName!), `${name}: ${track.name}`).toBeDefined();
      }
      expect(new Set(clip.tracks.map(t => t.name)).size, `${name} has duplicate tracks`).toBe(clip.tracks.length);
    }
  });

  it('matches the clip lengths the brain plans with', () => {
    const clips = worldClips(gltf);
    for (const name of WORLD_CLIPS) expect(clips.get(name)!.duration, name).toBeCloseTo(WORLD_CLIP_SECONDS[name], 2);
  });

  it('mutes the streak symbols in Cheer and Bounce, and keeps the can in hand when waving with it', () => {
    const clips = worldClips(gltf), cheer = clips.get('Cheer')!, bounce = clips.get('Bounce')!, waveCan = clips.get('WaveCan')!;
    for (let t = 0; t <= cheer.duration; t += cheer.duration / 12) {
      for (const bone of ['spark1', 'spark3', 'spark5', 'eye_starL', 'eye_starR']) expect(Math.max(...scaleAt(cheer, bone, t)), `${bone} @${t}`).toBe(0);
    }
    for (let t = 0; t <= bounce.duration; t += bounce.duration / 12) {
      for (const bone of ['heart1', 'heart2', 'heart3']) expect(Math.max(...scaleAt(bounce, bone, t))).toBe(0);
    }
    expect(Math.min(...scaleAt(waveCan, 'can', waveCan.duration / 2))).toBeGreaterThan(.99);
    expect(Math.max(...scaleAt(clips.get('Wave')!, 'can', waveCan.duration / 2))).toBe(0);
    expect(Math.min(...scaleAt(clips.get('TurnStep+can')!, 'can', .3))).toBeGreaterThan(.99);
  });
});

describe('world Capy actor', () => {
  it('walks around World 2 for a while, places the static can, and answers taps', () => {
    const parent = new THREE.Group();
    const capy = createWorldCapy(gltf, { world: 1, pieces: 10, parent, fixtures: noFixtures(), mode: 'live', popIn: false, crownDrop: false, freshPiece: false, crowned: true, sense });
    const can = parent.children.find(c => c.name === 'WateringCan');
    expect(can).toBeDefined();
    expect(capy.root.getObjectByName('WateringCan')).toBeUndefined();
    const start = capy.root.position.clone();
    let moved = 0;
    for (let i = 0; i < 30 * 40; i++) { capy.update(1 / 30, sense); moved = Math.max(moved, capy.root.position.distanceTo(start)); }
    expect(moved).toBeGreaterThan(.3);
    expect(capy.tap()).toBe(capy.root.visible);
    capy.dispose();
    expect(parent.children.length).toBe(0);
  });

  it('holds a still signature pose in Collection cards', () => {
    const parent = new THREE.Group();
    const capy = createWorldCapy(gltf, { world: 0, pieces: 21, parent, fixtures: noFixtures(), mode: 'still', popIn: false, crownDrop: false, freshPiece: false, crowned: true, sense });
    const at = capy.root.position.clone();
    expect(capy.update(1, sense)).toBe(false);
    expect(capy.root.position.equals(at)).toBe(true);
    expect(capy.tap()).toBe(false);
    capy.dispose();
  });
});
