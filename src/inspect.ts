import * as THREE from 'three';
import {
  MODEL_TINT,
  finishAsMetal,
  loadTopModel,
  normaliseToRadius,
  seatOnOrigin,
} from './render/topModels';
import { renderInked } from './render/outlineHull';
import { studioEnvironment } from './render/environment';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildBeyMesh } from './render/beyMesh';
import { BEY_PRESETS } from './render/beydex';
import { skinById } from './render/skins';
import { makeBuild } from './sim/parts';

/**
 * A dev-only bench for looking at every bey side by side.
 *
 * The garage canvas is small and shows one top at a time, and the arena is
 * moving — neither is any use for judging a silhouette. This renders the whole
 * roster at once with a pitch control, because the questions that keep coming
 * up about these meshes ("is the side profile flat?", "do these two read as
 * different?") are only answerable by looking at them together, held still,
 * from a chosen angle.
 *
 * Reached at /inspect.html in dev. Not linked from the game.
 */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1322);

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const outline = new OutlineEffect(renderer, {
  defaultThickness: 0.008,
  defaultColor: [0.02, 0.02, 0.05],
  defaultAlpha: 1,
});

// The anime theme's rig, so what shows here is what shows in a match.
scene.add(new THREE.HemisphereLight(0xffffff, 0x51648c, 1.5));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2.2, 4.2, 1.8);
scene.add(key);

const root = new THREE.Group();
scene.add(root);

// One at a time, filling the frame. A grid was unreadable at the scale that
// matters: judging whether a side profile is a flat slab or a tiered moulding
// needs the model big, not ten models small.
const tops: THREE.Group[] = BEY_PRESETS.map((p) => {
  const build = makeBuild(p.layerId, p.discId, p.driverId);
  const mesh = buildBeyMesh(build, skinById(p.skinId), true);
  mesh.visible = false;
  root.add(mesh);
  return mesh;
});

// The imported top, appended to the roster so it can be compared with the
// procedural version of the same bey at the same size, held still.
void loadTopModel('models/wonder_valtryek_beyblade/scene.gltf').then((src) => {
  if (!src) return;
  const g = new THREE.Group();
  g.add(src.clone(true));
  normaliseToRadius(g, 0.1066);
  seatOnOrigin(g);
  finishAsMetal(g, MODEL_TINT, studioEnvironment(renderer));
  const box = new THREE.Box3().setFromObject(g);
  const size = new THREE.Vector3();
  box.getSize(size);
  console.log(
    `[import] after normalise: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}` +
      `  (a procedural layer is ~0.213 wide and ~0.24 tall)`,
  );
  g.visible = false;
  root.add(g);
  tops.push(g);
  const btn = document.createElement('button');
  btn.textContent = 'IMPORTED';
  btn.addEventListener('click', () => {
    current = tops.length - 1;
    for (const b of picker?.children ?? []) b.classList.remove('on');
    btn.classList.add('on');
  });
  picker?.appendChild(btn);
});

let current = 0;
const picker = document.getElementById('picker');
BEY_PRESETS.forEach((p, i) => {
  const btn = document.createElement('button');
  btn.textContent = p.name;
  btn.className = i === 0 ? 'on' : '';
  btn.addEventListener('click', () => {
    current = i;
    for (const b of picker?.children ?? []) b.classList.remove('on');
    btn.classList.add('on');
  });
  picker?.appendChild(btn);
});

let pitch = 0.62;
let spinning = true;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // updateStyle left on: the canvas has no CSS size of its own here, so
  // without it the element displays at its intrinsic size and the render
  // occupies one corner of the page.
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-pitch]')) {
  btn.addEventListener('click', () => {
    pitch = Number(btn.dataset.pitch);
    for (const b of document.querySelectorAll('[data-pitch]')) b.classList.remove('on');
    btn.classList.add('on');
  });
}
document.getElementById('spin')?.addEventListener('click', (e) => {
  spinning = !spinning;
  (e.target as HTMLElement).classList.toggle('on', spinning);
});

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  for (let i = 0; i < tops.length; i++) {
    tops[i].visible = i === current;
    if (spinning && i === current) tops[i].rotation.y += dt * 0.9;
  }

  const dist = 0.62;
  camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  camera.lookAt(0, 0.11, 0);

  renderInked(renderer, outline, scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
