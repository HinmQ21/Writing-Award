import { useEffect, useRef } from 'react';
import type * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { capyBus, type CapyMood } from './capyMood';
import type { CapyActor } from './capyModel';

// The logo mark is Capy's bust, live. It shows the streak mood (useCapyMood) in bursts: on a mood change it plays at most
// 5 s, eases to a stop on the mood's HERO frame and stops drawing. Numbers come from the logo lab, see
// docs/capy/logo-and-world-behavior.md section 3.

/** Bust framing for the box (x, y, z: its centre; h: the height it spans), seen from slightly above. The canvas adds headroom on top. */
const FRAME = { fov: 24, elev: .08, x: .03, y: .7, z: .11, h: .92 };
/** Capy turns toward the wordmark. */
const YAW = .18;
/** The camera follows this share of the head's offset from Calm, so a drooping or jumping head stays framed. */
const TRACK = .7;
/** Floating symbols read larger and sit closer to the head in the small frame. */
const FX = { scale: 1.25, pull: .15 };
const FRAME_MS = 1000 / 30;
/** A slow device still finishes a burst on time; a pause (hidden, off screen) restarts the clock instead. */
const MAX_DELTA = .25;
type Rig = { exposure: number; hemi: [string, string, number]; key: [string, number]; fill: [string, number]; rim: [string, number] };
/** A weak rim on the light box keeps the silhouette's contrast; the dark theme's dimmer box gets a cool rim instead. */
const LIGHTS: Record<'light' | 'dark', Rig> = {
  light: { exposure: 1, hemi: ['#fff4de', '#d9b99a', 1.15], key: ['#fff1d8', 3.1], fill: ['#e6e0ff', .35], rim: ['#fff3e6', .8] },
  dark: { exposure: .98, hemi: ['#e3d9f2', '#7d6f7c', 1.05], key: ['#f8dfc0', 2.9], fill: ['#c5b9e8', .45], rim: ['#cdbff7', 3] },
};
const loops = (mood: CapyMood) => mood === 'Celebrate' ? 2 : 1;

/** The logo mark: Capy's 3D bust when it can be shown, the flat picture otherwise. Every mark shares one canvas. */
export function CapyMark({ mood, onReady }: { mood: CapyMood; onReady?: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => stage().attach(ref.current!), []);
  useEffect(() => stage().setMood(mood), [mood]);
  useEffect(() => onReady && stage().onReady(onReady), [onReady]);
  return <span className="brand-mark" ref={ref}><img src="/favicon.svg" width="52" height="52" alt="" /></span>;
}

/** One more burst of the current mood (hover, keyboard focus), unless Capy is already moving. */
export function replayCapyLogo() { stage().replay(); }

let shared: ReturnType<typeof createStage> | null = null;
function stage() { return shared ??= createStage(); }

/**
 * One renderer, canvas and Capy for every mark. The canvas lives in whichever registered mark has a size, so the CSS
 * breakpoints decide (display: none reports 0 x 0), and moving it keeps its WebGL context.
 */
function createStage() {
  const hosts = new Set<HTMLElement>(), readyListeners = new Set<() => void>();
  let owner: HTMLElement | null = null, onScreen = false, mood: CapyMood = 'Calm', started = false, ready = false;
  let view: Awaited<ReturnType<typeof build>> | null = null;

  const sizes = new ResizeObserver(() => pickOwner());
  const sight = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === owner) onScreen = entry.isIntersecting;
    view?.wake();
  });
  document.addEventListener('visibilitychange', () => view?.wake());
  // Only the logo listens: a poke plays over the mood and settles back on it.
  capyBus.listen(reaction => view?.react(reaction));

  /** The mood queue starts once Capy is on screen, or once it is certain the picture stays. */
  function markReady() { if (ready) return; ready = true; readyListeners.forEach(listener => listener()); }
  function pickOwner() {
    const next = [...hosts].find(host => host.offsetWidth > 0 && host.offsetHeight > 0) ?? null;
    if (next !== owner) {
      if (owner) { sight.unobserve(owner); owner.classList.remove('is-live'); }
      owner = next; onScreen = false;
      if (owner) sight.observe(owner);
    }
    view?.place(owner);
  }

  async function start() {
    try {
      if (!wasmWorks()) { markReady(); return; } // the model's meshopt decoder needs WebAssembly (blocked in iOS Lockdown Mode)
      const [three, capy] = await Promise.all([import('three'), import('./capyModel')]);
      if (saveData() && !(await capy.capyModelCached())) { markReady(); return; }
      let renderer: THREE.WebGLRenderer;
      try { renderer = new three.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { markReady(); return; }
      let gltf: GLTF;
      try { gltf = await capy.loadCapyModel(); } catch (error) {
        renderer.dispose(); renderer.forceContextLoss();
        console.warn('Capy could not load; the logo stays a picture.', error); markReady(); return;
      }
      view = await build(three, capy, renderer, gltf);
    } catch (error) { console.warn('The 3D logo could not start; it stays a picture.', error); view = null; markReady(); }
  }

  async function build(three: typeof import('three'), capy: typeof import('./capyModel'), renderer: THREE.WebGLRenderer, gltf: GLTF) {
    const canvas = renderer.domElement;
    let raf = 0, last = 0, live = false, lost = false, compiled = false;
    canvas.setAttribute('aria-hidden', 'true');
    renderer.outputColorSpace = three.SRGBColorSpace; renderer.toneMapping = three.ACESFilmicToneMapping;
    renderer.setClearColor(0x000000, 0);

    // Directional lights keep their direction wherever the camera shifts, and the camera never turns, so this rig is camera-relative.
    const scene = new three.Scene(), camera = new three.PerspectiveCamera(FRAME.fov, 1, .05, 30);
    const hemi = new three.HemisphereLight(), key = new three.DirectionalLight(), fill = new three.DirectionalLight(), rim = new three.DirectionalLight();
    key.position.set(-2.4, 3, 2.6); fill.position.set(3, 1, 2.4); rim.position.set(2.4, 2.8, -3);
    scene.add(hemi, key, fill, rim);
    function applyTheme() {
      const rig = LIGHTS[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'];
      renderer.toneMappingExposure = rig.exposure;
      hemi.color.set(rig.hemi[0]); hemi.groundColor.set(rig.hemi[1]); hemi.intensity = rig.hemi[2];
      key.color.set(rig.key[0]); key.intensity = rig.key[1];
      fill.color.set(rig.fill[0]); fill.intensity = rig.fill[1];
      rim.color.set(rig.rim[0]); rim.intensity = rig.rim[1];
    }
    applyTheme();
    new MutationObserver(() => { applyTheme(); wake(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Reduced motion uses the still path: the HERO pose of each mood, with no bursts.
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let actor: CapyActor | null = null;
    function makeActor() {
      actor?.dispose();
      actor = capy.createCapy(gltf, { mood, still: motion.matches, fx: FX, onPose: wake });
      actor.root.rotation.y = YAW; scene.add(actor.root);
    }
    makeActor();
    motion.addEventListener('change', () => { makeActor(); actor!.burst(mood, loops(mood)); wake(); });

    // The camera follows the head from mood to mood, measured on each HERO pose.
    const heads = capy.heroHeadCenters(gltf), yAxis = new three.Vector3(0, 1, 0);
    const aim = new three.Vector3(), goal = new three.Vector3(), center = new three.Vector3();
    const up = new three.Vector3(0, Math.cos(FRAME.elev), -Math.sin(FRAME.elev)), back = new three.Vector3(0, Math.sin(FRAME.elev), Math.cos(FRAME.elev));
    let width = 0, height = 0, ratio = 0;
    function frameCamera() {
      // fov spans the canvas height; the box's centre sits half the headroom below the canvas centre.
      const distance = FRAME.h * height / width / 2 / Math.tan(three.MathUtils.degToRad(FRAME.fov / 2));
      center.set(FRAME.x + aim.x, FRAME.y + aim.y, FRAME.z + aim.z).addScaledVector(up, FRAME.h * (height - width) / (2 * width));
      camera.aspect = width / height; camera.near = Math.max(.05, distance - 3); camera.far = distance + 3;
      camera.position.copy(center).addScaledVector(back, distance); camera.lookAt(center); camera.updateProjectionMatrix();
    }
    /** Eases the framing toward the mood's; true while it is still on its way. */
    function followHead(delta: number) {
      goal.subVectors(heads[mood], heads.Calm).applyAxisAngle(yAxis, YAW).multiplyScalar(TRACK);
      if (!live || motion.matches) aim.copy(goal); else aim.lerp(goal, 1 - Math.exp(-delta / .2));
      if (aim.distanceTo(goal) < 1e-4) aim.copy(goal);
      if (width) frameCamera();
      return !aim.equals(goal);
    }

    /** Sizes the canvas to the mark that shows it: the box's width by the box plus the headroom set in CSS. */
    function place(host: HTMLElement | null) {
      if (!host) return;
      if (canvas.parentElement !== host) host.appendChild(canvas);
      const w = host.clientWidth, h = canvas.clientHeight, r = Math.min(3, Math.max(2, devicePixelRatio)); // 2x on DPR 1 sharpens eyes and brows
      if (w && h && (w !== width || h !== height || r !== ratio)) {
        width = w; height = h; ratio = r;
        renderer.setPixelRatio(r); renderer.setSize(w, h, false); frameCamera();
      }
      if (live) host.classList.add('is-live');
      wake();
    }
    addEventListener('resize', () => place(owner)); // a zoom changes the pixel ratio without resizing the box

    // Drawing: 30 fps while something moves, nothing at rest, paused while the tab is hidden or the mark is off screen.
    function wake() { if (!raf) raf = requestAnimationFrame(draw); }
    function draw(time: number) {
      raf = 0;
      if (!actor || !compiled || lost || !owner || !onScreen || document.hidden || !width || canvas.parentElement !== owner) { last = 0; return; }
      if (last && time - last < FRAME_MS - 4) { raf = requestAnimationFrame(draw); return; }
      const delta = last ? Math.min(MAX_DELTA, (time - last) / 1000) : 0;
      actor.update(delta);
      const framing = followHead(delta);
      renderer.render(scene, camera);
      if (!live) { live = true; owner.classList.add('is-live'); markReady(); }
      if (actor.isMoving() || framing) { last = time; raf = requestAnimationFrame(draw); } else last = 0;
    }
    // The picture shows again while the context is gone. three.js restores its state; the next frame brings Capy back.
    canvas.addEventListener('webglcontextlost', () => { lost = true; live = false; owner?.classList.remove('is-live'); cancelAnimationFrame(raf); raf = 0; last = 0; });
    canvas.addEventListener('webglcontextrestored', () => { lost = false; wake(); });

    place(owner);
    // Shaders compile before the first frame, off the main thread where the driver can (compileAsync would only poll without it).
    if (renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera); else renderer.compile(scene, camera);
    compiled = true;
    actor!.burst(mood, loops(mood));
    wake();

    return {
      place, wake,
      setMood(next: CapyMood) { actor?.burst(next, loops(next)); wake(); },
      react(reaction: CapyMood) { actor?.react(reaction); actor?.halt(); wake(); },
      replay() { if (actor && !actor.isMoving() && !motion.matches) { actor.burst(mood, loops(mood)); wake(); } },
    };
  }

  return {
    attach(host: HTMLElement) {
      hosts.add(host); sizes.observe(host); pickOwner();
      if (!started) { started = true; void start(); }
      return () => { hosts.delete(host); sizes.unobserve(host); pickOwner(); };
    },
    setMood(next: CapyMood) { if (next === mood) return; mood = next; view?.setMood(next); },
    replay() { view?.replay(); },
    onReady(listener: () => void) {
      if (ready) { listener(); return; }
      readyListeners.add(listener);
      return () => { readyListeners.delete(listener); };
    },
  };
}

function wasmWorks() {
  try { return typeof WebAssembly === 'object' && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); } catch { return false; }
}
function saveData() { return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true; }
