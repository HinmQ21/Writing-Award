/**
 * The world Capy: wires the pure brain (capyBehavior.ts) to a three.js Capy and to the scene's fixtures (the cottage
 * door and its dark gap, window glass, chimney, mailbox flag, the static watering can, plants that bounce when watered).
 * Design: docs/capy/logo-and-world-behavior.md, sections 5–7.
 *
 * The brain decides everything; this file only copies its Pose into the scene every frame. Emotions live in the logo
 * (CapyLogo.tsx), so this Capy never changes mood.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createBrain, signaturePose, type Brain } from './capyBehavior';
import { CAN_HEADING } from './capyNavData';
import { WORLD_SCALE, type CapyMemory, type Point, type Pose, type Sense, type WorldIndex } from './capyWorldTypes';

/** Where each world's Capy was when its scene was last torn down (a new piece, rain, leaving the page). */
const memories = new Map<WorldIndex, CapyMemory>();
/** Null until this session has shown that world's Capy once (the first visit starts with the good-morning exit). */
export function capyMemory(world: WorldIndex): CapyMemory | null { return memories.get(world) ?? null; }

export type WorldFixtures = {
  /** World 1, 7+ pieces: the door leaf's hinge group (rotation.y opens it inward) and the dark arch behind it. */
  door?: { hinge: THREE.Object3D; portal: THREE.Object3D };
  /** Cloned glass materials that glow while Capy is home. */
  windows: THREE.MeshStandardMaterial[];
  /** Top of the chimney, in the Capy's parent space (World 1, 13+ pieces). */
  chimney?: THREE.Vector3;
  /** World 1, 19+ pieces: turns from 0 (down) to `up` radians about x when Capy has checked the mail. */
  mailFlag?: { object: THREE.Object3D; up: number };
  /**
   * Things that do a little bounce when the water lands within `radius` (default .45) of `at`: the tree's blossoms,
   * big flowers, the flower bush, the garden. Each object squashes about its own origin by `amp` (default .06).
   */
  plants: { at: Point; objects: THREE.Object3D[]; amp?: number; radius?: number }[];
};

export type WorldCapyOptions = {
  world: WorldIndex;
  pieces: number;
  /** The group Capy lives in (the scene's root space: the brain's coordinates). */
  parent: THREE.Object3D;
  fixtures: WorldFixtures;
  /** live: walks around. reduced: reduced motion, a still signature pose with a wave on tap. still: Collection cards. */
  mode: 'live' | 'reduced' | 'still';
  /** Pop in with a small overshoot (the model arrived after the scene was already on screen). */
  popIn: boolean;
  /** Piece 20 (the crown) is dropping in right now. */
  crownDrop: boolean;
  /** The newest piece is new (its drop is being shown). */
  freshPiece: boolean;
  crowned: boolean;
  /** What the brain sees on its first frame (rain matters before it plans anything). */
  sense: Sense;
};

export type WorldCapy = {
  root: THREE.Group;
  /** Advances the brain and applies its pose. Returns true while this Capy needs more frames (reduced/still modes). */
  update(dt: number, sense: Sense): boolean;
  /** A tap on Capy. False when Capy is hidden inside the cottage. */
  tap(): boolean;
  /** A tap on the cottage. True if Capy was inside and comes out. */
  knock(): boolean;
  pieceLanded(): void;
  setCrowned(on: boolean): void;
  /** World position just above Capy's head, for the floating hearts. */
  headTop(target: THREE.Vector3): THREE.Vector3;
  /** What Capy is doing, e.g. "water WalkCan shown door 0.00", for tests and debugging. */
  describe(): string;
  dispose(): void;
};

const POP_SECONDS = .45, DOOR_OPEN = 92 * Math.PI / 180, GLOW = new THREE.Color('#ffb347'), LIT_GLASS = new THREE.Color('#f9b65c');
/** Clips that animate the hand-held can themselves; every other clip gets a carrying arm when Capy holds the can. */
const CAN_CLIPS = new Set<string>(['WalkCan', 'Water', 'PickUp', 'PutDown', 'WaveCan']);

// ------------------------------------------------------------------------------------------------ clips

type Track = THREE.KeyframeTrack;
type TrackCtor = new (name: string, times: ArrayLike<number>, values: ArrayLike<number>, interpolation?: THREE.InterpolationModes) => Track;
const trackOf = (clip: THREE.AnimationClip, name: string) => clip.tracks.find(t => t.name === name);
/** Samples a track at any time (createInterpolant is set by setInterpolation, so it is missing from the typings). */
function sampler(track: Track): (t: number) => number[] {
  const interpolant = (track as Track & { createInterpolant(): THREE.Interpolant }).createInterpolant();
  return t => Array.from(interpolant.evaluate(t) as ArrayLike<number>);
}
/** A track that holds `source`'s value at time `t` for the whole of `duration`. */
function held(source: Track, t: number, duration: number, name = source.name): Track {
  const value = sampler(source)(t);
  const Ctor = source.constructor as TrackCtor;
  return new Ctor(name, [0, duration], [...value, ...value]);
}
const hidden = (name: string, duration: number) => new THREE.VectorKeyframeTrack(name, [0, duration], [0, 0, 0, 0, 0, 0]);
/** Component-wise max of two tracks, sampled at both tracks' keys (keeps a symbol shown whenever either shows it). */
function union(a: Track, b: Track, name: string): Track {
  const times = [...new Set([...a.times, ...b.times])].sort((x, y) => x - y);
  const ia = sampler(a), ib = sampler(b), size = a.getValueSize(), values: number[] = [];
  for (const t of times) {
    const va = ia(t), vb = ib(t);
    for (let i = 0; i < size; i++) values.push(Math.max(va[i], vb[i]));
  }
  return new (a.constructor as TrackCtor)(name, times, values, a.getInterpolation());
}
function remix(source: THREE.AnimationClip, name: string, replace: Track[]): THREE.AnimationClip {
  const names = new Set(replace.map(t => t.name));
  return new THREE.AnimationClip(name, source.duration, [...source.tracks.filter(t => !names.has(t.name)), ...replace]);
}
const CARRY_TRACKS = ['armR.position', 'armR.quaternion', 'armR.scale', 'can.position', 'can.quaternion', 'can.scale'];

/**
 * The clips the world plays, by name. The GLB's own clips plus load-time remixes (doc §6.3): Cheer (Celebrate without
 * sparkles, happy eyes instead of stars), Bounce (Happy without hearts or the yuzu), Write (Focused), WaveCan (Wave with
 * WalkCan's carrying arm), PutDown (PickUp, played backwards by the actor), and `<clip>+can` carrying variants.
 */
const clipCache = new WeakMap<GLTF, Map<string, THREE.AnimationClip>>();
export function worldClips(gltf: GLTF): Map<string, THREE.AnimationClip> {
  const cached = clipCache.get(gltf); if (cached) return cached;
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  const walkCan = clips.get('WalkCan');
  const carry = (clip: THREE.AnimationClip, name: string) =>
    walkCan ? remix(clip, name, CARRY_TRACKS.flatMap(n => { const t = trackOf(walkCan, n); return t ? [held(t, 0, clip.duration)] : []; })) : clip;
  const celebrate = clips.get('Celebrate'), happy = clips.get('Happy'), calm = clips.get('Calm'), wave = clips.get('Wave'), pickUp = clips.get('PickUp'), focused = clips.get('Focused');
  if (celebrate) {
    const replace: Track[] = [1, 2, 3, 4, 5].map(i => hidden(`spark${i}.scale`, celebrate.duration));
    for (const side of ['L', 'R']) {
      const star = trackOf(celebrate, `eye_star${side}.scale`), happyEye = trackOf(celebrate, `eye_happy${side}.scale`);
      if (star && happyEye) replace.push(union(happyEye, star, happyEye.name), hidden(star.name, celebrate.duration));
    }
    clips.set('Cheer', remix(celebrate, 'Cheer', replace));
  }
  if (happy) {
    const replace: Track[] = [1, 2, 3].map(i => hidden(`heart${i}.scale`, happy.duration));
    const yuzu = calm && trackOf(calm, 'yuzu.scale');
    replace.push(yuzu ? held(yuzu, 0, happy.duration) : hidden('yuzu.scale', happy.duration));
    clips.set('Bounce', remix(happy, 'Bounce', replace));
  }
  if (focused) clips.set('Write', focused);
  if (wave) clips.set('WaveCan', carry(wave, 'WaveCan'));
  if (pickUp) { const putDown = pickUp.clone(); putDown.name = 'PutDown'; clips.set('PutDown', putDown); }
  for (const name of ['Calm', 'Walk', 'TurnStep', 'Sniff', 'Wave', 'Cheer', 'Bounce', 'Write'] as const) {
    const clip = clips.get(name); if (clip) clips.set(`${name}+can`, carry(clip, `${name}+can`));
  }
  clipCache.set(gltf, clips);
  return clips;
}

// ------------------------------------------------------------------------------------------------ the actor

function easeOutBack(t: number) { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }

export function createWorldCapy(gltf: GLTF, o: WorldCapyOptions): WorldCapy {
  const root = new THREE.Group(), body = new THREE.Group(), rig = clone(gltf.scene);
  root.add(body); body.add(rig); root.scale.setScalar(WORLD_SCALE);
  // The static watering can belongs to the world: drop it from the rig, and place one copy in World 2.
  rig.getObjectByName('WateringCan')?.removeFromParent();
  const skinned: THREE.SkinnedMesh[] = [];
  rig.traverse(object => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.SkinnedMesh;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.raycast = () => {};
    if (mesh.isSkinnedMesh) skinned.push(mesh);
  });
  // Taps: an invisible stand-in 1.3× the body, since Capy is small on a phone. Hidden (not only its parent) while
  // Capy is inside, because Scene's hit test checks the hit object's own `visible`.
  const hitbox = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hitbox.position.y = .58; hitbox.scale.set(.86 * 1.3, 1.2 * 1.15, .9 * 1.3); hitbox.userData.isCapy = true;
  body.add(hitbox);
  o.parent.add(root);

  const can = o.world === 1 ? gltf.scene.getObjectByName('WateringCan')?.clone(true) ?? null : null;
  if (can) {
    can.scale.setScalar(WORLD_SCALE); can.rotation.y = CAN_HEADING; can.visible = false;
    can.traverse(object => { if ((object as THREE.Mesh).isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    o.parent.add(can);
  }

  const crown = rig.getObjectByName('crown'), beret = rig.getObjectByName('beret'), yuzu = rig.getObjectByName('yuzu'), head = rig.getObjectByName('head');
  let crowned = o.crowned;
  const clips = worldClips(gltf);
  const mixer = new THREE.AnimationMixer(rig);
  let current: THREE.AnimationAction | null = null, currentKey = '', currentCue: number | undefined;

  function mix(delta: number) {
    mixer.update(delta);
    // Clips key every prop's scale, so the crown swap is reapplied after each update.
    if (crowned) { crown?.scale.setScalar(1); beret?.scale.setScalar(0); yuzu?.scale.setScalar(0); }
  }
  function play(pose: Pose) {
    const key = pose.holding && !CAN_CLIPS.has(pose.clip) && clips.has(`${pose.clip}+can`) ? `${pose.clip}+can` : pose.clip;
    if (key === currentKey && pose.cue === currentCue) return;
    const clip = clips.get(key) ?? clips.get('Calm'); if (!clip) return;
    const restart = key === currentKey;
    currentKey = key; currentCue = pose.cue;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(pose.loop ? THREE.LoopRepeat : THREE.LoopOnce, pose.loop ? Infinity : 1);
    // A finished one-shot keeps its weight; otherwise the bind pose (every face variant and prop) shows through.
    action.clampWhenFinished = !pose.loop;
    if (key === 'PutDown') { action.timeScale = -1; action.time = clip.duration; } else action.timeScale = 1;
    action.play();
    if (current && current !== action && !restart) { if (pose.fade > 0) current.crossFadeTo(action, pose.fade, false); else current.stop(); }
    current = action;
  }

  const fixtures = o.fixtures, glassColors = fixtures.windows.map(m => m.color.clone());
  let glow = 0, smokeClock = 0, sparkClock = 0, flag = 0, popTime = o.popIn && o.mode === 'live' ? 0 : POP_SECONDS;
  body.scale.setScalar(popTime < POP_SECONDS ? .001 : 1);
  const fx = new THREE.Group(); o.parent.add(fx);
  const puffGeometry = new THREE.SphereGeometry(.12, 10, 8), sparkGeometry = new THREE.OctahedronGeometry(.045);
  const puffs: { mesh: THREE.Mesh; age: number }[] = [], sparks: { mesh: THREE.Mesh; age: number; vx: number; vz: number }[] = [];
  const bounces = new Map<THREE.Object3D, { base: THREE.Vector3; t: number; amp: number }>();

  function effects(pose: Pose, dt: number) {
    if (fixtures.door) {
      fixtures.door.hinge.rotation.y = pose.door * DOOR_OPEN;
      fixtures.door.portal.visible = pose.door * 92 > 4;
    }
    glow += ((pose.windowsLit ? 1 : 0) - glow) * Math.min(1, dt * 2.5);
    // Daylight is bright, so the panes also warm up in colour, not only in glow, to read as lamplight.
    fixtures.windows.forEach((material, i) => { material.color.copy(glassColors[i]).lerp(LIT_GLASS, glow); material.emissive.copy(GLOW); material.emissiveIntensity = glow * 1.6; });
    if (fixtures.mailFlag) {
      flag += ((pose.mailFlag ? 1 : 0) - flag) * Math.min(1, dt * 6);
      fixtures.mailFlag.object.rotation.x = flag * fixtures.mailFlag.up;
    }
    if (can) {
      can.visible = !!pose.canAt;
      if (pose.canAt) can.position.set(pose.canAt.x, .13, pose.canAt.z);
    }
    // Chimney smoke while Capy is home.
    smokeClock += dt;
    if (pose.smoke && fixtures.chimney && smokeClock > .55 && puffs.length < 9) {
      smokeClock = 0;
      const mesh = new THREE.Mesh(puffGeometry, new THREE.MeshStandardMaterial({ color: '#f6f1e9', roughness: 1, transparent: true, opacity: .75, depthWrite: false }));
      mesh.position.copy(fixtures.chimney); fx.add(mesh); puffs.push({ mesh, age: 0 });
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.age += dt;
      const u = p.age / 3;
      if (u >= 1) { fx.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); puffs.splice(i, 1); continue; }
      p.mesh.position.set(fixtures.chimney!.x + .18 * u + .04 * Math.sin(p.age * 2.3), fixtures.chimney!.y + 1.05 * u, fixtures.chimney!.z - .06 * u);
      p.mesh.scale.setScalar(.55 + 1.2 * u);
      (p.mesh.material as THREE.MeshStandardMaterial).opacity = .75 * (1 - u) * Math.min(1, p.age * 4);
    }
    // Sparkles where the water lands, and the plant there bounces.
    sparkClock += dt;
    if (pose.watering && sparkClock > .16 && sparks.length < 14) {
      sparkClock = 0;
      const mesh = new THREE.Mesh(sparkGeometry, new THREE.MeshStandardMaterial({ color: '#ffe7a3', emissive: '#ffc94d', emissiveIntensity: .9, transparent: true }));
      const a = Math.random() * Math.PI * 2, r = .08 + Math.random() * .2;
      mesh.position.set(pose.watering.x + Math.sin(a) * r, pose.watering.y + .05, pose.watering.z + Math.cos(a) * r);
      fx.add(mesh); sparks.push({ mesh, age: 0, vx: Math.sin(a) * .12, vz: Math.cos(a) * .12 });
      for (const plant of fixtures.plants) {
        if (Math.hypot(plant.at.x - pose.watering.x, plant.at.z - pose.watering.z) > (plant.radius ?? .45)) continue;
        for (const object of plant.objects) {
          // One bounce at a time; the next starts with the next sparkle after it settles, so pouring reads as a rhythm.
          if (!bounces.has(object)) bounces.set(object, { base: object.scale.clone(), t: 0, amp: plant.amp ?? .06 });
        }
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]; s.age += dt;
      const u = s.age / .9;
      if (u >= 1) { fx.remove(s.mesh); (s.mesh.material as THREE.Material).dispose(); sparks.splice(i, 1); continue; }
      s.mesh.position.x += s.vx * dt; s.mesh.position.z += s.vz * dt; s.mesh.position.y += .55 * dt;
      s.mesh.rotation.y += dt * 5; s.mesh.scale.setScalar(Math.sin(u * Math.PI));
      (s.mesh.material as THREE.MeshStandardMaterial).opacity = 1 - u * u;
    }
    for (const [object, b] of bounces) {
      b.t += dt;
      const u = b.t / .7;
      if (u >= 1) { object.scale.copy(b.base); bounces.delete(object); continue; }
      const squash = Math.sin(u * Math.PI * 2) * (1 - u) * b.amp;
      object.scale.set(b.base.x * (1 - squash * .5), b.base.y * (1 + squash), b.base.z * (1 - squash * .5));
    }
  }

  let last: Pose | null = null;
  function apply(pose: Pose, dt: number) {
    last = pose;
    root.position.set(pose.x, pose.y, pose.z);
    root.rotation.y = pose.heading;
    root.visible = pose.visible; hitbox.visible = pose.visible;
    play(pose);
    if (current) {
      if (pose.phase !== undefined) { current.paused = true; current.time = pose.phase; }
      else current.paused = false;
    }
    if (pose.visible || dt === 0) mix(dt);
    effects(pose, dt);
  }

  const memory = capyMemory(o.world);
  const brain: Brain | null = o.mode === 'still' ? null : createBrain({
    world: o.world, pieces: o.pieces, memory, reducedMotion: o.mode === 'reduced', freshPiece: o.freshPiece, crownDrop: o.crownDrop,
  });
  let busy = 0;
  if (brain) apply(brain.tick(0, o.sense), 0);
  else apply(signaturePose(o.world, o.pieces), 0);
  const save = () => { if (brain && o.mode === 'live') memories.set(o.world, brain.memory()); };

  return {
    root,
    update(dt, sense) {
      if (!brain) return false;
      apply(brain.tick(dt, sense), dt);
      if (popTime < POP_SECONDS) { popTime = Math.min(POP_SECONDS, popTime + dt); body.scale.setScalar(easeOutBack(popTime / POP_SECONDS)); }
      save();
      busy = Math.max(0, busy - dt);
      return busy > 0 || puffs.length > 0 || sparks.length > 0;
    },
    tap() {
      if (!brain || !root.visible) return false;
      brain.tap(); busy = 1.8;
      return true;
    },
    knock() {
      if (!brain || !brain.memory().inside) return false;
      brain.knock(); busy = 1.8;
      return true;
    },
    pieceLanded() { brain?.pieceLanded(); },
    describe() { return last ? `${last.activity} ${last.clip} ${last.visible ? 'shown' : 'hidden'} door ${last.door.toFixed(2)}${last.holding ? ' can' : ''}` : ''; },
    setCrowned(on) { crowned = on; mix(0); },
    headTop(target) {
      root.updateWorldMatrix(true, true);
      if (head) return head.localToWorld(target.set(0, .55, .05));
      return root.localToWorld(target.set(0, 1.2, 0));
    },
    dispose() {
      save();
      mixer.stopAllAction(); mixer.uncacheRoot(rig);
      root.removeFromParent(); can?.removeFromParent(); fx.removeFromParent();
      for (const [object, b] of bounces) object.scale.copy(b.base);
      [...puffs, ...sparks].forEach(p => (p.mesh.material as THREE.Material).dispose());
      puffGeometry.dispose(); sparkGeometry.dispose();
      // Bone textures belong to this clone. Geometry, materials and textures stay cached for other scenes.
      skinned.forEach(mesh => mesh.skeleton.dispose());
      hitbox.geometry.dispose(); (hitbox.material as THREE.Material).dispose();
    },
  };
}

