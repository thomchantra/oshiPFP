import { resolveQuickFields } from './quickMacros'
import type { FilterManifestEntry } from './filterTypes'
import type { LineArtMode, LineArtParams } from '../types'

/** Universal Brightness macro's own fields (lineBrightness.ts) — algo-independent, so not part of
 * AlgoMacroFields/ColorMacroFields. The Simplified "Matte" pill rides `blendMode`/`opacity` (a
 * fixed 'overwrite' blend), NOT overlayPassthrough/matteColor — those two are per-filter-baked
 * (filter.lockedFields), cut from the universal editable surface per the v0.5 scope decision. */
const BRIGHTNESS_FIELDS: (keyof LineArtParams)[] = ['opacity', 'blendMode']

/** Extends quickMacros.ts's Threshold/Thickness pair with the remaining Invert/Hardness macros,
 * per docs/0.5-simplified-mode-mvp-plan.md's mapping table. `hardness` is omitted for Gumi
 * (parked — dormant gumiSoftness/gumiSoftDetection fields aren't wired to any UI) and for
 * Hinata/Tsukiko's Edge treatment (has no hardness concept at all). */
export interface AlgoMacroFields {
  invert: keyof LineArtParams
  hardness?: keyof LineArtParams
  /** Fields the algo's own macro sliders set as a side effect (not their own visible row) but
   * still need whitelisting so they survive filter reselection correctly — e.g. Gumi's Thickness
   * slider also derives gumiOverdrive (see SimplifiedLineArtPanel.tsx's
   * GUMI_OVERDRIVE_PER_THICKNESS doc comment for why); without this, gumiOverdrive would silently
   * reset to the filter JSON's static default instead of the ratio-correct value on reselection,
   * since the capture effect only ever syncs fields getEditableFields returns. */
  derivedFields?: (keyof LineArtParams)[]
}

export const MACRO_FIELDS: Record<LineArtMode, AlgoMacroFields> = {
  pathB: { invert: 'fillInvert', hardness: 'hardness' },
  pathC: { invert: 'fillInvert', hardness: 'hardness' },
  pathD: { invert: 'fillInvert', hardness: 'hardness' },
  pathF: { invert: 'fillInvert', hardness: 'hardness' },
  pathG: { invert: 'gumiLineInvert', derivedFields: ['gumiOverdrive'] },
  pathH: { invert: 'edgeInvertFill' },
  pathI: { invert: 'edgeInvertFill' },
}

export interface ColorMacroFields {
  fillType: keyof LineArtParams
  solidColor: keyof LineArtParams
  colorContrast: keyof LineArtParams
  /** Optional — the Image group's EV-stops Exposure slider (before Color Contrast). Present for
   * Botan/Chie; omitted for algos whose image fill isn't wired to it (Daiya/Fumiko's vivid variant,
   * Gumi). SimplifiedLineArtPanel.tsx hides the row when absent. */
  exposure?: keyof LineArtParams
  gradientPivot: keyof LineArtParams
  /** Optional — Gumi's Line-mode gradient fill has no live duo-tone field (pipeline.ts's
   * maskFillColorProgram call site for it hardcodes uGradientDuoTone=0), so its own
   * COLOR_MACRO_FIELDS entry omits this. SimplifiedLineArtPanel.tsx hides the Duo Tone toggle
   * entirely when absent, same pattern as AlgoMacroFields.hardness being optional. */
  gradientDuoTone?: keyof LineArtParams
  gradientShadow: keyof LineArtParams
  gradientMid: keyof LineArtParams
  gradientHighlight: keyof LineArtParams
}

/** Color group (Fill Type: Image/Solid/Gradient) has real per-algo shape variance (Gumi Line's own
 * gradient sub-fields, Edge's narrower Image/Solid-only FillType, Daiya's vivid fields) — populated
 * per algo as it's brought into the Simplified filter system. Botan/Chie/Daiya/Fumiko share the
 * exact same LineArtParams fill fields (fillType, tintColor, the gradient stops, colorContrast —
 * see types.ts's "Shared fill-type selector" comment), so their entries here are identical. Extending to another
 * algo is a small, isolated addition here, not new mechanism work — see SimplifiedLineArtPanel.tsx's
 * "Color — coming soon" fallback for algos absent from this map. */
export const COLOR_MACRO_FIELDS: Partial<Record<LineArtMode, ColorMacroFields>> = {
  pathB: {
    fillType: 'fillType',
    solidColor: 'tintColor',
    colorContrast: 'colorContrast',
    exposure: 'colorExposure',
    gradientPivot: 'gradientPivot',
    gradientDuoTone: 'gradientDuoTone',
    gradientShadow: 'gradientShadow',
    gradientMid: 'gradientMid',
    gradientHighlight: 'gradientHighlight',
  },
  // Chie shares Botan's fill fields exactly (erosionGate → maskFillColorProgram reads the same
  // p.fillType/p.tintColor/p.gradient*/p.colorContrast/p.colorExposure/p.fillInvert — see pipeline.ts pathC branch).
  pathC: {
    fillType: 'fillType',
    solidColor: 'tintColor',
    colorContrast: 'colorContrast',
    exposure: 'colorExposure',
    gradientPivot: 'gradientPivot',
    gradientDuoTone: 'gradientDuoTone',
    gradientShadow: 'gradientShadow',
    gradientMid: 'gradientMid',
    gradientHighlight: 'gradientHighlight',
  },
  // Fumiko's post-erosion edge fill also runs through maskFillColorProgram (same shared fill
  // fields as Botan/Chie), Exposure included. The whole group is hidden in the panel when
  // `findEdge` or `overlayPassthrough` is on (findEdge bypasses fillType entirely; passthrough
  // flattens onto the matte — see SimplifiedLineArtPanel.tsx).
  pathF: {
    fillType: 'fillType',
    solidColor: 'tintColor',
    colorContrast: 'colorContrast',
    exposure: 'colorExposure',
    gradientPivot: 'gradientPivot',
    gradientDuoTone: 'gradientDuoTone',
    gradientShadow: 'gradientShadow',
    gradientMid: 'gradientMid',
    gradientHighlight: 'gradientHighlight',
  },
  // No gradientDuoTone — see ColorMacroFields.gradientDuoTone's own doc comment.
  pathG: {
    fillType: 'gumiLineFillType',
    solidColor: 'gumiLineSolidColor',
    colorContrast: 'gumiLineColorContrast',
    gradientPivot: 'gumiLineGradientPivot',
    gradientShadow: 'gumiGradientShadow',
    gradientMid: 'gumiGradientMid',
    gradientHighlight: 'gumiGradientHighlight',
  },
}

/** The set of LineArtParams fields the Simplified panel renders as controls for a filter — quick
 * Threshold/Thickness (per-filter `quick` override or algo default) + Invert/Hardness + universal
 * Brightness + Color group (if present) + the filter's own `extraFields`. Pair with
 * `getManagedFields` (this set plus `lockedFields`) for the capture-effect whitelist: a filter JSON
 * that only lists a subset of the managed set would otherwise let an edit to an unlisted field leak
 * straight into the shared per-algo paramsByMode base — permanently mutating it for every filter on
 * that algo. Every filter's JSON must declare a value for every field `getManagedFields` returns,
 * so each filter stays genuinely self-contained (selecting it always resets every managed field,
 * never inherits whatever an earlier session touched). */
export function getEditableFields(filter: FilterManifestEntry): (keyof LineArtParams)[] {
  const algo = filter.algo
  const quick = resolveQuickFields(filter)
  const macro = MACRO_FIELDS[algo]
  const color = COLOR_MACRO_FIELDS[algo]
  const fields: (keyof LineArtParams)[] = [quick.threshold, quick.thickness, macro.invert, ...BRIGHTNESS_FIELDS]
  if (macro.hardness) fields.push(macro.hardness)
  if (macro.derivedFields) fields.push(...macro.derivedFields)
  if (color) {
    fields.push(color.fillType, color.solidColor, color.colorContrast, color.gradientPivot, color.gradientShadow, color.gradientMid, color.gradientHighlight)
    if (color.exposure) fields.push(color.exposure)
    if (color.gradientDuoTone) fields.push(color.gradientDuoTone)
  }
  if (filter.extraFields) fields.push(...filter.extraFields.map((f) => f.field))
  return fields
}

/** getEditableFields plus the filter's `lockedFields` (pinned + hidden, but still per-filter state).
 * This — not getEditableFields — is what App.tsx's capture effect snapshots: a locked field must be
 * reset per-filter on reselection too (so it never inherits whatever a sibling filter on the same
 * algo left in the shared paramsByMode base), it just isn't rendered as a control. */
export function getManagedFields(filter: FilterManifestEntry): (keyof LineArtParams)[] {
  const fields = getEditableFields(filter)
  if (filter.lockedFields) fields.push(...filter.lockedFields)
  return fields
}
