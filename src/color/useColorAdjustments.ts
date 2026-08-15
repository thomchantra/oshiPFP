import { useEffect, useState } from 'react'
import type { ColorAdjustParams, GradeGradientMapParams, HslBand, HslByBand, HslShift, InvertParams, LightParams } from '../types'

export const IDENTITY_HSL_SHIFT: HslShift = { hue: 0, saturation: 0, lightness: 0 }
export const IDENTITY_HSL_BY_BAND: HslByBand = {
  master: IDENTITY_HSL_SHIFT,
  red: IDENTITY_HSL_SHIFT,
  orange: IDENTITY_HSL_SHIFT,
  yellow: IDENTITY_HSL_SHIFT,
  green: IDENTITY_HSL_SHIFT,
  teal: IDENTITY_HSL_SHIFT,
  blue: IDENTITY_HSL_SHIFT,
  purple: IDENTITY_HSL_SHIFT,
  magenta: IDENTITY_HSL_SHIFT,
}
export const IDENTITY_INVERT: InvertParams = { rgb: false, r: false, g: false, b: false }
export const IDENTITY_LIGHT: LightParams = { exposure: 0, contrast: 0, brilliance: 0, whites: 0, highlights: 0, shadows: 0, blacks: 0 }
export const IDENTITY_COLOR_ADJUST: ColorAdjustParams = { temperature: 0, tint: 0, vibrance: 0 }
export const IDENTITY_GRADE_GRADIENT_MAP: GradeGradientMapParams = {
  enabled: false,
  shadow: [0, 0, 0],
  mid: [0.5, 0.5, 0.5],
  highlight: [1, 1, 1],
  pivot: 0,
  duoTone: false,
  intensity: 1,
  blendMode: 'overwrite',
}

/**
 * Color tab's HSL/Invert/Light/Color-adjust state, lifted out of
 * ColorPanel.tsx into a hook App.tsx instantiates once. ColorPanel only
 * renders while `tab === 'color'` (App.tsx unmounts it otherwise, e.g. for
 * Crop/Line Art/Export), so state owned inside ColorPanel itself gets wiped
 * on every tab switch — this hook is the fix, not ColorPanel's own state.
 */
export function useColorAdjustments(pipeline: {
  setHsl: (hslByBand: HslByBand) => void
  setInvert: (invert: InvertParams) => void
  setLight: (light: LightParams) => void
  setColorAdjust: (colorAdjust: ColorAdjustParams) => void
  setGradeGradientMap: (gradeGradientMap: GradeGradientMapParams) => void
}) {
  const [hslByBand, setHslByBand] = useState<HslByBand>(IDENTITY_HSL_BY_BAND)
  const [activeBand, setActiveBand] = useState<HslBand>('master')
  const [invert, setInvert] = useState<InvertParams>(IDENTITY_INVERT)
  const [light, setLight] = useState<LightParams>(IDENTITY_LIGHT)
  const [colorAdjust, setColorAdjust] = useState<ColorAdjustParams>(IDENTITY_COLOR_ADJUST)
  const [gradeGradientMap, setGradeGradientMap] = useState<GradeGradientMapParams>(IDENTITY_GRADE_GRADIENT_MAP)

  useEffect(() => {
    pipeline.setHsl(hslByBand)
    // pipeline identity is stable; only re-run when hslByBand changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hslByBand])

  useEffect(() => {
    pipeline.setInvert(invert)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invert])

  useEffect(() => {
    pipeline.setLight(light)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [light])

  useEffect(() => {
    pipeline.setColorAdjust(colorAdjust)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorAdjust])

  useEffect(() => {
    pipeline.setGradeGradientMap(gradeGradientMap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeGradientMap])

  // Back to the same identity defaults this hook itself initializes from.
  const reset = () => {
    setHslByBand(IDENTITY_HSL_BY_BAND)
    setActiveBand('master')
    setInvert(IDENTITY_INVERT)
    setLight(IDENTITY_LIGHT)
    setColorAdjust(IDENTITY_COLOR_ADJUST)
    setGradeGradientMap(IDENTITY_GRADE_GRADIENT_MAP)
  }

  return {
    hslByBand, setHslByBand,
    activeBand, setActiveBand,
    invert, setInvert,
    light, setLight,
    colorAdjust, setColorAdjust,
    gradeGradientMap, setGradeGradientMap,
    reset,
  }
}
