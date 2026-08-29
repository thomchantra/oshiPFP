import type { LineArtMode, LineArtParams } from '../types'

/** One "filter" — a named, pre-tuned Line Art recipe for the Simplified-mode carousel, distinct
 * from src/presets/ (which is a static before/after demo-photo gallery for the Advanced panel).
 * `params` is a whitelisted subset of LineArtParams: exactly the fields Simplified mode's macro
 * controls expose for `algo` (see docs/0.5-simplified-mode-mvp-plan.md's mapping table) — not a
 * full LineArtParams object, and not a separate macro-named schema, since every macro control
 * already corresponds 1:1 to a real LineArtParams field. No image fields: unlike presets, a
 * filter's thumbnail is live-rendered against the user's own photo (Stage D), not a static asset.
 *
 * `params` MUST supply a value for every field `macroFields.ts`'s `getManagedFields(filter)`
 * returns for this filter (rendered controls plus hidden `lockedFields`) — not just the fields that
 * make this filter distinctive. A field left out isn't "inherited from a sensible default," it's
 * left un-isolated: an edit to it leaks
 * straight into the shared per-algo paramsByMode base and bleeds into every other filter on that
 * algo (see App.tsx's capture-effect doc comment for the full failure mode). Each filter must be
 * fully self-contained. */
export interface FilterManifestEntry {
  /** `<algoSlug>-<variant><preset>` (e.g. `daiya-a1`, `daiya-b1`, `daiya-c2`) — the filename stem
   * too, so `import.meta.glob`'s key sort in filterManifest.ts *is* the carousel order: directory
   * (`data/pathB/` < `data/pathC/` < …) groups the algos, the `<variant><preset>` suffix orders
   * within a group. No separate `order` field. `variant` = a letter per distinct *control set*
   * (alphabetical), `preset` = a number per param-only tuning of that same control set. */
  id: string
  algo: LineArtMode
  /** Front-facing shorthand shown in the carousel/edit sheet (e.g. "Daiya A1"). */
  label: string
  /** Internal-only full name for housekeeping/tracking variant lineage (e.g. "Daiya JFA Mode A1").
   * Never shown in the UI. */
  alias: string
  /** Per-filter override for the two carousel quick slots, when this filter's Threshold/Thickness
   * concepts don't map to its algo's default `QUICK_MACRO_FIELDS` pair — e.g. Daiya A1 uses JFA
   * radius for Thickness, Daiya C1 uses octagon radius, Gumi C2 uses brightness. Falls back to
   * `QUICK_MACRO_FIELDS[algo]` when omitted. `getEditableFields`/`getManagedFields` resolve through
   * `resolveQuickFields(filter)`, so an override here is captured/isolated correctly. */
  quick?: { threshold: keyof LineArtParams; thickness: keyof LineArtParams }
  /** Fields this filter pins to a fixed value (taken from `params`) and hides from the edit sheet —
   * for otherwise-editable controls that are situational and cut from the UI surface per the v0.5
   * scope decision (overlayPassthrough/matteColor, and the algo-level invert/behaviour forks like
   * daiyaInvertSeed, edgeInvertFill, findEdge). Still whitelisted by `getManagedFields` so the
   * capture effect resets them per-filter (no leak into the shared per-algo base), just not
   * rendered as a control. `params` must still supply their value, same self-containment rule. */
  lockedFields?: (keyof LineArtParams)[]
  params: Partial<LineArtParams>
  /** Fields beyond the algo's own baseline macro set (getEditableFields(algo)) that only make
   * sense for this specific filter — e.g. Gumi B's Detection Radius/Contrast, useful in invert-
   * fill mode but a no-op/harmful for the plain Gumi filter on the same algo. Rendered as extra
   * sliders in SimplifiedLineArtPanel.tsx's edit sheet, below the algo's standard controls. A
   * field listed here still needs a value in `params`, same self-containment rule as every other
   * editable field (see this interface's own doc comment above). */
  extraFields?: { field: keyof LineArtParams; label: string; min: number; max: number; step?: number }[]
}
