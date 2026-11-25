import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { CLIP_SECONDS, type CapyMood } from './capyMood';

const MODEL_URL = '/models/capy.glb';
/** Fraction of each clip that reads best as a still (reduced motion, miniature scenes). */
const HERO: Record<CapyMood, number> = { Calm: .1, Focused: .2, Happy: .3, Celebrate: .24, Proud: .3, Sleepy: .6, Worried: .18, Chilly: .3, Sad: .3, Grumpy: .3, Confused: .25, Surprised: 10 / 35 };
const FADE = .25, REACT_FADE = .12, POP_SECONDS = .45;

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

export type CapyActor = {
  /** Position, turn and scale this group in the scene. */
  root: THREE.Group;
  setMood(mood: CapyMood): void;
  /** A short reaction (a poke) that returns to the current mood when it ends. */
  react(mood: CapyMood): void;
  /** Wears the crown instead of the beret, and drops the yuzu that balances on the beret. */
  setCrowned(crowned: boolean): void;
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
};

export function createCapy(gltf: GLTF, { mood, still, popIn = false, onPose }: Options): CapyActor {
  const root = new THREE.Group(), body = new THREE.Group(), rig = clone(gltf.scene);
  root.add(body); body.add(rig);
  const skinned: THREE.SkinnedMesh[] = [];
  rig.traverse(object => {
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

  const crown = rig.getObjectByName('crown'), beret = rig.getObjectByName('beret'), yuzu = rig.getObjectByName('yuzu');
  const mixer = new THREE.AnimationMixer(rig);
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
  let base = mood, current: THREE.AnimationAction | null = null, reacting = false, crowned = false, timer = 0;
  let popTime = popIn && !still ? 0 : POP_SECONDS;

  // Clips key every prop's scale, so the crown swap is reapplied after each mixer update.
  function settle() {
    if (crowned) { crown?.scale.setScalar(1); beret?.scale.setScalar(0); yuzu?.scale.setScalar(0); }
  }
  function play(next: CapyMood, once: boolean, fade: number) {
    const clip = clips.get(next); if (!clip) return;
    const action = mixer.clipAction(clip).reset();
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    // A finished one-shot must keep its weight. Otherwise the bind pose, with every face variant and prop, shows through.
    action.clampWhenFinished = once;
    action.play();
    if (current && current !== action) { if (fade > 0) current.crossFadeTo(action, fade, false); else current.stop(); }
    current = action;
  }
  function pose(next: CapyMood) {
    const clip = clips.get(next); if (!clip) return;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset();
    action.play(); action.paused = true; action.time = HERO[next] * clip.duration;
    current = action;
    mixer.update(0); settle(); onPose?.();
  }

  mixer.addEventListener('finished', event => {
    if (reacting && event.action === current) { reacting = false; play(base, false, FADE); }
  });
  // Pose before the first frame: the bind pose shows every variant at once.
  if (still) pose(base); else { play(base, false, 0); mixer.update(0); }
  body.scale.setScalar(popTime < POP_SECONDS ? .001 : 1);

  return {
    root,
    setMood(next) {
      if (next === base) return;
      base = next; reacting = false; clearTimeout(timer);
      if (still) pose(next); else play(next, false, FADE);
    },
    react(next) {
      reacting = true;
      if (!still) { play(next, true, REACT_FADE); return; }
      pose(next); clearTimeout(timer);
      timer = window.setTimeout(() => { reacting = false; pose(base); }, CLIP_SECONDS[next] * 1000);
    },
    setCrowned(on) {
      crowned = on;
      if (still) { mixer.update(0); settle(); onPose?.(); }
    },
    update(delta) {
      if (still) return;
      mixer.update(delta); settle();
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
