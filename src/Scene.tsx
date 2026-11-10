import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RotateCcw } from 'lucide-react';
import { useTheme } from './theme';

export type SceneHandle = { rotate: (direction: number) => void; zoom: (direction: number) => void; reset: () => void };
type Props = {
  world: number;
  pieces: number;
  rainy?: boolean;
  animatePiece?: boolean;
  miniature?: boolean;
  rewardPiece?: boolean;
  onCapyPet?: () => void;
};
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

export type CapyRefs = {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  book: THREE.Group;
  leftEar: THREE.Group;
  rightEar: THREE.Group;
};

function capy(parent: THREE.Object3D, x: number, z: number, size = 1, crowned = false): CapyRefs {
  const root = new THREE.Group();
  root.position.set(x, 0.14, z);
  // Camera is at (+7.8, +6.2, +9.0), so rotation.y = +0.42 faces 3/4 toward the viewer (angled slightly left, matching the 2D reference art!)
  root.rotation.y = 0.42;
  root.scale.setScalar(size);
  root.userData.isCapy = true;
  parent.add(root);

  const body = new THREE.Group();
  body.userData.isCapy = true;
  root.add(body);

  const fur = '#e5a365';
  const furShade = '#cf884d';
  const furLight = '#f3bf8b';
  const muzzleColor = '#8f5e3e';
  const pawColor = '#7d4f33';
  const earInner = '#c78f6c';
  const darkInk = '#22150e';
  const bookCover = '#94b8c8';
  const bookSpine = '#6a90a4';
  const bookPages = '#fffdf8';

  // 1. Continuous Plump Pear/Potato Body (seamless back-to-head contour)
  ball(body, 0.50, fur, 0, 0.42, -0.06, [1.08, 0.94, 1.06]);
  ball(body, 0.45, fur, 0, 0.70, -0.05, [1.02, 0.98, 1.02]);
  ball(body, 0.40, fur, 0, 0.90, -0.04, [0.96, 0.92, 0.96]);
  ball(body, 0.36, furLight, 0, 0.45, 0.16, [0.85, 0.88, 0.65]);

  // 2. Smooth Loaf-Shaped Capybara Head
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.02);
  head.userData.isCapy = true;
  body.add(head);

  // Unified cranium and blunt snout loaf
  ball(head, 0.38, fur, 0, 0.12, -0.03, [1.04, 0.95, 1.08]);
  box(head, 0.58, 0.48, 0.58, fur, 0, 0.08, 0.12, 0.23);
  ball(head, 0.35, fur, 0, 0.02, 0.06, [1.10, 0.78, 1.0]);

  // Arched cocoa-brown muzzle patch nestled smoothly into the front of the snout
  ball(head, 0.25, muzzleColor, 0, 0.06, 0.25, [0.92, 1.06, 0.70]);

  // Nostrils (\ /), vertical philtrum (|), and inverted-V mouth (/\) on the front of the muzzle patch
  const nL = box(head, 0.064, 0.024, 0.022, darkInk, -0.065, 0.165, 0.422, 0.008);
  nL.rotation.z = -0.45;
  const nR = box(head, 0.064, 0.024, 0.022, darkInk, 0.065, 0.165, 0.422, 0.008);
  nR.rotation.z = 0.45;
  box(head, 0.025, 0.135, 0.022, darkInk, 0, 0.065, 0.426, 0.008);
  const mL = box(head, 0.058, 0.024, 0.022, darkInk, -0.024, -0.002, 0.42, 0.008);
  mL.rotation.z = 0.40;
  const mR = box(head, 0.058, 0.024, 0.022, darkInk, 0.024, -0.002, 0.42, 0.008);
  mR.rotation.z = -0.40;

  // Calm, focused horizontal scholar eyes visible behind the spectacles + rosy cheeks
  [-1, 1].forEach(side => {
    const eyeLine = box(head, 0.095, 0.026, 0.025, darkInk, side * 0.16, 0.22, 0.355, 0.01);
    eyeLine.rotation.y = side * 0.28;
    eyeLine.rotation.z = side * 0.10;
    ball(head, 0.032, darkInk, side * 0.16, 0.205, 0.36, [1.1, 0.85, 0.8]);
    ball(head, 0.058, '#f29385', side * 0.26, 0.09, 0.28, [0.6, 0.45, 0.5]);
  });

  // Round Scholar Glasses with thin wire rims and subtle translucent glass lenses
  const glassesGroup = new THREE.Group();
  glassesGroup.position.set(0, 0.225, 0.385);
  glassesGroup.rotation.x = -0.18;
  head.add(glassesGroup);

  const glassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.26, roughness: 0.15 });
  [-0.145, 0.145].forEach((gx, idx) => {
    const lensDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.008, 24), glassMat);
    lensDisc.position.set(gx, 0, -0.002);
    lensDisc.rotation.x = Math.PI / 2;
    lensDisc.rotation.y = idx === 0 ? -0.12 : 0.12;
    glassesGroup.add(lensDisc);
    const rim = mesh(glassesGroup, new THREE.TorusGeometry(0.104, 0.015, 12, 28), darkInk, gx, 0, 0);
    rim.rotation.y = idx === 0 ? -0.12 : 0.12;
  });
  box(glassesGroup, 0.085, 0.018, 0.018, darkInk, 0, 0.01, 0.004, 0.006);

  // Distinct Rounded Capybara Ears at top-back corners of head
  const leftEar = new THREE.Group();
  leftEar.position.set(-0.22, 0.35, -0.12);
  leftEar.rotation.set(-0.22, 0, -0.32);
  head.add(leftEar);
  ball(leftEar, 0.125, pawColor, 0, 0, 0, [0.82, 1.18, 0.55]);
  ball(leftEar, 0.075, earInner, 0, -0.01, 0.035, [0.70, 0.95, 0.35]);

  const rightEar = new THREE.Group();
  rightEar.position.set(0.22, 0.35, -0.12);
  rightEar.rotation.set(-0.22, 0, 0.32);
  head.add(rightEar);
  ball(rightEar, 0.125, pawColor, 0, 0, 0, [0.82, 1.18, 0.55]);
  ball(rightEar, 0.075, earInner, 0, -0.01, 0.035, [0.70, 0.95, 0.35]);

  // 3. Open Book Held Clearly in Front of Chest
  const book = new THREE.Group();
  book.position.set(0, 0.49, 0.54);
  book.rotation.x = -0.38;
  body.add(book);

  box(book, 0.06, 0.38, 0.038, bookSpine, 0, 0, -0.02, 0.01);
  const leftCover = box(book, 0.30, 0.38, 0.030, bookCover, -0.15, 0, 0.022, 0.01);
  leftCover.rotation.y = 0.32;
  const rightCover = box(book, 0.30, 0.38, 0.030, bookCover, 0.15, 0, 0.022, 0.01);
  rightCover.rotation.y = -0.32;
  const leftPage = box(book, 0.28, 0.37, 0.038, bookPages, -0.14, 0.025, -0.002, 0.008);
  leftPage.rotation.y = 0.32;
  const rightPage = box(book, 0.28, 0.37, 0.038, bookPages, 0.14, 0.025, -0.002, 0.008);
  rightPage.rotation.y = -0.32;

  // Chubby Arms & 3-Fingered Cocoa Paws Clasping the Book
  const armL = ball(body, 0.14, furShade, -0.35, 0.54, 0.22, [0.85, 0.95, 1.38]);
  armL.rotation.y = 0.35;
  const armR = ball(body, 0.14, furShade, 0.35, 0.54, 0.22, [0.85, 0.95, 1.38]);
  armR.rotation.y = -0.35;

  [-1, 1].forEach(side => {
    const paw = new THREE.Group();
    paw.position.set(side * 0.27, 0.48, 0.57);
    paw.rotation.y = side * -0.25;
    body.add(paw);
    ball(paw, 0.088, pawColor, 0, 0, 0, [1.15, 0.90, 0.88]);
    [-0.042, 0, 0.042].forEach(fy => {
      ball(paw, 0.036, pawColor, -side * 0.06, fy, 0.022, [1.25, 0.82, 0.92]);
    });
  });

  // 4. Prominent 3-Toed Sitting Feet at the Bottom Front
  [-1, 1].forEach(side => {
    const foot = new THREE.Group();
    foot.position.set(side * 0.28, 0.12, 0.38);
    foot.rotation.set(-0.25, side * -0.22, 0);
    body.add(foot);
    ball(foot, 0.128, pawColor, 0, 0, 0, [0.96, 0.75, 1.38]);
    [-0.052, 0, 0.052].forEach(tx => {
      ball(foot, 0.042, pawColor, tx, 0.04, 0.13, [0.88, 0.98, 1.12]);
      box(foot, 0.018, 0.048, 0.045, darkInk, tx + (tx === 0 ? 0.024 : tx * 0.4), 0.04, 0.14, 0.005);
    });
  });

  // 5. Golden Crown when World > 0
  if (crowned) {
    cylinder(head, 0.15, 0.09, C.gold, 0, 0.40, -0.02);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      mesh(head, new THREE.ConeGeometry(0.048, 0.15, 5), C.gold, Math.cos(a) * 0.12, 0.49, -0.02 + Math.sin(a) * 0.12);
    }
  }

  root.traverse(obj => { obj.userData.isCapy = true; });
  return { root, body, head, book, leftEar, rightEar };
}

function windowRound(parent: THREE.Object3D, x: number, y: number, z: number, radius = .34) {
  const glass = cylinder(parent, radius, .075, C.glass, x, y, z); glass.rotation.x = Math.PI / 2;
  const ring = mesh(parent, new THREE.TorusGeometry(radius, .065, 8, 32), C.trim, x, y, z + .06);
  box(parent, radius * 1.8, .055, .07, C.trim, x, y, z + .09, .01);
  box(parent, .055, radius * 1.8, .07, C.trim, x, y, z + .09, .01); return ring;
}
function arch(parent: THREE.Object3D, x: number, y: number, z: number) {
  const s = new THREE.Shape(); s.moveTo(-.4, 0); s.lineTo(.4, 0); s.lineTo(.4, 1); s.absarc(0, 1, .4, 0, Math.PI, false); s.lineTo(-.4, 0);
  mesh(parent, new THREE.ExtrudeGeometry(s, { depth: .12, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .025, bevelThickness: .025 }), C.wood, x, y, z);
  for (let i = -1; i <= 1; i++) box(parent, .016, 1.13, .02, '#bc8d59', x + i * .21, y + .63, z + .15, .003);
  ball(parent, .055, C.gold, x + .24, y + .62, z + .19);
  windowRound(parent, x, y + 1.02, z + .13, .19);
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
  arch(parts[6], 0, .36, 1.43);
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
  for (let i = 0; i < 5; i++) { ball(parts[16], .25, ['#a8bf7e','#bdcf91'][i % 2], -1.1 + i * .19, .43, 1.62); flower(parts[16], -1.1 + i * .19, .58, 1.8, C.flower, .65); }
  for (let i = 0; i < 10; i++) flower(parts[17], 1.6 + Math.sin(i * 2) * .38, .21, 1.8 + Math.cos(i * 2) * .4, ['#e5b1c5','#f6d98e','#fff1d1'][i % 3], .8);
  cylinder(parts[18], .055, .73, C.wood, 1.8, .48, 2.13); box(parts[18], .39, .29, .3, '#df9d92', 1.8, .97, 2.13); box(parts[18], .2, .03, .03, C.cream, 1.8, 1, 2.3);
  cylinder(parts[19], .2, .1, C.gold, -1.72, 1.29, 1.8);
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; mesh(parts[19], new THREE.ConeGeometry(.06, .18, 5), C.gold, -1.72 + Math.cos(a) * .17, 1.41, 1.8 + Math.sin(a) * .17); }
  box(parts[20], .7, .4, .1, '#e5c79b', -2.35, .84, 2.1); box(parts[20], .08, .65, .08, C.wood, -2.35, .39, 2.1);
  for (let i = 0; i < 3; i++) box(parts[20], .34 - i * .05, .025, .02, '#9a7852', -2.35, .95 - i * .1, 2.16, .003);
  parts.forEach((g, i) => { g.visible = i < count; });
  if (count < 13 && count >= 10) {
    const ghost = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.48, 1.12, .48)), new THREE.LineBasicMaterial({ color: '#9b967a', transparent: true, opacity: .45 }));
    ghost.position.set(.68, 3.25, -.6); root.add(ghost);
  }
  return parts;
}
function buildTree(root: THREE.Group, count: number) {
  const parts = Array.from({ length: 21 }, () => { const g = new THREE.Group(); root.add(g); return g; });
  cylinder(parts[0], .45, .2, '#bc9468', 0, .2, 0);
  for (let i = 1; i < 6; i++) cylinder(parts[i], .3 - i * .025, .55, C.wood, Math.sin(i) * .08, .25 + i * .5, 0);
  for (let i = 6; i < 14; i++) { const a = (i - 6) * 2.4; ball(parts[i], .8, ['#e7afc0','#efc5cf','#dda0b9'][i % 3], Math.sin(a) * .95, 2.8 + Math.cos(a * 2) * .45, Math.cos(a) * .8); }
  box(parts[14], 1.15, .6, .5, '#d8b98b', -1.5, .45, .8);
  for (let i = 0; i < 8; i++) box(parts[14], .09, .3 + (i % 3) * .06, .22, ['#b7b0d0','#e3a997','#adc39a'][i % 3], -1.95 + i * .13, .88, .8, .01);
  cylinder(parts[15], .6, .13, C.trim, 1.4, .75, 1.2); cylinder(parts[15], .08, .6, C.wood, 1.4, .4, 1.2);
  box(parts[16], .65, .15, .45, '#d6b283', 1.45, .35, 2);
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
    tree(decor, -2.65, -1.35, 1.05, world === 1); tree(decor, 2.55, -1.75, .65, world === 1);
    for (let i = 0; i < 9; i++) { const a = i * 2.39; ball(decor, .26, ['#a9bf80','#b5c98d'][i % 2], Math.sin(a) * 2.75, .25, Math.cos(a) * 2.15, [1.3, .85, 1]); }
    for (let i = 0; i < 13; i++) { const a = i * 2.4; flower(decor, Math.sin(a) * (2.6 + (i % 2) * .2), .17, Math.cos(a) * 2.3, ['#f7dd9b','#e9b7c2','#f4e4cc'][i % 3], .6 + i % 3 * .18); }
    for (let i = 0; i < 4; i++) { const stone = cylinder(decor, .25, .06, '#f1e0bb', .05 + Math.sin(i * .8) * .2, .17, 1.65 + i * .36); stone.scale.set(1.25, 1, .67); }
    const pond = cylinder(decor, .63, .05, '#e6d3a9', 2.5, .17, 1.1); pond.scale.set(1, 1, 1.45);
    const water = cylinder(decor, .52, .055, C.water, 2.5, .2, 1.1); water.scale.set(1, 1, 1.45);

    // Build the cute scholar Capybara sitting and reading with glasses (hidden in World 3 where the giant Lego Capybara takes center stage, matching the concept art)
    const capyRefs = capy(decor, -1.72, 1.8, .90, world > 0);
    capyRefs.root.visible = world !== 2;

    const parts = world === 0 ? buildCottage(root, pieces) : world === 1 ? buildTree(root, pieces) : buildLego(root, pieces);
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
    let bounceStart = 0;

    function triggerCapyReaction() {
      bounceStart = performance.now();
      const cx = world === 2 ? 0 : -1.72;
      const cy = world === 2 ? 2.5 : 1.15;
      const cz = world === 2 ? 0.8 : 1.8;
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
      onCapyPet?.();
      render();
    }

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    function isHittingCapy(e: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(root.children, true);
      return hits.some(h => h.object.visible && h.object.userData?.isCapy);
    }

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 6) return;
      if (isHittingCapy(e)) {
        triggerCapyReaction();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      renderer.domElement.style.cursor = isHittingCapy(e) ? 'pointer' : '';
    };

    if (!miniature) {
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
    }

    let frame = 0; let disposed = false; let visible = true; let animationStart = 0;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animated = animatePiece && pieces > 0 && !reducedMotion ? parts[Math.min(20, pieces - 1)] : null;

    const draw = (time = performance.now()) => {
      frame = 0; if (disposed || !visible) return;
      controls.update();

      if (animated) {
        if (!animationStart) animationStart = time;
        const progress = Math.min(1, (time - animationStart) / 850);
        animated.position.y = (1 - Math.pow(progress, .4)) * 3.5;
        if (progress < 1) frame = requestAnimationFrame(draw);
      }

      if (bounceStart > 0) {
        const elapsed = (time - bounceStart) / 1000;
        if (elapsed < 0.65) {
          const bounce = Math.sin(elapsed * Math.PI / 0.65) * Math.sin(elapsed * 12) * 0.20;
          capyRefs.root.position.y = 0.14 + Math.max(0, bounce);
          capyRefs.head.rotation.x = Math.sin(elapsed * 12) * 0.12;
          capyRefs.leftEar.rotation.z = -0.32 + Math.sin(elapsed * 16) * 0.22;
          capyRefs.rightEar.rotation.z = 0.32 - Math.sin(elapsed * 16) * 0.22;
          frame = requestAnimationFrame(draw);
        } else {
          capyRefs.root.position.y = 0.14;
          capyRefs.head.rotation.x = 0;
          capyRefs.leftEar.rotation.z = -0.32;
          capyRefs.rightEar.rotation.z = 0.32;
          bounceStart = 0;
        }
      }

      if (!miniature && !reducedMotion && bounceStart === 0 && capyRefs.root.visible) {
        const idle = Math.sin(time * 0.0022) * 0.012;
        capyRefs.body.position.y = idle;
        capyRefs.head.rotation.x = Math.sin(time * 0.0016) * 0.025;
        capyRefs.book.rotation.x = -0.38 + Math.sin(time * 0.0022) * 0.02;

        const twitch = (time % 3800) / 3800;
        if (twitch > 0.88 && twitch < 0.96) {
          const w = Math.sin((twitch - 0.88) / 0.08 * Math.PI * 4) * 0.15;
          capyRefs.leftEar.rotation.z = -0.32 + w;
          capyRefs.rightEar.rotation.z = 0.32 - w;
        }
      }

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
        frame = requestAnimationFrame(draw);
      }

      renderer.render(scene, camera);

      if (!disposed && visible && !miniature && !reducedMotion && !frame) {
        frame = requestAnimationFrame(draw);
      }
    };

    const render = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw); };

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

    resize();

    return () => {
      disposed = true; applyAppearance.current = () => {}; cancelAnimationFrame(frame);
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
      renderer.domElement.remove();
    };
  }, [world, pieces, rainy, animatePiece, miniature, rewardPiece, onCapyPet]);

  useEffect(() => { applyAppearance.current(resolvedTheme === 'dark'); }, [resolvedTheme]);

  return <div className={`scene-render ${miniature ? 'miniature' : ''}`} ref={host} role={failed ? undefined : "img"} aria-label={failed ? undefined : rewardPiece ? `Mảnh xây dựng mới, số ${pieces}` : `${['Nhà Capybara', 'Cây Thần Kỳ', 'Lego Capybara'][world]}: đã xây ${pieces} trong 21 mảnh. Có thể dùng các nút bên dưới để xoay và phóng to.`}>
    {failed && <div className="scene-fallback"><img src="/capy-scholar.png" width="88" height="88" alt="Capy" /><strong>Công trình vẫn ở đây, cùng bạn.</strong><p>Thiết bị chưa hiển thị được 3D. Bạn vẫn có thể viết bài và nhận mảnh như thường.</p><button className="button secondary" onClick={() => location.reload()}><RotateCcw size={16} /> Tải lại mô hình</button></div>}
  </div>;
});
export default Scene;
