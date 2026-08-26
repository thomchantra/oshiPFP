import type { LineArtMode, LineArtParams } from '../types'

/** One "filter" — a named, pre-tuned Line Art recipe for the Simplified-mode carousel, distinct
 * from src/presets/ (which is a static before/after demo-photo gallery for the Advanced panel).
 * `params` is a whitelisted subset of LineArtParams: exactly the fields Simplified mode's macro
 * controls expose for `algo` (see docs/0.5-simplified-mode-mvp-plan.md's mapping table) — not a
 * full LineArtParams object, and not a separate macro-named schema, since every macro control
 * already corresponds 1:1 to a real LineArtParams field. No image fields: unlike presets, a
 * filter's thumbnail is live-rendered against the user's own photo (Stage D), not a static asset.
 *
 * `params` MUST supply a value for every field `macroFields.ts`'s `getEditableFields(filter)`
 * returns for this filter — not just the fields that make this filter distinctive. A field
 * left out isn't "inherited from a sensible default," it's left un-isolated: an edit to it leaks
 * straight into the shared per-algo paramsByMode base and bleeds into every other filter on that
 * algo (see App.tsx's capture-effect doc comment for the full failure mode). Each filter must be
 * fully self-contained. */
export interface FilterManifestEntry {
  id: string
  algo: LineArtMode
  label: string
  params: Partial<LineArtParams>
  /** Fields beyond the algo's own baseline macro set (getEditableFields(algo)) that only make
   * sense for this specific filter — e.g. Gumi B's Detection Radius/Contrast, useful in invert-
   * fill mode but a no-op/harmful for the plain Gumi filter on the same algo. Rendered as extra
   * sliders in SimplifiedLineArtPanel.tsx's edit sheet, below the algo's standard controls. A
   * field listed here still needs a value in `params`, same self-containment rule as every other
   * editable field (see this interface's own doc comment above). */
  extraFields?: { field: keyof LineArtParams; label: string; min: number; max: number; step?: number }[]
}
