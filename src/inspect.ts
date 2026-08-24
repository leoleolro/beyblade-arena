import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildBeyMesh } from './render/beyMesh';
import type { BeyParts } from './render/beyMesh';
import { renderInked } from './render/outlineHull';
import { studioEnvironment } from './render/environment';
import { addFresnelRim } from './render/rimMetal';
import {
  finishImported,
  loadTopModel,
  normaliseToRadius,
  seatOnOrigin,
} from './render/topModels';
import { topModelFor } from './render/topModelIndex';
import { skinById } from './render/skins';
import { themeById } from './render/theme';
import type { Theme } from './render/theme';
import { rosterThemes } from './modes';
import { BEY_PRESETS } from './render/beydex';
import { groupByClass } from './render/beyClass';
import { DISCS, DRIVERS, LAYERS, deriveStats, makeBuild } from './sim/parts';
import type { BeyBuild } from './sim/types';

/**
 * The bey inspector: every top in the roster, up close, in every roster look.
 *
 * WHY IT IS A PAGE AND NOT A DEV HARNESS. What stood here was a debug strip —
 * four fixed camera pitches, a hardcoded IMPORTED button and a console.log —
 * and, more to the point, it was **not in the production build at all**. Vite
 * builds `index.html` and nothing else unless the inputs are named, so a page
 * that worked perfectly in `vite dev` and was linked from the title screen
 * simply 404'd for every player. See vite.config.ts.
 *
 * The beyblade designs are the part of this game that took longest and matter
 * most, and until now there was nowhere to actually LOOK at one. Judging a top
 * meant starting a match and squinting at a 50px object mid-fight.
 *
 * WHAT IT SHOWS, and why each of those:
 *
 *  - **Every bey, always.** No unlock gate. A tool for judging artwork that
 *    hides most of the artwork behind ladder progress is not a tool.
 *  - **Every roster look, and only those.** A top is built differently per
 *    theme — `toon` chooses between the designed construction and the plain
 *    metal one — so "does this look right" has an answer per look and the page
 *    has to be able to ask each of them. Overdrive's look is not among them:
 *    it is a kept prototype, not part of the roster, and this page is for
 *    judging the designs. See modes.ts.
 *  - **Exploded, on demand.** Top, middle and bottom are separately designed
 *    parts. Assembled hides two thirds of that work.
 *  - **Real orbit.** Fixed pitches answer whatever question they were chosen
 *    for and no others; a silhouette problem tends to live at the angle nobody
 *    picked.
 *
 * It shares the game's construction path exactly — `buildBeyMesh`, the imported
 * model swap, the theme's own outline pass — so a top that is broken here is
 * broken in a match, and vice versa.
 */

/* -------------------------------------------------------------------- dom */

const canvas = document.getElementById('view') as HTMLCanvasElement;
const stage = document.getElementById('stage') as HTMLElement;
const rosterEl = document.getElementById('roster') as HTMLElement;
const themesEl = document.getElementById('themes') as HTMLElement;
const detailEl = document.getElementById('detail') as HTMLElement;
const explodeBtn = document.getElementById('explode') as HTMLButtonElement;
const spinBtn = document.getElementById('spin') as HTMLButtonElement;

/* ------------------------------------------------------------ three setup */

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 40);
const root = new THREE.Group();
scene.add(root);

const hemi = new THREE.HemisphereLight(0xffffff, 0x202838, 1.2);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(1.4, 2.4, 1.7);
scene.add(key);
const rimA = new THREE.DirectionalLight(0xffffff, 1.1);
rimA.position.set(-1.7, 0.7, -1.2);
scene.add(rimA);
const rimB = new THREE.DirectionalLight(0xffffff, 0.8);
rimB.position.set(1.5, 0.4, -1.5);
scene.add(rimB);

// Built lazily on the first cel theme, like the arena does — an OutlineEffect
// constructed for a theme that never draws ink is a wasted program.
let outline: OutlineEffect | null = null;

/* ----------------------------------------------------------------- state */

let theme: Theme = rosterThemes()[0];
let build: BeyBuild = makeBuild(BEY_PRESETS[0].layerId, 'gravity', 'atomic');
let mesh: THREE.Group | null = null;
let parts: BeyParts | null = null;
let exploded = false;
let spinning = true;

/** Guards a slow model landing on a bey the viewer has since changed away from. */
let modelToken = 0;

/** Orbit, in the same yaw/pitch/distance terms the garage preview uses. */
let yaw = 0.7;
let pitch = 0.5;
let dist = 0.62;
/** Eased multiplier on `dist`, so exploding pulls back smoothly. */
let zoom = 1;

/** How far apart the three parts sit when exploded, in mesh units. */
const SEPARATION = 0.09;

/* ------------------------------------------------------------------ build */

function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (!m.isMesh) return;
    // Imported geometry is shared with the loader cache and outlives this view.
    if (!m.userData.imported) m.geometry?.dispose();
    const list = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of list) mat?.dispose();
  });
}

function rebuild(): void {
  if (mesh) {
    root.remove(mesh);
    disposeTree(mesh);
  }

  mesh = buildBeyMesh(build, skinById('frost'), theme.toon);
  parts = mesh.userData.parts as BeyParts;
  root.add(mesh);

  // Same rim the arena gives procedural tops, so a bey looks here exactly as it
  // does in a match rather than subtly better.
  if (theme.topRimStrength > 0) {
    const rim = { colour: theme.topRimColour, strength: theme.topRimStrength };
    mesh.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of list) {
        if ((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) addFresnelRim(mat, rim);
      }
    });
  }

  const entry = topModelFor(build.layer.id);
  if (entry) {
    const token = ++modelToken;
    const held = parts;
    void loadTopModel(entry.url).then((src) => {
      if (!src || token !== modelToken || !held) return;
      const model = src.clone(true);
      normaliseToRadius(model, build.layer.radius);
      seatOnOrigin(model);
      finishImported(
        model,
        theme.modelTint,
        studioEnvironment(renderer),
        entry.finish,
        theme.envIntensity,
        { colour: theme.topRimColour, strength: theme.topRimStrength },
      );
      model.traverse((c) => {
        c.userData.imported = true;
      });
      held.layer.clear();
      held.layer.add(model);
      // An imported model replaces the WHOLE top, so there is no middle or
      // bottom left to explode. Saying so is better than showing a stack that
      // is not what the player gets — see topModels.ts.
      held.disc.visible = false;
      held.driver.visible = false;
      layout();
      renderDetail();
    });
  }

  applyTheme();
  layout();
  renderDetail();
}

/** True while an imported model is standing in for the whole top. */
const modelled = (): boolean => topModelFor(build.layer.id) !== undefined;

function layout(): void {
  if (!parts) return;
  const gap = exploded && !modelled() ? SEPARATION : 0;
  parts.driver.position.y = -gap;
  parts.disc.position.y = 0;
  parts.layer.position.y = gap;
}

function applyTheme(): void {
  scene.background = new THREE.Color(theme.background);
  // The theme's own light colours, but at inspector intensities: this is a
  // catalogue, so a top must be legible even in the theme whose arena is
  // deliberately almost black.
  hemi.color.setHex(theme.hemiSky);
  hemi.groundColor.setHex(theme.hemiGround);
  hemi.intensity = theme.toon ? 1.6 : 1.15;
  key.intensity = theme.toon ? 2.2 : 2.4;
  rimA.color.setHex(theme.rimAColour);
  rimB.color.setHex(theme.rimBColour);
}

/* ----------------------------------------------------------------- detail */

function renderDetail(): void {
  const stats = deriveStats(build);
  const rows: string[] = [];

  const part = (
    label: string,
    name: string,
    note: string,
    hidden = false,
  ): string =>
    `<div class="part"><h3>${label} — ${escapeHtml(name)}${
      hidden ? ' <span style="color:#8698b8">(hidden)</span>' : ''
    }</h3><p>${escapeHtml(note)}</p></div>`;

  const hide = modelled();
  rows.push(
    part(
      'TOP',
      build.layer.name,
      `${build.layer.archetype} · ${build.layer.blades} blades · atk ${build.layer.attack} · def ${build.layer.defense}`,
    ),
  );
  rows.push(
    part(
      'MIDDLE',
      build.disc.name,
      `${build.disc.mass}kg · stability ${build.disc.stability}`,
      hide,
    ),
  );
  rows.push(
    part(
      'BOTTOM',
      build.driver.name,
      `${build.driver.archetype} · spin ${build.driver.spinRetention} · aggro ${build.driver.wander}`,
      hide,
    ),
  );

  if (hide) {
    rows.push(
      `<p style="color:#8698b8;font-size:11px;margin-top:8px">An imported model replaces the whole top, so the middle and bottom still decide how it flies but are not drawn.</p>`,
    );
  }

  rows.push('<h2 style="margin-top:14px">DERIVED</h2>');
  const show: [string, number][] = [
    ['mass', stats.mass],
    ['radius', stats.radius],
    ['attack', stats.attack],
    ['defense', stats.defense],
    ['burst resist', stats.burstResist],
    ['spin steal', stats.spinSteal],
    ['friction', stats.friction],
    ['stability', stats.stability],
  ];
  for (const [k, v] of show) {
    rows.push(`<div class="row"><span>${k}</span><b>${v.toFixed(2)}</b></div>`);
  }

  detailEl.innerHTML = rows.join('');
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/* ------------------------------------------------------------------- menus */

function buildRoster(): void {
  // Named presets first — those are the beys as designed — then the raw layer
  // list for anything the preset table does not cover.
  const seen = new Set<string>();
  const all: { id: string; name: string }[] = [];
  const collect = (id: string, name: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    all.push({ id, name });
  };
  for (const p of BEY_PRESETS) collect(p.layerId, p.name);
  for (const l of LAYERS) collect(l.id, l.name);

  // GROUPED BY CLASS: Legendary (imported) and Epic (designed here). A flat
  // list of eleven names says nothing about which of them are the ones somebody
  // modelled in a 3D tool and which were built part by part in this repo, and
  // that distinction is the first thing an inspector should make visible.
  let first: HTMLButtonElement | null = null;
  for (const group of groupByClass(all, (b) => b.id)) {
    const h = document.createElement('h2');
    h.textContent = group.info.label;
    h.style.color = `#${group.info.colour.toString(16).padStart(6, '0')}`;
    rosterEl.appendChild(h);

    const sub = document.createElement('div');
    sub.textContent = group.info.blurb;
    sub.style.cssText = 'color:#8698b8;font-size:10px;margin:-4px 4px 6px';
    rosterEl.appendChild(sub);

    for (const item of group.items) {
      const b = document.createElement('button');
      b.textContent = item.name;
      b.dataset.layer = item.id;
      b.addEventListener('click', () => {
        build = makeBuild(item.id, build.disc.id, build.driver.id);
        for (const el of rosterEl.querySelectorAll('[data-layer]')) el.classList.remove('on');
        b.classList.add('on');
        rebuild();
      });
      rosterEl.appendChild(b);
      first ??= b;
    }
  }
  first?.classList.add('on');
  // Start on whatever the first group offers, so the opening view matches the
  // highlighted entry rather than defaulting to a bey further down the list.
  if (first?.dataset.layer) build = makeBuild(first.dataset.layer, build.disc.id, build.driver.id);
}

/**
 * Look buttons — the ROSTER's looks only.
 *
 * Overdrive is excluded by its owner's instruction: it is a kept prototype to
 * look back at rather than part of the roster, and this page is for judging
 * designs. The exclusion is by mode rather than by a hardcoded id here, so a
 * theme that later joins or leaves the prototype changes in one place. See
 * modes.ts.
 *
 * The row hides itself at one option. A picker with a single choice is not a
 * picker; it is a label that looks clickable.
 */
function buildThemeButtons(): void {
  const looks = rosterThemes();
  if (looks.length < 2) {
    // Hide the LABEL too, not just the buttons — a lone "THEME" caption with
    // nothing beside it reads as a control that failed to load.
    (document.getElementById('themes-group') ?? themesEl).hidden = true;
    return;
  }
  for (const t of looks) {
    const b = document.createElement('button');
    b.textContent = t.name;
    b.className = t.id === theme.id ? 'on' : '';
    b.addEventListener('click', () => {
      theme = themeById(t.id);
      for (const el of themesEl.children) el.classList.remove('on');
      b.classList.add('on');
      rebuild();
    });
    themesEl.appendChild(b);
  }
}

/**
 * Part pickers for the middle and bottom.
 *
 * The roster changes the TOP, which is what carries a bey's identity. These let
 * the other two be swapped without leaving the page, because "top middle
 * bottom" is the build and judging one slot in isolation is judging a third of
 * the object.
 */
function buildSlotPickers(): void {
  const mk = (title: string, items: { id: string; name: string }[], slot: 'disc' | 'driver'): void => {
    const heading = document.createElement('h2');
    heading.textContent = title;
    rosterEl.appendChild(heading);
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.name;
      b.dataset.slot = slot;
      b.className = build[slot].id === it.id ? 'on' : '';
      b.addEventListener('click', () => {
        build =
          slot === 'disc'
            ? makeBuild(build.layer.id, it.id, build.driver.id)
            : makeBuild(build.layer.id, build.disc.id, it.id);
        for (const el of rosterEl.querySelectorAll(`[data-slot="${slot}"]`)) {
          el.classList.remove('on');
        }
        b.classList.add('on');
        rebuild();
      });
      rosterEl.appendChild(b);
    }
  };

  mk('MIDDLE', DISCS, 'disc');
  mk('BOTTOM', DRIVERS, 'driver');
}

/* -------------------------------------------------------------- interaction */

function bindOrbit(): void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.01;
    // Clamped short of vertical: past it the model flips and reads as a bug.
    pitch = Math.max(-0.4, Math.min(1.45, pitch + (e.clientY - lastY) * 0.006));
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const up = (e: PointerEvent): void => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      dist = Math.max(0.26, Math.min(1.6, dist * (1 + Math.sign(e.deltaY) * 0.12)));
    },
    { passive: false },
  );
}

explodeBtn.addEventListener('click', () => {
  exploded = !exploded;
  explodeBtn.classList.toggle('on', exploded);
  layout();
});

spinBtn.addEventListener('click', () => {
  spinning = !spinning;
  spinBtn.classList.toggle('on', spinning);
});

/* ------------------------------------------------------------------- frame */

function resize(): void {
  const w = stage.clientWidth || 640;
  const h = stage.clientHeight || 480;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (spinning && parts) {
    // Opposed rates, as the garage does: parts turning in unison read as a
    // turntable, opposed ones read as a mechanism.
    parts.layer.rotation.y += dt * 0.55;
    parts.disc.rotation.y -= dt * 0.34;
    parts.driver.rotation.y += dt * 1.1;
  }

  // Pull back while exploded, and ease rather than jump. The stack is roughly
  // 2 x SEPARATION taller than the assembled top, so at the assembled distance
  // the driver falls off the bottom of the frame — which reads as the view
  // being broken rather than as parts being far apart.
  const wantZoom = exploded && !modelled() ? 1.5 : 1;
  zoom += (wantZoom - zoom) * Math.min(1, dt * 8);
  const d = dist * zoom;

  const cx = Math.sin(yaw) * Math.cos(pitch) * d;
  const cy = Math.sin(pitch) * d;
  const cz = Math.cos(yaw) * Math.cos(pitch) * d;
  camera.position.set(cx, cy, cz);
  camera.lookAt(0, 0.1, 0);

  if (theme.toon) {
    outline ??= new OutlineEffect(renderer, {
      defaultThickness: 0.014,
      defaultColor: [0.02, 0.02, 0.05],
      defaultAlpha: 1,
    });
    renderInked(renderer, outline, scene, camera);
  } else {
    renderer.render(scene, camera);
  }

  requestAnimationFrame(tick);
}

buildThemeButtons();
buildRoster();
buildSlotPickers();
bindOrbit();
resize();
rebuild();
requestAnimationFrame(tick);
