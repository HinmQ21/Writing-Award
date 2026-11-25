import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CAPY_MOODS, CLIP_SECONDS, type CapyMood } from './capyMood';

const MODEL_URL = '/models/capy.glb';
/** Fraction of each clip that reads best as a still (reduced motion, miniature scenes, the logo at rest). */
const HERO: Record<CapyMood, number> = { Calm: .1, Focused: .2, Happy: .3, Celebrate: .24, Proud: .3, Sleepy: .6, Worried: .18, Chilly: .3, Sad: .3, Grumpy: .3, Confused: .25, Surprised: 10 / 35 };
const FADE = .25, REACT_FADE = .12, POP_SECONDS = .45, EASE = .6;
/** Floating symbols: tears, sweat, anger, puffs, Zs, bubble, "?", "!", sparkles, hearts, the rain cloud and its drops, snow. */
const FX_BONE = /^(tear|sweat|anger|puff|z\d|bubble|question|exclaim|spark|heart|cloud|drop|snow)/;
/** The head's visual centre in the head bone's space. It follows jumps, droops and leans. */
const HEAD_CENTER = new THREE.Vector3(0, .32, .08);
/** Props in the GLB that belong to the world rather than to Capy (the static watering can). Every clone drops them. */
const WORLD_PROPS = new Set(['WateringCan']);

let model: GLTF | null = null;
let pending: Promise<GLTF> | null = null;

/** Loads public/models/capy.glb once. Every scene clones the cached result, so geometry, materials and clips are shared. */
export function loadCapyModel(): Promise<GLTF> {
  if (model) return Promise.resolve(model);
  pending ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(MODEL_URL).then(
    gltf => (model = gltf),
    error => { pending = null; throw error; },
  );
  return pending;
}
export function loadedCapyModel(): GLTF | null { return model; }
/** True when showing the model costs no download: it is in memory or in the HTTP cache (for Save-Data). */
export async function capyModelCached(): Promise<boolean> {
  if (model) return true;
  try {
    const response = await fetch(MODEL_URL, { cache: 'only-if-cached', mode: 'same-origin' });
    await response.body?.cancel();
    return response.ok;
  } catch { return false; }
}

/** The head's visual centre in each mood's HERO pose, in the model's own space, so a tight frame (the logo) can follow it. */
export function heroHeadCenters(gltf: GLTF): Record<CapyMood, THREE.Vector3> {
  const rig = clone(gltf.scene), head = rig.getObjectByName('head'), mixer = new THREE.AnimationMixer(rig);
  const centers = {} as Record<CapyMood, THREE.Vector3>;
  for (const mood of CAPY_MOODS) {
    centers[mood] = new THREE.Vector3();
    const clip = gltf.animations.find(clip => clip.name === mood);
    if (!clip || !head) continue;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset();
    action.play(); action.paused = true; action.time = HERO[mood] * clip.duration;
    mixer.update(0); rig.updateMatrixWorld(true);
    head.localToWorld(centers[mood].copy(HEAD_CENTER));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(rig);
  return centers;
}

export type CapyActor = {
  /** Position, turn and scale this group in the scene. */
  root: THREE.Group;
  setMood(mood: CapyMood): void;
  /** A short reaction (a poke) that returns to the current mood when it ends. */
  react(mood: CapyMood): void;
  /** Wears the crown instead of the beret, and drops the yuzu that balances on the beret. */
  setCrowned(crowned: boolean): void;
  /**
   * One burst, for a Capy that rests between moods (the logo): cross-fades to `mood`, which becomes the resting mood,
   * plays it from its HERO frame for `loops` loops and eases to a stop back on that frame over the last `ease` seconds.
   * Returns the seconds until it rests. With `still`, it just holds the HERO pose.
   */
  burst(mood: CapyMood, loops?: number, ease?: number): number;
  /**
   * Brings the motion to rest on the resting mood's HERO frame: a reaction plays out first and then fades into it,
   * a looping clip runs on to its next HERO frame and eases to a stop there. Returns the seconds until it rests.
   */
  halt(ease?: number): number;
  /** False once a burst or halt has come to rest, and always for a still pose, so a caller can stop drawing. */
  isMoving(): boolean;
  update(delta: number): void;
  dispose(): void;
};

type Options = {
  mood: CapyMood;
  /** Hold a still pose per mood instead of animating (reduced motion, miniature scenes). */
  still: boolean;
  /** Pop in with a small overshoot, for a model that arrives after the scene is already showing. */
  popIn?: boolean;
  /** Called after a still pose changes, so the scene can draw it. */
  onPose?: () => void;
  /**
   * Floating symbols drawn `scale` times larger and pulled `pull` (0 to 1) of the way toward the head, horizontally,
   * so they read in a tight frame such as the logo. Off by default.
   */
  fx?: { scale: number; pull: number };
};

export function createCapy(gltf: GLTF, { mood, still, popIn = false, onPose, fx }: Options): CapyActor {
  const root = new THREE.Group(), body = new THREE.Group(), rig = clone(gltf.scene);
  root.add(body); body.add(rig);
  const worldProps: THREE.Object3D[] = [];
  rig.traverse(object => { if (WORLD_PROPS.has(object.name)) worldProps.push(object); });
  worldProps.forEach(object => object.removeFromParent());
  const skinned: THREE.SkinnedMesh[] = [], fxBones: THREE.Object3D[] = [];
  rig.traverse(object => {
    if ((object as THREE.Bone).isBone && FX_BONE.test(object.name)) fxBones.push(object);
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.SkinnedMesh;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false; // bounds come from the bind pose, not the animated one
    mesh.raycast = () => {}; // the hitbox answers taps; raycasting a skinned mesh is slow
    if (mesh.isSkinnedMesh) skinned.push(mesh);
  });
  // Invisible stand-in for taps and the hover cursor. Scene looks for userData.isCapy.
  const hitbox = new THREE.Mesh(new THREE.SphereGeometry(.5, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hitbox.position.y = .58; hitbox.scale.set(.86, 1.2, .9); hitbox.userData.isCapy = true;
  body.add(hitbox);

  const crown = rig.getObjectByName('crown'), beret = rig.getObjectByName('beret'), yuzu = rig.getObjectByName('yuzu'), head = rig.getObjectByName('head');
  const mixer = new THREE.AnimationMixer(rig);
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  let base = mood, current: THREE.AnimationAction | null = null, reacting = false, crowned = false, timer = 0;
  let popTime = popIn && !still ? 0 : POP_SECONDS;
  // Coming to rest: play on at full speed for `runLeft` seconds, then glide onto the HERO frame over `ease` seconds.
  let runLeft = -1, ease = EASE, glide: { from: number; span: number; t: number } | null = null;
  // Seconds to fade into the HERO pose once the playing reaction ends (0: return to the looping mood instead).
  let haltAfterReaction = 0, fading = 0, parked = false;

  /** Updates the mixer, then reapplies what the clips don't know about: the crown swap and the larger symbols. */
  function mix(delta: number) {
    restoreFx();
    mixer.update(delta);
    if (crowned) { crown?.scale.setScalar(1); beret?.scale.setScalar(0); yuzu?.scale.setScalar(0); }
    if (fx) enlargeFx(fx);
  }
  // The mixer only writes a bone whose animated value changed, so the symbols get their clip values back before each
  // update; otherwise a held value would be enlarged again on every frame.
  const fxClip = fxBones.map(() => ({ position: new THREE.Vector3(), scale: new THREE.Vector3() }));
  let fxApplied = false;
  function restoreFx() {
    if (fxApplied) fxBones.forEach((bone, i) => { bone.position.copy(fxClip[i].position); bone.scale.copy(fxClip[i].scale); });
    fxApplied = false;
  }
  const headAt = new THREE.Vector3(), at = new THREE.Vector3();
  function enlargeFx({ scale, pull }: { scale: number; pull: number }) {
    if (!head) return;
    fxBones.forEach((bone, i) => { fxClip[i].position.copy(bone.position); fxClip[i].scale.copy(bone.scale); });
    fxApplied = true;
    rig.updateWorldMatrix(true, true);
    body.worldToLocal(head.localToWorld(headAt.copy(HEAD_CENTER)));
    for (const bone of fxBones) {
      if (bone.scale.x < .01 || !bone.parent) continue; // hidden in this pose
      body.worldToLocal(bone.getWorldPosition(at));
      at.x += (headAt.x - at.x) * pull; at.z += (headAt.z - at.z) * pull;
      bone.position.copy(bone.parent.worldToLocal(body.localToWorld(at)));
      bone.scale.multiplyScalar(scale); // each symbol's bone sits at its centre, so it grows in place
      bone.updateMatrixWorld(true);
    }
  }
  function play(next: CapyMood, once: boolean, fade: number, from = 0) {
    const clip = clips.get(next); if (!clip) return;
    const action = mixer.clipAction(clip).reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    // A finished one-shot must keep its weight. Otherwise the bind pose, with every face variant and prop, shows through.
    action.clampWhenFinished = once;
    action.time = from;
    action.play();
    if (current && current !== action) { if (fade > 0) { current.crossFadeTo(action, fade, false); fading = fade; } else current.stop(); }
    current = action; runLeft = -1; glide = null; parked = false;
  }
  function pose(next: CapyMood) {
    const clip = clips.get(next); if (!clip) return;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset();
    action.play(); action.paused = true; action.time = HERO[next] * clip.duration;
    current = action;
    mix(0); onPose?.();
  }
  /** Fades into the resting mood's HERO pose and holds it. */
  function hold(fade: number) {
    const clip = clips.get(base); if (!clip) return;
    play(base, false, fade, HERO[base] * clip.duration);
    current!.paused = true; parked = true;
  }
  function startGlide() {
    runLeft = -1;
    const clip = current?.getClip();
    if (!current || !clip || clip.name !== base) { hold(ease); return; }
    const span = ((HERO[base] * clip.duration - current.time) % clip.duration + clip.duration) % clip.duration;
    if (span > ease) { hold(ease); return; } // out of step: fade rather than rush through the clip
    current.paused = true; glide = { from: current.time, span, t: 0 };
  }
  function stepGlide(delta: number) {
    if (!glide || !current) return;
    glide.t = Math.min(ease, glide.t + delta);
    const u = glide.t / ease, duration = current.getClip().duration;
    // Quadratic ease-out: it starts at clip speed when span is half of `ease` (as a burst plans it) and stops dead on HERO.
    current.time = (glide.from + glide.span * (1 - (1 - u) ** 2)) % duration;
    if (u >= 1) { glide = null; parked = true; }
  }

  mixer.addEventListener('finished', event => {
    if (!reacting || event.action !== current) return;
    reacting = false;
    if (haltAfterReaction) { const fade = haltAfterReaction; haltAfterReaction = 0; hold(fade); }
    else play(base, false, FADE);
  });
  // Pose before the first frame: the bind pose shows every variant at once.
  if (still) pose(base); else { play(base, false, 0); mix(0); }
  body.scale.setScalar(popTime < POP_SECONDS ? .001 : 1);

  return {
    root,
    setMood(next) {
      if (next === base) return;
      base = next; reacting = false; haltAfterReaction = 0; clearTimeout(timer);
      if (still) pose(next); else play(next, false, FADE);
    },
    react(next) {
      reacting = true; haltAfterReaction = 0;
      if (!still) { play(next, true, REACT_FADE); return; }
      pose(next); clearTimeout(timer);
      timer = window.setTimeout(() => { reacting = false; pose(base); }, CLIP_SECONDS[next] * 1000);
    },
    setCrowned(on) {
      crowned = on;
      if (still) { mix(0); onPose?.(); }
    },
    burst(next, loops = 1, easeSeconds = EASE) {
      base = next; reacting = false; haltAfterReaction = 0; clearTimeout(timer);
      const clip = clips.get(next);
      if (still || !clip) { if (clip) pose(next); return 0; }
      play(next, false, FADE, HERO[next] * clip.duration);
      ease = easeSeconds; runLeft = Math.max(0, loops * clip.duration - ease / 2);
      return runLeft + ease;
    },
    halt(easeSeconds = EASE) {
      if (still || !current || parked) return 0;
      if (glide) return ease - glide.t;
      if (runLeft >= 0) return runLeft + ease; // already on its way to rest
      if (reacting) { haltAfterReaction = easeSeconds; return current.getClip().duration - current.time + easeSeconds; }
      ease = easeSeconds;
      const duration = current.getClip().duration;
      runLeft = Math.max(0, ((HERO[base] * duration - current.time) % duration + duration) % duration - ease / 2);
      return runLeft + ease;
    },
    isMoving() { return !still && !(parked && fading <= 0 && popTime >= POP_SECONDS); },
    update(delta) {
      if (still) return;
      if (glide) stepGlide(delta);
      else if (runLeft >= 0 && (runLeft -= delta) <= 0) { startGlide(); stepGlide(delta); }
      mix(delta);
      fading = Math.max(0, fading - delta);
      if (popTime < POP_SECONDS) { popTime = Math.min(POP_SECONDS, popTime + delta); body.scale.setScalar(easeOutBack(popTime / POP_SECONDS)); }
    },
    dispose() {
      clearTimeout(timer);
      mixer.stopAllAction(); mixer.uncacheRoot(rig);
      root.removeFromParent();
      // Bone textures belong to this clone. Geometry, materials and textures stay cached for other scenes.
      skinned.forEach(mesh => mesh.skeleton.dispose());
      hitbox.geometry.dispose(); (hitbox.material as THREE.Material).dispose();
    },
  };
}

function easeOutBack(t: number) { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; }
