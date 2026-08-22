import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildBeyMesh } from './beyMesh';
import type { BeyParts } from './beyMesh';
import { buildSpinBlur } from './spinBlur';
import { designByLayer } from './beydex';
import { skinById } from './skins';
import { THEMES } from './theme';
import type { Theme } from './theme';
import { renderInked } from './outlineHull';
import { studioEnvironment } from './environment';
import { finishImported, loadTopModel, MODEL_TINT, normaliseToRadius, seatOnOrigin } from './topModels';
import { topModelFor } from './topModelIndex';
import { LAYERS, makeBuild } from '../sim/parts';

/**
 * Every bey, in every theme, in one picture.
 *
 * WHY THIS EXISTS, in the owner's words: "you need to do these visual debugs
 * without me coming to you everytime." That is a fair complaint about a real
 * process failure. Checking a rendering change by hand means driving the game
 * into one state, screenshotting, reading it, and repeating — so in practice
 * one or two states get checked and the other thirty do not. The bugs then
 * surface as a screenshot from the owner.
 *
 * The specific failure that prompted it is instructive. Swapping the procedural
 * top from the cel construction to the metal one left `buildSpinBlur` placing
 * its disc against the CEL layer's height constants, so the anime theme drew a
 * translucent dome floating in the air above every bey. Thirty-three
 * combinations, one of them visibly broken, and nothing in the build was ever
 * going to say so — but it is instantly obvious in a grid.
 *
 * WHAT IT DELIBERATELY IS NOT. It does not judge. There is no "looks wrong"
 * heuristic here, because the interesting failures — a blur in mid-air, a top
 * that reads as a rock, a finish that dissolves into the floor — are all things
 * a person recognises in a glance and a threshold does not. Its whole job is to
 * put every case in front of the eye at once, cheaply enough that it happens
 * before every visual commit rather than after a complaint.
 *
 * It exercises the REAL construction path — `buildBeyMesh`, the imported-model
 * swap, the theme's own lights and render path including the outline pass — so
 * a bug that only appears in one theme still appears here.
 */

/** Edge of one cell, in device pixels. */
const CELL = 240;

/** Grid gutter and the strip of label above each row. */
const PAD = 10;
const LABEL = 22;

interface Cell {
  layerId: string;
  theme: Theme;
}

/**
 * Light a scene the way the theme lights the arena.
 *
 * Not a copy of `ArenaRenderer`'s rig, and deliberately simpler: the point is
 * to see the TOP, so this is the theme's own hemisphere and rim colours at the
 * theme's own intensities, with a key light added for legibility. A cell that
 * reproduced the arena exactly would also reproduce its dark corners, and half
 * the grid would be unreadable.
 */
function lightFor(scene: THREE.Scene, theme: Theme): void {
  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.toon ? 1.6 : 1.1);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, theme.toon ? 2.2 : 2.4);
  key.position.set(1.3, 2.4, 1.6);
  scene.add(key);

  const rimA = new THREE.DirectionalLight(theme.rimAColour, Math.min(theme.rimAIntensity, 2.2));
  rimA.position.set(-1.6, 0.7, -1.1);
  scene.add(rimA);

  const rimB = new THREE.DirectionalLight(theme.rimBColour, Math.min(theme.rimBIntensity, 1.6));
  rimB.position.set(1.4, 0.5, -1.4);
  scene.add(rimB);
}

/** Build one top exactly as the arena would, model swap included. */
async function buildCell(
  gl: THREE.WebGLRenderer,
  cell: Cell,
): Promise<{ scene: THREE.Scene; camera: THREE.PerspectiveCamera; dispose: () => void }> {
  const layer = LAYERS.find((l) => l.id === cell.layerId);
  const radius = layer?.radius ?? 0.106;
  const build = makeBuild(cell.layerId, 'gravity', 'atomic');
  const group = buildBeyMesh(build, skinById('frost'), cell.theme.toon);
  const parts = group.userData.parts as BeyParts;

  // The spin blur, on exactly the condition arena.ts uses. This is the whole
  // reason the sheet catches the floating-dome bug: leave it out and the grid
  // agrees with a broken build.
  const entry = topModelFor(cell.layerId);
  if (cell.theme.toon && !entry) {
    const blur = buildSpinBlur(designByLayer(cell.layerId), radius, parts.layer, build.layer.blades);
    group.add(blur.mesh);
    // Drive it to the state a fast top is in, which is when it dominates.
    blur.update(1, 1 / 60);
  }

  if (entry) {
    const src = await loadTopModel(entry.url);
    if (src) {
      const model = src.clone(true);
      normaliseToRadius(model, radius);
      seatOnOrigin(model);
      finishImported(
        model,
        MODEL_TINT,
        studioEnvironment(gl),
        entry.finish,
        cell.theme.envIntensity,
      );
      parts.layer.clear();
      parts.layer.add(model);
      parts.disc.visible = false;
      parts.driver.visible = false;
    }
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(cell.theme.background);
  scene.add(group);
  lightFor(scene, cell.theme);

  // Frame the whole assembly, blur included — a disc floating a body's height
  // above the top has to stay IN the picture or the bug hides outside it.
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
  const fov = (camera.fov * Math.PI) / 180;
  const need = Math.max(size.x, size.y, size.z) * 1.5;
  const dist = need / 2 / Math.tan(fov / 2);
  camera.position.set(dist * 0.45, dist * 0.5, dist * 0.74);
  camera.lookAt(centre);

  return {
    scene,
    camera,
    dispose(): void {
      group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Geometry from an imported model is shared with the loader cache and
        // must survive; everything else here was built for this cell.
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of list) m?.dispose();
      });
    },
  };
}

/**
 * Render the whole grid and return it as a PNG data URL.
 *
 * One renderer and one outline pass for the entire sheet. Thirty-three WebGL
 * contexts would exceed the browser's limit several times over; one context
 * drawing thirty-three times does not.
 */
export async function contactSheet(
  layerIds: string[] = LAYERS.map((l) => l.id),
): Promise<string> {
  const cells: Cell[] = [];
  for (const theme of THEMES) for (const layerId of layerIds) cells.push({ layerId, theme });

  const cols = layerIds.length;
  const rows = THEMES.length;

  const sheet = document.createElement('canvas');
  sheet.width = cols * (CELL + PAD) + PAD;
  sheet.height = rows * (CELL + PAD + LABEL) + PAD;
  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  const canvas = document.createElement('canvas');
  canvas.width = CELL;
  canvas.height = CELL;
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  gl.setSize(CELL, CELL, false);

  // Matches the arena's outline settings, so an inking bug looks the same here
  // as it does in a match.
  const outline = new OutlineEffect(gl, {
    defaultThickness: 0.014,
    defaultColor: [0.02, 0.02, 0.05],
    defaultAlpha: 1,
  });

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const built = await buildCell(gl, cell);

    if (cell.theme.toon) renderInked(gl, outline, built.scene, built.camera);
    else gl.render(built.scene, built.camera);

    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (CELL + PAD);
    const y = PAD + row * (CELL + PAD + LABEL) + LABEL;

    ctx.drawImage(canvas, x, y);
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`${cell.theme.id} · ${cell.layerId}`, x, y - 6);

    built.dispose();
  }

  gl.dispose();
  return sheet.toDataURL('image/png');
}

/**
 * Render the sheet and put it on screen, replacing the page.
 *
 * On screen rather than downloaded because the reader is usually an agent
 * driving a browser, and a screenshot of the page is the cheapest way for it to
 * actually look at thirty-three cells. A human gets the same thing and can
 * right-click it.
 */
export async function showContactSheet(layerIds?: string[]): Promise<void> {
  const url = await contactSheet(layerIds);
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#0b0e14;overflow:auto';
  const img = new Image();
  img.src = url;
  img.style.cssText = 'display:block;width:100%;height:auto';
  document.body.appendChild(img);
  await img.decode();
}
