import type { LineArtMode, LineArtParams } from '../types'

/** Per-algo Invert/Hardness macro mapping (extends quickMacros.ts's Threshold/Thickness pair).
 * `hardness` is omitted for algos with no wired hardness concept (Gumi, Hinata/Tsukiko Edge). */
export interface AlgoMacroFields {
  invert: keyof LineArtParams
  hardness?: keyof LineArtParams
  /** Fields a macro slider sets as a side effect (no visible row of their own) that still need
   * capture-effect whitelisting so they survive filter reselection. */
  derivedFields?: (keyof LineArtParams)[]
}

/** Per-algo Fill Type / Color group mapping. Botan/Chie/Daiya/Fumiko share one field set; Gumi
 * Line and Gumi Fill each have their own (`gumiLine*` / `gumiFill*`). */
export interface ColorMacroFields {
  fillType: keyof LineArtParams
  solidColor: keyof LineArtParams
  colorContrast: keyof LineArtParams
  /** Optional EV-stops Exposure slider (before Color Contrast) — present only where the image
   * fill is wired to it. */
  exposure?: keyof LineArtParams
  gradientPivot: keyof LineArtParams
  /** Optional — omitted where the gradient fill has no live Duo Tone field. */
  gradientDuoTone?: keyof LineArtParams
  gradientShadow: keyof LineArtParams
  gradientMid: keyof LineArtParams
  gradientHighlight: keyof LineArtParams
}

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
  /** Per-filter override for the quick slots' label/range — for a sub-mode whose slot means
   * something different from the algo default (e.g. Gumi Fill's "Fill Radius"). Merged over
   * `QUICK_MACRO_META[algo]` in `resolveQuickMeta`. */
  quickMeta?: { threshold?: { label?: string; min?: number; max?: number; step?: number }; thickness?: { label?: string; min?: number; max?: number; step?: number } }
  /** Per-filter override for the Invert/Hardness macro mapping — for a sub-mode that drives
   * different fields (e.g. Gumi Fill's Invert is `gumiFillInvert`, not Line's `gumiLineInvert`).
   * Merged over `MACRO_FIELDS[algo]`. */
  macro?: Partial<AlgoMacroFields>
  /** Per-filter override for the Fill Type / Color group mapping — for a sub-mode with its own
   * fill fields (Gumi Fill's `gumiFill*`). Replaces `COLOR_MACRO_FIELDS[algo]` wholesale; `null`
   * suppresses the group entirely. */
  color?: ColorMacroFields | null
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
