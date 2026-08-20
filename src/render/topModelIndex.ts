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
export interface TopModel {
  /** Path under `public/`. */
  url: string;
  /** Full credit line, if the model requires one. Rendered in the garage. */
  credit?: string;
}

export const TOP_MODELS: Record<string, TopModel> = {
  valtryek: {
    url: 'models/wonder_valtryek_beyblade/scene.gltf',
    credit:
      '"wonder valtryek beyblade" by 101NOTFOUND, licensed CC-BY-4.0 — sketchfab.com/101NOTFOUND',
  },
};

export const topModelFor = (layerId: string): TopModel | undefined => TOP_MODELS[layerId];
