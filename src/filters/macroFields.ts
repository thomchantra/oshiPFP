import type { LineArtMode, LineArtParams } from '../types'

/** Extends quickMacros.ts's Threshold/Thickness pair with the remaining Invert/Hardness macros,
 * per docs/0.5-simplified-mode-mvp-plan.md's mapping table. `hardness` is omitted for Gumi
 * (parked — dormant gumiSoftness/gumiSoftDetection fields aren't wired to any UI) and for
 * Hinata/Tsukiko's Edge treatment (has no hardness concept at all). */
export interface AlgoMacroFields {
  invert: keyof LineArtParams
  hardness?: keyof LineArtParams
}

export const MACRO_FIELDS: Record<LineArtMode, AlgoMacroFields> = {
  pathB: { invert: 'fillInvert', hardness: 'hardness' },
  pathC: { invert: 'fillInvert', hardness: 'hardness' },
  pathD: { invert: 'fillInvert', hardness: 'hardness' },
  pathF: { invert: 'fillInvert', hardness: 'hardness' },
  pathG: { invert: 'gumiLineInvert' },
  pathH: { invert: 'edgeInvertFill' },
  pathI: { invert: 'edgeInvertFill' },
}

export interface ColorMacroFields {
  fillType: keyof LineArtParams
  solidColor: keyof LineArtParams
  colorContrast: keyof LineArtParams
  gradientPivot: keyof LineArtParams
  gradientDuoTone: keyof LineArtParams
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
}
