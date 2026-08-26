import { QUICK_MACRO_FIELDS } from './quickMacros'
import type { FilterManifestEntry } from './filterTypes'
import type { LineArtMode, LineArtParams } from '../types'

/** Universal Brightness macro's own fields (lineBrightness.ts + the Matte pill's
 * overlayPassthrough/matteColor) — algo-independent, so not part of AlgoMacroFields/ColorMacroFields. */
const BRIGHTNESS_FIELDS: (keyof LineArtParams)[] = ['opacity', 'blendMode', 'overlayPassthrough', 'matteColor']

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
 * gradient sub-fields, Edge's narrower Image/Solid-only FillType, Daiya's vivid fields) not yet
 * verified for every algo — populated for Botan only for now, per this session's scope decision.
 * Extending to another algo is a small, isolated addition here, not new mechanism work — see
 * SimplifiedLineArtPanel.tsx's "Color — coming soon" fallback for algos absent from this map. */
export const COLOR_MACRO_FIELDS: Partial<Record<LineArtMode, ColorMacroFields>> = {
  pathB: {
    fillType: 'fillType',
    solidColor: 'tintColor',
    colorContrast: 'colorContrast',
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

/** The complete set of LineArtParams fields the Simplified panel can edit for a given algo —
 * quick Threshold/Thickness + Invert/Hardness + universal Brightness + Color group (if present).
 * This, not each filter's own `params` keys, is what App.tsx's session-override capture effect
 * whitelists: a filter JSON that only lists a subset of these (e.g. omits fillType/tintColor) would
 * otherwise let an edit to an unlisted field leak straight into the shared per-algo paramsByMode
 * base — permanently mutating it for every filter on that algo, not just the one being edited.
 * Every filter's JSON must declare a value for every field this returns, so each filter stays
 * genuinely self-contained (selecting it always resets every editable field, never inherits
 * whatever an earlier session touched). */
export function getEditableFields(filter: FilterManifestEntry): (keyof LineArtParams)[] {
  const algo = filter.algo
  const quick = QUICK_MACRO_FIELDS[algo]
  const macro = MACRO_FIELDS[algo]
  const color = COLOR_MACRO_FIELDS[algo]
  const fields: (keyof LineArtParams)[] = [quick.threshold, quick.thickness, macro.invert, ...BRIGHTNESS_FIELDS]
  if (macro.hardness) fields.push(macro.hardness)
  if (macro.derivedFields) fields.push(...macro.derivedFields)
  if (color) {
    fields.push(color.fillType, color.solidColor, color.colorContrast, color.gradientPivot, color.gradientShadow, color.gradientMid, color.gradientHighlight)
    if (color.gradientDuoTone) fields.push(color.gradientDuoTone)
  }
  if (filter.extraFields) fields.push(...filter.extraFields.map((f) => f.field))
  return fields
}
