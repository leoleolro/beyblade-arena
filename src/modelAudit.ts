import * as THREE from 'three';
import { TOP_MODELS } from './render/topModelIndex';
import { instantiateModel, loadTopModel, normaliseToRadius, seatOnOrigin } from './render/topModels';
import { isDiscLike, uprightAxis } from './render/motion';
import { LAYERS } from './sim/parts';

/**
 * Audit every imported model, in one command.
 *
 * WHY THIS EXISTS. Four models were imported and one was looked at, in one
 * viewer, at one angle. Two of the four stood vertically in the dish and a
 * third rendered 38% oversized. Every one of those was findable in seconds by
 * anything that checked all four, and nothing did.
 *
 * WHAT IT CATCHES THAT A BOUNDING BOX ALONE DOES NOT. The oversized one was a
 * `SkinnedMesh` whose bones were exported mid-animation, and
 * `Box3.setFromObject` computes a skinned mesh's box from the BIND POSE — it
 * does not run the skinning. So the box agreed with every other measurement and
 * with nothing on screen. This runs the real preparation path
 * (`normaliseToRadius`, which now rest-poses and uprights, then `seatOnOrigin`)
 * and measures the result, so it sees what the player sees.
 *
 * Reported per model, with a verdict rather than raw numbers, because the point
 * is to be readable at a glance by someone who has just dropped a file in:
 *
 *   width      should match the layer's diameter within 10%
 *   upright    the spin axis must be the flat one, confidently
 *   seated     the lowest point should touch y = 0
 *   rig        skinned meshes and leftover animation clips, which are the
 *              single most common cause of a model that measures fine and
 *              draws wrong
 *
 * Run `__models()` in the console. No `?shot` needed — it reads geometry, not
 * pixels.
 */

interface Row {
  bey: string;
  ok: boolean;
  notes: string[];
}

const pct = (a: number, b: number): number => (b === 0 ? 0 : Math.abs(a - b) / b);

export async function auditModels(): Promise<Row[]> {
  const rows: Row[] = [];

  for (const [layerId, entry] of Object.entries(TOP_MODELS)) {
    const notes: string[] = [];
    const layer = LAYERS.find((l) => l.id === layerId);
    if (!layer) {
      rows.push({ bey: layerId, ok: false, notes: ['no LAYERS entry — bey does not exist in the sim'] });
      continue;
    }

    const src = await loadTopModel(entry.url);
    if (!src) {
      rows.push({ bey: layerId, ok: false, notes: [`failed to load ${entry.url}`] });
      continue;
    }

    const model = instantiateModel(src);

    // THE INVARIANT NO BOUNDING BOX CAN SEE: a skinned mesh's bones must live
    // inside the model it skins.
    //
    // A SkinnedMesh draws its vertices from BONE matrices, not from its own
    // transform. `Object3D.clone()` does not rebind skeletons, so a naively
    // cloned model keeps pointing at the loader cache's bones — which are never
    // added to the scene and sit at the world origin. The mesh then follows the
    // bey correctly in every measurement while its geometry is drawn at the
    // centre of the dish. That is a whole class of bug that is invisible to
    // size, axis and seating checks, because all three measure the OBJECT and
    // the GPU is reading the BONES.
    const detached: string[] = [];
    model.traverse((c) => {
      const sm = c as THREE.SkinnedMesh;
      if (!sm.isSkinnedMesh || !sm.skeleton) return;
      for (const bone of sm.skeleton.bones) {
        let root: THREE.Object3D = bone;
        while (root.parent) root = root.parent;
        let meshRoot: THREE.Object3D = sm;
        while (meshRoot.parent) meshRoot = meshRoot.parent;
        if (root !== meshRoot) {
          detached.push(sm.name || 'mesh');
          break;
        }
      }
    });
    if (detached.length) {
      notes.push(
        `${detached.length} mesh(es) skinned to bones OUTSIDE the model ` +
          `(${detached.slice(0, 3).join(', ')}) — will draw at the world origin`,
      );
    }

    // Rig report BEFORE preparation, since preparation is what neutralises it.
    let skinned = 0;
    model.traverse((c) => {
      if ((c as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
    });
    if (skinned > 0) {
      notes.push(`${skinned} skinned mesh(es) — rest-posed on import; box would otherwise lie`);
    }

    // Axis, read from the raw model so the note describes what ARRIVED.
    const raw = new THREE.Vector3();
    new THREE.Box3().setFromObject(model).getSize(raw);
    const up = uprightAxis(raw.x, raw.y, raw.z);
    if (!isDiscLike(up)) {
      notes.push(
        `not disc-shaped (dominance ${up.dominance.toFixed(2)}) — uprighting declined, check by eye`,
      );
    } else if (up.axis !== 'y') {
      notes.push(`arrived ${up.axis.toUpperCase()}-up — rotated to Y`);
    }

    // The real path, in the real order.
    normaliseToRadius(model, layer.radius);
    seatOnOrigin(model);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const target = layer.radius * 2;
    const widest = Math.max(size.x, size.z);
    const err = pct(widest, target);
    if (err > 0.1) {
      notes.push(
        `width ${widest.toFixed(3)} vs expected ${target.toFixed(3)} — ${(err * 100) | 0}% out`,
      );
    }

    if (Math.abs(box.min.y) > 0.01) {
      notes.push(`sits at y ${box.min.y.toFixed(3)}, not on the floor`);
    }

    // Flat side up: after preparation the height must be the small dimension.
    if (size.y > Math.min(size.x, size.z)) {
      notes.push(`taller (${size.y.toFixed(3)}) than wide — still on its side`);
    }

    rows.push({ bey: layerId, ok: notes.every((n) => !/vs expected|not on the floor|on its side|failed|declined|OUTSIDE the model/.test(n)), notes });
  }

  return rows;
}

/** Console-friendly wrapper: prints a table and returns the rows. */
export async function showModelAudit(): Promise<Row[]> {
  const rows = await auditModels();
  for (const r of rows) {
    const tag = r.ok ? 'OK  ' : 'FAIL';
    // eslint-disable-next-line no-console
    console.log(`${tag} ${r.bey}${r.notes.length ? ' — ' + r.notes.join('; ') : ''}`);
  }
  const bad = rows.filter((r) => !r.ok).length;
  // eslint-disable-next-line no-console
  console.log(`${rows.length - bad}/${rows.length} models pass`);
  return rows;
}
