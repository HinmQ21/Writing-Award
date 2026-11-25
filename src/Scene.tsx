import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { RotateCcw } from 'lucide-react';
import { localHour, nextPokeReaction, type CapyMood } from './capyMood';
import { loadCapyModel, loadedCapyModel } from './capyModel';
import { BUSH17_X, inKeepClear } from './capyNavData';
import { capyMemory, createWorldCapy, type WorldCapy, type WorldFixtures } from './capyWorld';
import type { Sense } from './capyWorldTypes';
import { useTheme } from './theme';

export type SceneHandle = { rotate: (direction: number) => void; zoom: (direction: number) => void; reset: () => void };
type Props = {
  world: number;
  pieces: number;
  rainy?: boolean;
  animatePiece?: boolean;
  miniature?: boolean;
  rewardPiece?: boolean;
  /** A tap on Capy: Surprised, or Grumpy on the fourth poke within three seconds (world taps and logo clicks count together). */
  onCapyPet?: (reaction: CapyMood) => void;
};
// The decor loops keep this front-left spot clear (Capy's resting place), and in the Capy worlds also the cottage door lane.
// capyNavData.ts mirrors both, so the walkable map matches what is drawn.
const CLEAR_X = -1.72, CLEAR_Z = 1.8;
const C = { grass: '#c4d49b', earth: '#d8c29e', cream: '#ffe9bd', trim: '#e8bc83', wood: '#a9794b', roof: '#e69b92', dark: '#5e4435', leaf: '#9cb86d', flower: '#e4adc0', water: '#b4d3ce', glass: '#e9d6a2', gold: '#e9bc65' };
const materials = new Map<string, THREE.MeshStandardMaterial>();
function material(color: string) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: .88 }));
  return materials.get(color)!;
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, radius = .06) {
  return mesh(parent, new RoundedBoxGeometry(w, h, d, 3, Math.min(radius, w / 2.2, h / 2.2, d / 2.2)), color, x, y, z);
}
function ball(parent: THREE.Object3D, radius: number, color: string, x: number, y: number, z: number, scale: [number, number, number] = [1, 1, 1]) {
  const m = mesh(parent, new THREE.SphereGeometry(radius, 20, 16), color, x, y, z); m.scale.set(...scale); return m;
}
function cylinder(parent: THREE.Object3D, radius: number, height: number, color: string, x: number, y: number, z: number) {
  return mesh(parent, new THREE.CylinderGeometry(radius, radius, height, 24), color, x, y, z);
}
function flower(parent: THREE.Object3D, x: number, y: number, z: number, color = C.flower, size = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(size); parent.add(g);
  cylinder(g, .022, .28, C.leaf, 0, .06, 0);
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ball(g, .09, color, Math.cos(a) * .11, .23 + Math.sin(a) * .11, .015, [1, 1, .6]); }
  ball(g, .065, '#f5d485', 0, .23, .07);
}
function tree(parent: THREE.Object3D, x: number, z: number, size = 1, pink = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(size); parent.add(g);
  cylinder(g, .16, 1.55, C.wood, 0, .77, 0);
  const branch = cylinder(g, .09, .8, C.wood, .2, 1.3, 0); branch.rotation.z = -.65;
  const leafColors = pink ? ['#e9b5c1', '#efc6cb', '#dfa0b4'] : ['#a4bf77', '#b9ca88', '#94b473'];
  [[0, 1.9, 0, .75], [-.5, 1.65, .04, .58], [.5, 1.75, .05, .62], [.15, 2.25, .05, .58], [-.3, 2.15, -.2, .55], [.1, 1.8, .5, .6], [-.2, 2, -.5, .5]].forEach(([a,b,c,r], i) => ball(g, r, leafColors[i % 3], a, b, c));
}

function createHeartGeometry() {
  const s = 0.055;
  const shape = new THREE.Shape();
  shape.moveTo(0, s * 0.3);
  shape.bezierCurveTo(0, s * 0.7, -s * 0.6, s * 0.9, -s * 0.6, s * 0.4);
  shape.bezierCurveTo(-s * 0.6, 0, 0, -s * 0.4, 0, -s * 0.7);
  shape.bezierCurveTo(0, -s * 0.4, s * 0.6, 0, s * 0.6, s * 0.4);
  shape.bezierCurveTo(s * 0.6, s * 0.9, 0, s * 0.7, 0, s * 0.3);
  return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
}

function windowRound(parent: THREE.Object3D, x: number, y: number, z: number, radius = .34) {
  const glass = cylinder(parent, radius, .075, C.glass, x, y, z); glass.rotation.x = Math.PI / 2; glass.userData.glass = true;
  const ring = mesh(parent, new THREE.TorusGeometry(radius, .065, 8, 32), C.trim, x, y, z + .06);
  box(parent, radius * 1.8, .055, .07, C.trim, x, y, z + .09, .01);
  box(parent, .055, radius * 1.8, .07, C.trim, x, y, z + .09, .01); return ring;
}
function archShape() {
  const s = new THREE.Shape(); s.moveTo(-.4, 0); s.lineTo(.4, 0); s.lineTo(.4, 1); s.absarc(0, 1, .4, 0, Math.PI, false); s.lineTo(-.4, 0);
  return s;
}
/**
 * The cottage door. The leaf hangs in a hinge group at its back-left edge (x -.425, z 1.405) and opens inward
 * (rotation.y 0 to +92 degrees). Behind it, a dark arch at z 1.505 shows only while the door is open: it reads as the
 * dark room inside, and depth-tests away whatever part of Capy has stepped past it (doc section 5.4).
 */
function door(parent: THREE.Object3D, x: number, y: number, z: number) {
  const hinge = new THREE.Group(); hinge.position.set(x - .425, y, z - .025); parent.add(hinge);
  const leaf = new THREE.Group(); leaf.position.set(.425, 0, .025); hinge.add(leaf);
  mesh(leaf, new THREE.ExtrudeGeometry(archShape(), { depth: .12, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .025, bevelThickness: .025 }), C.wood);
  for (let i = -1; i <= 1; i++) box(leaf, .016, 1.13, .02, '#bc8d59', i * .21, .63, .15, .003);
  ball(leaf, .055, C.gold, .24, .62, .19);
  windowRound(leaf, 0, 1.02, .13, .19);
  const portal = new THREE.Mesh(new THREE.ShapeGeometry(archShape(), 12), new THREE.MeshBasicMaterial({ color: '#3b2b22' }));
  portal.position.set(x, y, 1.505); portal.visible = false; parent.add(portal);
  return { hinge, portal };
}
/** The mailbox flag: an arm lying forward along +z that swings up (rotation.x to -90 degrees) once Capy has checked the mail. */
function mailFlag(parent: THREE.Object3D, x: number, y: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  box(g, .025, .025, .2, '#c25b4f', 0, 0, .09, .008);
  box(g, .025, .09, .08, '#d9655a', 0, .045, .17, .01);
  return g;
}
function roof(parent: THREE.Object3D, side: number) {
  const g = new THREE.Group(); parent.add(g); g.position.set(side * .74, 2.86, 0); g.rotation.z = side * -.59;
  box(g, 1.92, .16, 3.22, C.roof, 0, 0, 0, .07);
  for (let row = 0; row < 5; row++) for (let col = 0; col < 7; col++) {
    box(g, .405, .105, .47, ['#e8a398', '#eca99f', '#dc938c'][(row + col) % 3], -.76 + row * .38, .11 + row * .004, -1.36 + col * .45, .065);
  }
  box(g, 1.99, .15, .14, C.trim, 0, -.015, 1.61, .03);
  box(g, 1.99, .15, .14, C.trim, 0, -.015, -1.61, .03);
}
function fence(parent: THREE.Object3D, side: number) {
  const g = new THREE.Group(); parent.add(g); g.position.set(side * 2.45, 0, .8);
  for (let i = 0; i < 4; i++) { box(g, .15, .73, .16, '#c9a071', 0, .47, -.6 + i * .55); ball(g, .09, '#e1bc88', 0, .88, -.6 + i * .55); }
  box(g, .1, .12, 1.9, '#d2ac7a', 0, .45, .2); box(g, .1, .12, 1.9, '#d2ac7a', 0, .7, .2);
}
function buildCottage(root: THREE.Group, count: number) {
  const parts = Array.from({ length: 21 }, () => { const g = new THREE.Group(); root.add(g); return g; });
  box(parts[0], 2.8, .2, 2.92, '#edd5ad', 0, .26, 0, .1);
  box(parts[1], 1.15, .15, .55, '#ead5b0', 0, .2, 1.72); box(parts[1], 1.4, .12, .52, '#f1dfbf', 0, .12, 2.05);
  box(parts[2], 2.6, 1.94, .18, C.cream, 0, 1.31, 1.32);
  box(parts[3], .18, 1.94, 2.65, '#f5dfb6', -1.3, 1.31, 0);
  box(parts[4], .18, 1.94, 2.65, '#f8e2b8', 1.3, 1.31, 0);
  box(parts[5], 2.6, 1.94, .18, C.cream, 0, 1.31, -1.32);
  [-1.27, 1.27].forEach(x => box(parts[2], .13, 2.05, .13, C.trim, x, 1.32, 1.43));
  box(parts[2], 2.6, .12, .12, C.trim, 0, .47, 1.44);
  const entrance = door(parts[6], 0, .36, 1.43);
  windowRound(parts[7], 0, 2.55, 1.49, .27);
  const win = new THREE.Group(); parts[8].add(win); win.position.set(1.43, 1.43, 0); win.rotation.y = Math.PI / 2; windowRound(win, 0, 0, 0, .34);
  box(win, .94, .1, .2, C.trim, 0, -.45, .06); box(win, .83, .2, .22, '#b2bd85', 0, -.56, .06);
  for (let i = 0; i < 4; i++) flower(win, -.3 + i * .2, -.46, .16, i % 2 ? '#e9b0ba' : '#f5da9c', .5);
  const shape = new THREE.Shape(); shape.moveTo(-1.31, 0); shape.lineTo(1.31, 0); shape.lineTo(0, .94); shape.closePath();
  const gable = mesh(parts[9], new THREE.ExtrudeGeometry(shape, { depth: 2.72, bevelEnabled: false }), C.cream, 0, 2.28, -1.36); gable.castShadow = true;
  roof(parts[10], -1); roof(parts[11], 1);
  box(parts[12], .48, 1.12, .48, '#eecba5', .68, 3.25, -.6); box(parts[12], .6, .14, .6, '#e5b58e', .68, 3.86, -.6);
  for (let i = 0; i < 3; i++) box(parts[12], .49, .025, .49, '#deb18b', .68, 2.92 + i * .27, -.6, .01);
  fence(parts[13], -1); fence(parts[14], 1);
  tree(parts[15], 2.5, -1.9, .7);
  // Three balls, not five, so the door lane stays clear (doc section 4.4).
  BUSH17_X.forEach((x, i) => { ball(parts[16], .25, ['#a8bf7e','#bdcf91'][i % 2], x, .43, 1.62); flower(parts[16], x, .58, 1.8, C.flower, .65); });
  for (let i = 0; i < 10; i++) flower(parts[17], 1.6 + Math.sin(i * 2) * .38, .21, 1.8 + Math.cos(i * 2) * .4, ['#e5b1c5','#f6d98e','#fff1d1'][i % 3], .8);
  cylinder(parts[18], .055, .73, C.wood, 1.8, .48, 2.13); box(parts[18], .39, .29, .3, '#df9d92', 1.8, .97, 2.13); box(parts[18], .2, .03, .03, C.cream, 1.8, 1, 2.3);
  const flag = mailFlag(parts[18], 2.01, .92, 2.06);
  // The crown drops onto Capy's head where Capy waits for it, clear of the eave (doc section 4.4).
  cylinder(parts[19], .2, .1, C.gold, -1.9, 1.11, 1.7);
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; mesh(parts[19], new THREE.ConeGeometry(.06, .18, 5), C.gold, -1.9 + Math.cos(a) * .17, 1.23, 1.7 + Math.sin(a) * .17); }
  box(parts[20], .7, .4, .1, '#e5c79b', -2.35, .84, 2.1); box(parts[20], .08, .65, .08, C.wood, -2.35, .39, 2.1);
  for (let i = 0; i < 3; i++) box(parts[20], .34 - i * .05, .025, .02, '#9a7852', -2.35, .95 - i * .1, 2.16, .003);
  parts.forEach((g, i) => { g.visible = i < count; });
  // Taps on the house knock on the door while Capy is inside.
  for (let i = 0; i < 13; i++) parts[i].traverse(o => { o.userData.isHouse = true; });
  if (count < 13 && count >= 10) {
    const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.48, 1.12, .48)), new THREE.LineBasicMaterial({ color: '#9b967a', transparent: true, opacity: .45 }));
    ghost.position.set(.68, 3.25, -.6); root.add(ghost);
  }
  return { parts, entrance, flag };
}
function buildTree(root: THREE.Group, count: number) {
  const parts = Array.from({ length: 21 }, () => { const g = new THREE.Group(); root.add(g); return g; });
  cylinder(parts[0], .45, .2, '#bc9468', 0, .2, 0);
  // The first trunk section reaches down into the mound instead of floating above it.
  for (let i = 1; i < 6; i++) cylinder(parts[i], .3 - i * .025, i === 1 ? .725 : .55, C.wood, Math.sin(i) * .08, i === 1 ? .6625 : .25 + i * .5, 0);
  for (let i = 6; i < 14; i++) { const a = (i - 6) * 2.4; ball(parts[i], .8, ['#e7afc0','#efc5cf','#dda0b9'][i % 3], Math.sin(a) * .95, 2.8 + Math.cos(a * 2) * .45, Math.cos(a) * .8); }
  box(parts[14], 1.15, .6, .5, '#d8b98b', -1.5, .45, .8);
  for (let i = 0; i < 8; i++) box(parts[14], .09, .3 + (i % 3) * .06, .22, ['#b7b0d0','#e3a997','#adc39a'][i % 3], -1.95 + i * .13, .88, .8, .01);
  cylinder(parts[15], .6, .13, C.trim, 1.4, .75, 1.2); cylinder(parts[15], .08, .6, C.wood, 1.4, .4, 1.2);
  box(parts[16], .65, .15, .45, '#d6b283', 1.45, .35, 2);
  for (const [dx, dz] of [[-.25, -.15], [.25, -.15], [-.25, .15], [.25, .15]]) cylinder(parts[16], .035, .16, C.wood, 1.45 + dx, .2, 2 + dz);
  for (let i = 17; i < 21; i++) { const a = i * 2; flower(parts[i], Math.sin(a) * 2, .2, Math.cos(a) * 2, '#e4a5bd', 1.3); }
  parts.forEach((g, i) => g.visible = i < count); return parts;
}

function legoBrick(parent: THREE.Object3D, studsX: number, studsZ: number, height: number, color: string, x: number, y: number, z: number, topStuds = true) {
  const u = 0.34;
  const w = studsX * u - 0.016;
  const d = studsZ * u - 0.016;
  const b = box(parent, w, height - 0.012, d, color, x, y, z, 0.022);
  if (topStuds) {
    for (let sx = 0; sx < studsX; sx++) {
      for (let sz = 0; sz < studsZ; sz++) {
        const px = x - ((studsX - 1) * u) / 2 + sx * u;
        const pz = z - ((studsZ - 1) * u) / 2 + sz * u;
        cylinder(parent, 0.095, 0.068, color, px, y + height / 2 + 0.028, pz);
      }
    }
  }
  return b;
}

function buildLego(root: THREE.Group, count: number) {
  // Orient the compact, chubby 4-legged Lego Capybara at +0.38 rad so it faces 3/4 front-left toward the camera, matching the concept art!
  const stage = new THREE.Group();
  stage.position.set(0, 0, -0.1);
  stage.rotation.y = 0.38;
  stage.userData.isCapy = true;
  root.add(stage);

  const parts = Array.from({ length: 21 }, () => { const g = new THREE.Group(); g.userData.isCapy = true; stage.add(g); return g; });

  const L1 = '#e8b374'; // warm golden-tan Lego brick
  const L2 = '#dca262'; // honey-caramel Lego brick
  const L3 = '#f2c68e'; // cream-tan belly highlight brick
  const LM = '#966442'; // cocoa-brown muzzle/paw/ear brick
  const LD = '#7a4e30'; // dark cocoa toe/nose brick
  const LI = '#251810'; // ink-black eye/nostril tile

  // 0..3: Four short, chunky 2x2 Lego legs & paws at the four corners
  // 0: Front-Left Leg
  legoBrick(parts[0], 2, 2, 0.22, LM, -0.51, 0.24, 0.68, false);
  legoBrick(parts[0], 2, 1, 0.16, LD, -0.51, 0.21, 1.08, true);
  legoBrick(parts[0], 2, 2, 0.32, L2, -0.51, 0.51, 0.68, false);
  // 1: Front-Right Leg
  legoBrick(parts[1], 2, 2, 0.22, LM, 0.51, 0.24, 0.68, false);
  legoBrick(parts[1], 2, 1, 0.16, LD, 0.51, 0.21, 1.08, true);
  legoBrick(parts[1], 2, 2, 0.32, L2, 0.51, 0.51, 0.68, false);
  // 2: Back-Left Leg
  legoBrick(parts[2], 2, 2, 0.22, LM, -0.51, 0.24, -0.68, false);
  legoBrick(parts[2], 2, 1, 0.16, LD, -0.51, 0.21, -0.28, true);
  legoBrick(parts[2], 2, 2, 0.32, L2, -0.51, 0.51, -0.68, false);
  // 3: Back-Right Leg
  legoBrick(parts[3], 2, 2, 0.22, LM, 0.51, 0.24, -0.68, false);
  legoBrick(parts[3], 2, 1, 0.16, LD, 0.51, 0.21, -0.28, true);
  legoBrick(parts[3], 2, 2, 0.32, L2, 0.51, 0.51, -0.68, false);

  // 4..10: Plump, Chubby Horizontal Lego Body (5 studs wide x 6 studs long, low-slung)
  // 4: Belly baseplate
  legoBrick(parts[4], 3, 5, 0.22, L3, 0, 0.62, 0, false);
  // 5: Lower body rear course
  legoBrick(parts[5], 5, 3, 0.34, L1, 0, 0.86, -0.51, false);
  // 6: Lower body front chest course + flush cream chest plate
  legoBrick(parts[6], 5, 3, 0.34, L1, 0, 0.86, 0.51, false);
  legoBrick(parts[6], 3, 1, 0.64, L3, 0, 1.02, 0.88, false);
  // 7: Mid body left flank + chubby side plate
  legoBrick(parts[7], 2, 6, 0.34, L2, -0.51, 1.20, 0, false);
  legoBrick(parts[7], 1, 4, 0.56, L1, -0.92, 1.06, -0.10, true);
  // 8: Mid body right flank + center core + chubby side plate
  legoBrick(parts[8], 2, 6, 0.34, L2, 0.51, 1.20, 0, false);
  legoBrick(parts[8], 1, 6, 0.34, L1, 0, 1.20, 0, false);
  legoBrick(parts[8], 1, 4, 0.56, L1, 0.92, 1.06, -0.10, true);
  // 9: Upper back rear course with top studs + rounded rump brick
  legoBrick(parts[9], 5, 3, 0.32, L1, 0, 1.53, -0.51, true);
  legoBrick(parts[9], 3, 1, 0.38, L2, 0, 1.20, -1.12, true);
  // 10: Upper back middle/shoulder course with top studs
  legoBrick(parts[10], 5, 2, 0.32, L1, 0, 1.53, 0.22, true);

  // 11..17: Compact, Wide Lego Capybara Head Sitting Directly on the Shoulders (no long neck!)
  // 11: Wide lower head & jaw base sitting right on the front shoulders
  legoBrick(parts[11], 5, 3, 0.34, L2, 0, 1.48, 0.88, false);
  // 12: Mid head & chubby cheeks (5 studs wide)
  legoBrick(parts[12], 5, 3, 0.36, L1, 0, 1.83, 0.88, false);
  // 13: Wide flat Capybara forehead & cranium with top studs
  legoBrick(parts[13], 5, 3, 0.36, L1, 0, 2.19, 0.85, true);
  // 14: Blunt Cocoa-Brown Lego Snout / Muzzle (lower course)
  legoBrick(parts[14], 3, 2, 0.36, LM, 0, 1.62, 1.42, false);
  // 15: Blunt Cocoa-Brown Lego Snout / Muzzle (upper bridge, nostrils & mouth tiles)
  legoBrick(parts[15], 3, 2, 0.38, LM, 0, 1.99, 1.42, true);
  box(parts[15], 0.12, 0.08, 0.04, LI, -0.16, 2.02, 1.77, 0.01);
  box(parts[15], 0.12, 0.08, 0.04, LI, 0.16, 2.02, 1.77, 0.01);
  box(parts[15], 0.06, 0.26, 0.04, LI, 0, 1.84, 1.77, 0.01);
  box(parts[15], 0.24, 0.06, 0.04, LI, 0, 1.70, 1.77, 0.01);

  // 16: Cute Dark Square Lego Eyes on Front/Sides + Rosy Cheek Tiles
  [-1, 1].forEach(side => {
    // Front-corner dark Lego eye block
    box(parts[16], 0.16, 0.18, 0.16, LI, side * 0.62, 2.02, 1.32, 0.02);
    // White Lego eye gleam tile
    box(parts[16], 0.06, 0.06, 0.17, '#ffffff', side * 0.59, 2.05, 1.33, 0.01);
    // Rosy cheek tile
    box(parts[16], 0.14, 0.10, 0.16, '#f29385', side * 0.68, 1.80, 1.28, 0.015);
  });

  // 17: Blocky Cocoa-Brown Lego Ears on top-back corners of the head
  [-0.56, 0.56].forEach(ex => {
    legoBrick(parts[17], 1, 1, 0.28, LM, ex, 2.50, 0.52, true);
    box(parts[17], 0.18, 0.16, 0.05, '#c78f6c', ex, 2.48, 0.69, 0.01);
  });

  // 18: Cute Lego Reading Stand & Open Book beside the Lego Capybara
  legoBrick(parts[18], 2, 2, 0.28, C.wood, -1.55, 0.26, 1.15, false);
  legoBrick(parts[18], 3, 2, 0.12, '#94b8c8', -1.55, 0.46, 1.15, false);
  legoBrick(parts[18], 3, 2, 0.10, '#fffdf8', -1.55, 0.56, 1.15, true);

  // 19: Garden Flowers around the Lego Capybara
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6 + 0.4;
    flower(parts[19], Math.sin(a) * 1.85, 0.18, Math.cos(a) * 1.65, ['#f6d98e', '#e5b1c5', '#fff1d1'][i % 3], 0.95);
  }

  // 20: Royal Golden Lego Crown on top of the Lego Capybara's Head
  legoBrick(parts[20], 2, 2, 0.18, C.gold, 0, 2.46, 0.92, true);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    mesh(parts[20], new THREE.ConeGeometry(0.08, 0.22, 4), C.gold, Math.sin(a) * 0.22, 2.66, 0.92 + Math.cos(a) * 0.22);
  }

  stage.traverse(obj => { obj.userData.isCapy = true; });
  parts.forEach((g, i) => { g.visible = i < count; });
  return parts;
}

type FloatingHeart = {
  mesh: THREE.Mesh;
  startTime: number;
  duration: number;
  baseY: number;
  vx: number;
  vz: number;
};

const Scene = forwardRef<SceneHandle, Props>(function Scene({ world, pieces, rainy = false, animatePiece = false, miniature = false, rewardPiece = false, onCapyPet }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<SceneHandle>({ rotate: () => {}, zoom: () => {}, reset: () => {} });
  const [failed, setFailed] = useState(false);
  const { resolvedTheme } = useTheme();
  const applyAppearance = useRef<(dark: boolean) => void>(() => {});
  useImperativeHandle(ref, () => ({ rotate: d => api.current.rotate(d), zoom: d => api.current.zoom(d), reset: () => api.current.reset() }), []);
  // The callback reaches the running scene through a ref, so a re-rendered parent never rebuilds it.
  const callbacks = useRef({ onCapyPet });
  useEffect(() => { callbacks.current = { onCapyPet }; });

  useEffect(() => {
    const element = host.current; if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { setFailed(true); return; }
    setFailed(false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    renderer.shadowMap.enabled = !miniature; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('aria-hidden', 'true'); renderer.domElement.style.touchAction = 'pan-y'; element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, .1, 60); camera.position.set(7.8, 6.2, 9); camera.lookAt(0, 1.3, 0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.25, 0);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minPolarAngle = .5;
    controls.maxPolarAngle = 1.38;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

    renderer.domElement.style.touchAction = 'pan-y pinch-zoom';
    if (miniature) controls.enabled = false;

    const touchStart = (e: TouchEvent) => { controls.enabled = e.touches.length > 1 && !miniature; };
    const touchEnd = () => { controls.enabled = !miniature; };
    renderer.domElement.addEventListener('touchstart', touchStart, { passive: true });
    renderer.domElement.addEventListener('touchend', touchEnd, { passive: true });
    renderer.domElement.addEventListener('touchcancel', touchEnd, { passive: true });

    const hemisphere = new THREE.HemisphereLight('#fff4de', '#b0b69a', 1.8); scene.add(hemisphere);
    const sun = new THREE.DirectionalLight('#fff4dc', 3.0); sun.position.set(-4, 9, 6); sun.castShadow = !miniature; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -6; sun.shadow.camera.right = 6; sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -6; sun.shadow.normalBias = .025; sun.shadow.bias = -.0003; sun.shadow.radius = 5; scene.add(sun);
    const fill = new THREE.DirectionalLight('#e6e0ff', .8); fill.position.set(5, 4, -5); scene.add(fill);

    const root = new THREE.Group(); root.position.y = -.35; root.rotation.y = -.15; scene.add(root);
    const decor = new THREE.Group(); root.add(decor);
    box(decor, 7.05, .52, 5.95, C.earth, 0, -.27, 0, .6);
    box(decor, 7.13, .22, 6.03, C.grass, 0, .02, 0, .6);
    for (let i = 0; i < 22; i++) { const a = i * Math.PI * 2 / 22; ball(decor, .2 + (i % 3) * .04, ['#c0ce91','#c9d79c','#b7ca87'][i % 3], Math.cos(a) * 3.32, .08, Math.sin(a) * 2.75, [1.3, .6, 1.1]); }
    tree(decor, -2.65, -1.35, 1.05, world === 1);
    // The cottage's own tree (piece 16) grows where the small decor tree stands, so it replaces it.
    if (!(world === 0 && pieces >= 16)) tree(decor, 2.55, -1.75, .65, world === 1);
    const doorLane = (x: number, z: number) => world !== 2 && inKeepClear(x, z);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39, bx = Math.sin(a) * 2.75, bz = Math.cos(a) * 2.15;
      if (Math.hypot(bx - CLEAR_X, bz - CLEAR_Z) > 0.92 && !doorLane(bx, bz)) ball(decor, .26, ['#a9bf80','#b5c98d'][i % 2], bx, .25, bz, [1.3, .85, 1]);
    }
    for (let i = 0; i < 13; i++) {
      const a = i * 2.4, fx = Math.sin(a) * (2.6 + (i % 2) * .2), fz = Math.cos(a) * 2.3;
      if (Math.hypot(fx - CLEAR_X, fz - CLEAR_Z) > 0.88 && !doorLane(fx, fz)) flower(decor, fx, .17, fz, ['#f7dd9b','#e9b7c2','#f4e4cc'][i % 3], .6 + i % 3 * .18);
    }
    for (let i = 0; i < 4; i++) { const stone = cylinder(decor, .25, .06, '#f1e0bb', .05 + Math.sin(i * .8) * .2, .17, 1.65 + i * .36); stone.scale.set(1.25, 1, .67); }
    const pond = cylinder(decor, .63, .05, '#e6d3a9', 2.5, .17, 1.1); pond.scale.set(1, 1, 1.45);
    const water = cylinder(decor, .52, .055, C.water, 2.5, .2, 1.1); water.scale.set(1, 1, 1.45);

    const cottage = world === 0 ? buildCottage(root, pieces) : null;
    const parts = cottage ? cottage.parts : world === 1 ? buildTree(root, pieces) : buildLego(root, pieces);
    // The cottage's window panes glow while Capy is home: one clone of the shared glass material, so other scenes stay unlit.
    const windowGlass: THREE.MeshStandardMaterial[] = [];
    if (cottage) {
      const glass = material(C.glass).clone(); windowGlass.push(glass);
      for (const i of [6, 7, 8]) parts[i].traverse(o => { if (o.userData.glass) (o as THREE.Mesh).material = glass; });
    }
    let pieceExtent = 1;
    if (rewardPiece) {
      const part = parts[Math.min(20, Math.max(0, pieces - 1))];
      root.children.forEach(child => { child.visible = child === part || child.children.includes(part); });
      if (part.parent && part.parent !== root) {
        part.parent.children.forEach(sibling => { sibling.visible = sibling === part; });
      }
      root.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(part), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
      root.position.sub(center); controls.target.set(0, 0, 0); camera.position.set(5, 4, 6); camera.lookAt(0, 0, 0);
      pieceExtent = Math.max(.55, size.x, size.y, size.z) * .8;
    }
    const floor = mesh(scene, new THREE.PlaneGeometry(200, 200), rainy ? '#e5e9e6' : '#edf0e4', 0, -.93, 0); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.visible = !rewardPiece;
    const floorMaterial = new THREE.MeshStandardMaterial({ roughness: .9 }); floor.material = floorMaterial;

    const heartGeo = createHeartGeometry();
    const heartMat = new THREE.MeshStandardMaterial({ color: '#f26d85', roughness: .4, emissive: '#f26d85', emissiveIntensity: 0.2 });
    const hearts: FloatingHeart[] = [];
    let capy: WorldCapy | null = null;
    const heartsAt = new THREE.Vector3();

    // Capy's face reacts in the logo; the world answers a tap with hearts.
    function triggerCapyReaction() {
      const reaction = nextPokeReaction();
      callbacks.current.onCapyPet?.(reaction);
      if (reaction !== 'Grumpy') floatHearts();
      render();
    }

    function floatHearts() {
      if (world === 2) heartsAt.set(0, 2.5, .8);
      else if (capy) decor.worldToLocal(capy.headTop(heartsAt));
      else return;
      const cx = heartsAt.x, cy = heartsAt.y, cz = heartsAt.z;
      for (let i = 0; i < 4; i++) {
        const hMesh = new THREE.Mesh(heartGeo, heartMat);
        hMesh.position.set(cx + (Math.random() - 0.5) * 0.45, cy + i * 0.08, cz + (Math.random() - 0.5) * 0.45);
        hMesh.rotation.y = Math.random() * Math.PI;
        hMesh.scale.setScalar(0.001);
        decor.add(hMesh);
        hearts.push({
          mesh: hMesh,
          startTime: performance.now() + i * 90,
          duration: 1100,
          baseY: cy + i * 0.08,
          vx: (Math.random() - 0.5) * 0.3,
          vz: (Math.random() - 0.5) * 0.3,
        });
      }
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    /** Visible meshes under the pointer (a hidden piece or a Capy hidden indoors is skipped). */
    function hitsAt(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      return raycaster.intersectObjects(root.children, true).filter(h => { for (let o: THREE.Object3D | null = h.object; o; o = o.parent) if (!o.visible) return false; return true; });
    }
    const isHittingCapy = (e: PointerEvent) => hitsAt(e).some(h => h.object.userData?.isCapy);

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) return;
      const hits = hitsAt(e);
      if (hits.some(h => h.object.userData?.isCapy)) {
        if (capy?.tap() !== false) triggerCapyReaction();
      } else if (capy && hits.some(h => h.object.userData?.isHouse) && capy.knock()) render();
    };

    const onPointerMove = (e: PointerEvent) => {
      renderer.domElement.style.cursor = isHittingCapy(e) ? 'pointer' : '';
    };

    if (!miniature) {
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
    }

    let frame = 0; let disposed = false; let visible = true; let animationStart = 0; let lastTime = 0;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animated = animatePiece && pieces > 0 && !reducedMotion ? parts[Math.min(20, pieces - 1)] : null;
    let landed = !animated;
    // Cottage piece 20 is Capy's crown; from then on, and in every later world, Capy wears it.
    // While that piece is dropping in, it stays a separate piece until it lands on Capy, who waits under it.
    const crowned = world > 0 || pieces >= 20;
    let crownLanded = !(world === 0 && animated === parts[19]);
    // What the world Capy's brain senses: where the camera is (in root space), rain, and the hour.
    const cameraDir = new THREE.Vector3(), rootTurn = new THREE.Quaternion();
    let hour = localHour(), hourAt = performance.now();
    function sense(time: number): Sense {
      if (time - hourAt > 60_000) { hour = localHour(); hourAt = time; }
      cameraDir.copy(camera.position).sub(controls.target).applyQuaternion(rootTurn.copy(root.quaternion).invert());
      return { cameraYaw: Math.atan2(cameraDir.x, cameraDir.z), rainy, hour };
    }
    function wearCrown() {
      if (!capy || !crowned || !crownLanded) return;
      capy.setCrowned(true);
      if (world === 0) parts[19].visible = false;
    }

    // At most one frame is ever pending: every request goes through `again`, or callbacks would multiply each frame.
    const again = () => { if (!frame) frame = requestAnimationFrame(draw); };
    const draw = (time = performance.now()) => {
      frame = 0; if (disposed || !visible) { lastTime = 0; return; }
      const delta = lastTime ? Math.min(.1, (time - lastTime) / 1000) : 0; lastTime = time;
      controls.update();

      if (animated) {
        if (!animationStart) animationStart = time;
        const progress = Math.min(1, (time - animationStart) / 850);
        animated.position.y = (1 - Math.pow(progress, .4)) * 3.5;
        if (progress < 1) again();
        else if (!landed) { landed = true; crownLanded = true; wearCrown(); capy?.pieceLanded(); }
      }

      // Reduced motion and effects (smoke, sparkles) ask for frames even when the loop would otherwise stop.
      if (capy?.update(delta, sense(time))) again();
      if (import.meta.env.DEV && capy && element.dataset.capy !== capy.describe()) element.dataset.capy = capy.describe();

      if (hearts.length > 0) {
        for (let i = hearts.length - 1; i >= 0; i--) {
          const h = hearts[i];
          if (time < h.startTime) continue;
          const p = (time - h.startTime) / h.duration;
          if (p >= 1) {
            decor.remove(h.mesh);
            hearts.splice(i, 1);
          } else {
            const scale = Math.sin(p * Math.PI) * 1.35;
            h.mesh.scale.setScalar(scale);
            h.mesh.position.y = h.baseY + p * 0.85;
            h.mesh.position.x += h.vx * 0.015;
            h.mesh.position.z += h.vz * 0.015;
            h.mesh.rotation.y += 0.04;
          }
        }
        again();
      }

      renderer.render(scene, camera);

      if (!disposed && visible && !miniature && !reducedMotion) again();
    };

    const render = () => { if (!disposed) again(); };

    applyAppearance.current = dark => {
      renderer.toneMappingExposure = dark ? .95 : 1.05;
      hemisphere.intensity = dark ? 1.1 : 1.8;
      hemisphere.color.set(dark ? '#d1c6ed' : '#fff4de');
      hemisphere.groundColor.set(dark ? '#777b83' : '#b0b69a');
      sun.intensity = rainy ? (dark ? .85 : 1.5) : (dark ? 1.65 : 3);
      sun.color.set(dark ? '#eddbbf' : '#fff4dc');
      fill.intensity = dark ? 1.1 : .8;
      fill.color.set(rainy ? '#aab8cf' : dark ? '#c5b9e8' : '#e6e0ff');
      floorMaterial.color.set(rainy ? (dark ? '#282d34' : '#e5e9e6') : getComputedStyle(document.documentElement).getPropertyValue('--color-scene').trim());
      render();
    };
    applyAppearance.current(resolvedTheme === 'dark');

    const resize = () => {
      const { width, height } = element.getBoundingClientRect(); if (!width || !height) return;
      renderer.setSize(width, height); const aspect = width / height;
      const extent = rewardPiece ? pieceExtent : miniature ? Math.max(3.2, 4.8 / aspect) : Math.max(3.35, 4.8 / aspect);
      camera.left = -extent * aspect; camera.right = extent * aspect; camera.top = extent; camera.bottom = -extent;
      camera.updateProjectionMatrix(); render();
    };

    controls.addEventListener('change', render);
    const observer = new ResizeObserver(resize); observer.observe(element);
    const intersection = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) render();
    });
    intersection.observe(element);

    const initialPosition = camera.position.clone();
    api.current = {
      rotate: d => {
        const offset = camera.position.clone().sub(controls.target);
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), d * .3);
        camera.position.copy(controls.target).add(offset);
        controls.update();
        render();
      },
      zoom: d => {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom + d * .18, .75, 1.6);
        camera.updateProjectionMatrix();
        render();
      },
      reset: () => {
        camera.position.copy(initialPosition);
        camera.zoom = 1;
        camera.updateProjectionMatrix();
        controls.update();
        render();
      },
    };

    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        api.current.zoom(e.deltaY > 0 ? -1 : 1);
      }
    };
    renderer.domElement.addEventListener('wheel', wheel, { passive: false });
    const onLost = (e: Event) => { e.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('webglcontextlost', onLost);

    // Things around the house and garden that the world Capy uses or sets off.
    function fixtures(): WorldFixtures {
      const plants: WorldFixtures['plants'] = [];
      const flowersOf = (part: THREE.Object3D) => part.children.forEach(c => { if (c instanceof THREE.Group) plants.push({ at: { x: c.position.x, z: c.position.z }, objects: [c], amp: .09 }); });
      if (cottage) {
        flowersOf(parts[16]); flowersOf(parts[17]);
        return {
          door: pieces >= 7 ? cottage.entrance : undefined,
          windows: windowGlass,
          chimney: pieces >= 13 ? new THREE.Vector3(.68, 3.95, -.6) : undefined,
          mailFlag: pieces >= 19 ? { object: cottage.flag, up: -Math.PI / 2 } : undefined,
          plants,
        };
      }
      if (pieces >= 7) plants.push({ at: { x: 0, z: 0 }, objects: parts.slice(6, 14), amp: .02, radius: 1 });
      for (let i = 17; i < 21; i++) flowersOf(parts[i]);
      return { windows: [], plants };
    }
    // The 3D Capy (public/models/capy.glb) lives in the cottage and tree worlds. The Lego world is itself a giant
    // capybara, so Capy steps aside there.
    function attachCapy(gltf: GLTF, popIn: boolean) {
      if (disposed || world === 2) return;
      capy = createWorldCapy(gltf, {
        world: world === 0 ? 0 : 1, pieces, parent: decor, fixtures: fixtures(),
        mode: miniature ? 'still' : reducedMotion ? 'reduced' : 'live',
        popIn, crownDrop: world === 0 && animated === parts[19] && !landed, freshPiece: !!animated,
        crowned: crowned && crownLanded, sense: sense(performance.now()),
      });
      wearCrown();
      render();
    }
    if (world !== 2 && !rewardPiece) {
      const cached = loadedCapyModel();
      // A first visit with a door starts indoors (Capy steps out), so only an outdoor first appearance pops in.
      const startsIndoors = world === 0 && pieces >= 7 && !capyMemory(0);
      if (cached) attachCapy(cached, false);
      else loadCapyModel().then(gltf => attachCapy(gltf, !startsIndoors), error => console.warn('Capy could not load; showing the world without Capy.', error));
    }

    resize();

    return () => {
      disposed = true; applyAppearance.current = () => {}; cancelAnimationFrame(frame);
      // Detach Capy before disposing scene geometry: its geometry and materials are shared with other scenes through the model cache.
      capy?.dispose(); capy = null;
      windowGlass.forEach(m => m.dispose()); (cottage?.entrance.portal.material as THREE.Material | undefined)?.dispose();
      observer.disconnect(); intersection.disconnect(); controls.dispose(); floorMaterial.dispose();
      heartGeo.dispose(); heartMat.dispose();
      if (!miniature) {
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
      }
      renderer.domElement.removeEventListener('touchstart', touchStart);
      renderer.domElement.removeEventListener('touchend', touchEnd);
      renderer.domElement.removeEventListener('touchcancel', touchEnd);
      renderer.domElement.removeEventListener('wheel', wheel);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);

      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse(o => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          geometries.add(o.geometry);
          if (o instanceof THREE.LineSegments) (o.material as THREE.Material).dispose();
        }
      });
      geometries.forEach(g => g.dispose());
      renderer.dispose();
      // Free the context now: past 16, Chrome drops the oldest one, which would be the logo's.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [world, pieces, rainy, animatePiece, miniature, rewardPiece]);

  useEffect(() => { applyAppearance.current(resolvedTheme === 'dark'); }, [resolvedTheme]);

  return <div className={`scene-render ${miniature ? 'miniature' : ''}`} ref={host} role={failed ? undefined : "img"} aria-label={failed ? undefined : rewardPiece ? `New building piece, number ${pieces}` : `${['Capy Cottage', 'Magic Tree', 'Lego Capybara'][world]}: built ${pieces} out of 21 pieces. You can use the buttons below to rotate and zoom.`}>
    {failed && <div className="scene-fallback"><img src="/capy-scholar.png" width="88" height="88" alt="Capy" /><strong>Your creation is still right here with you.</strong><p>Your device doesn't support 3D yet. You can still write and earn pieces as usual.</p><button className="button secondary" onClick={() => location.reload()}><RotateCcw size={16} /> Reload model</button></div>}
  </div>;
});
export default Scene;
