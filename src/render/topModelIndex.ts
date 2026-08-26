/**
 * Which beys have an imported model.
 *
 * One line per bey, and that is the whole registration step. A layer id with no
 * entry keeps its procedural mesh, so the game runs identically with this map
 * empty — which is how it shipped before the first file arrived.
 *
 * The path is relative to `public/`, which vite serves at the site root. Any of
 * `.glb`, `.gltf` or `.stl` works; see `topModels.ts` for why STL is allowed
 * despite being the format you would normally refuse.
 *
 * ATTRIBUTION IS PART OF THE ENTRY, not a comment beside it. A CC-BY model must
 * be credited wherever the work is shared, and a credit that lives only in a
 * downloaded licence.txt is a credit nobody will ever see. Putting it in the
 * data means the UI can render it and it cannot quietly go missing when the
 * folder is tidied.
 */
/**
 * What to do with the colour a model arrives carrying.
 *
 * `silver` throws the model's materials away and applies one machined finish.
 * `own` keeps the authored materials and upgrades them to metal — same
 * roughness and reflection treatment, but each part keeps the colour the
 * modeller gave it.
 *
 * An explicit field rather than a heuristic. "Does this model have colour worth
 * keeping" is not answerable from the file: Valtryek arrives with a flat grey
 * behind a glTF extension three no longer supports, and Gemstone arrives with
 * six materials that are also mostly grey but whose blacks are deliberate
 * panelling. A guess would get one of those wrong every time the guess changed.
 */
export type ModelFinish = 'silver' | 'own';

export interface TopModel {
  /** Path under `public/`. */
  url: string;
  /** Full credit line, if the model requires one. Rendered in the garage. */
  credit?: string;
  /** Defaults to `silver`. */
  finish?: ModelFinish;
}

export const TOP_MODELS: Record<string, TopModel> = {
  valtryek: {
    url: 'models/victory-valtryek/scene.gltf',
    credit:
      '"wonder valtryek beyblade" by 101NOTFOUND, licensed CC-BY-4.0 — sketchfab.com/101NOTFOUND',
    // Nothing to keep: the only authored colour is a flat grey behind
    // KHR_materials_pbrSpecularGlossiness, which three r185 does not support,
    // so it does not survive the load in the first place.
    finish: 'silver',
  },

  // Gemstone, on Nosferu — the vampire layer, and the only bey in the roster
  // whose spin steal works in a same-spin matchup. A distinct silhouette is
  // worth more on that one than on any other.
  //
  // WHAT ARRIVED, since it is not what the folder suggests. The directory ships
  // four image files, so this looked like a textured model; the MTL references
  // none of them. Its six materials are three greys at Kd 0.8, one near-black
  // at 0.008, and two pure blacks — no maps, no UnwrapURLs, nothing. The images
  // are orphans from the original export.
  //
  // `own` anyway, because those blacks are the model's panel lines and dropping
  // them to a uniform silver would flatten the one thing distinguishing it from
  // Valtryek.
  nosferu: {
    url: 'models/gemstone/beyblade.obj',
    finish: 'own',
  },

  // The four that arrived together. All GLB, which is why they are one file
  // each: GLB embeds geometry, materials and textures, so there is no sibling
  // .bin or texture folder to lose. The .gltf variant of the same export is
  // smaller precisely because it does not, and Valtryek above is the cautionary
  // example — it ships a scene.bin that has to travel with it.
  //
  // `own` on all four. These are authored product transcriptions with real
  // colour breaks; the silver override exists for models that arrive grey, and
  // flattening these would throw away the exact thing they were imported for.
  dransword: {
    url: 'models/dran-sword/scene.glb',
    finish: 'own',
  },
  valkyrie: {
    url: 'models/victory-valkyrie/scene.glb',
    finish: 'own',
  },
  magejab: {
    url: 'models/mage-jab/scene.glb',
    finish: 'own',
  },
  dsycther: {
    url: 'models/reaper-dsycther/scene.glb',
    finish: 'own',
  },
};

export const topModelFor = (layerId: string): TopModel | undefined => TOP_MODELS[layerId];
