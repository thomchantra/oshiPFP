import type { CurveChannel, CurvesByChannel } from '../curve/useColorCurve'
import type {
  ColorAdjustParams,
  EnhanceParams,
  GradeGradientMapParams,
  HslByBand,
  InvertParams,
  LightParams,
  LineArtDisplayMode,
  LineArtMode,
  LineArtParams,
} from '../types'
import type { PresetManifestEntry } from './presetManifest'

export interface ApplyPresetSetters {
  loadFile: (file: File) => Promise<void>
  setLineArtMode: (mode: LineArtMode) => void
  setLineArtDisplayMode: (mode: LineArtDisplayMode) => void
  setParamsByMode: (updater: (prev: Record<LineArtMode, LineArtParams>) => Record<LineArtMode, LineArtParams>) => void
  setLight: (light: LightParams) => void
  setColorAdjust: (colorAdjust: ColorAdjustParams) => void
  setInvert: (invert: InvertParams) => void
  setHslByBand: (updater: (prev: HslByBand) => HslByBand) => void
  setCurveChannel: (channel: CurveChannel) => void
  setCurves: (curves: CurvesByChannel) => void
  setCurveVisible: (visible: boolean) => void
  setGradeGradientMap: (gradeGradientMap: GradeGradientMapParams) => void
  setEnhance: (enhance: EnhanceParams) => void
}

/** Loads a demo preset as a fresh working scene — its own demo photo (public/presets/.../before.webp),
 * with the preset's Line Art (that specific algorithm) + Grade + Crop Enhancement applied on top.
 * Crop's mode/transform/resize and Export settings are deliberately left untouched: the demo photo
 * is already the pre-cropped square export a preset was built from, so there's no crop transform to
 * re-derive against a different source. The user can swap in their own photo afterward via the
 * normal Upload PFP flow and these applied settings persist (pipeline.loadFile only replaces pixels,
 * never touches tuning state) — letting them try a demo's look on their own material.
 *
 * `options.skipImage` (the modal's separate "Load Preset" button) applies every tuning field
 * exactly the same way but leaves whatever photo is already loaded untouched, for recalling a
 * preset's *look* onto the user's own in-progress photo instead of swapping in the demo photo it
 * was built from. */
export async function applyPreset(
  preset: PresetManifestEntry,
  setters: ApplyPresetSetters,
  options?: { skipImage?: boolean },
): Promise<void> {
  if (!options?.skipImage) {
    const response = await fetch(preset.beforeImage)
    const blob = await response.blob()
    const file = new File([blob], `${preset.id}-demo.webp`, { type: blob.type || 'image/webp' })
    await setters.loadFile(file)
  }

  // Merged against the mode's own current (always fully-populated) params rather than a wholesale
  // replace — a preset JSON older than a LineArtParams field addition (e.g. v0.4's colorCorrect*
  // fields) would otherwise leave that field `undefined` on the resulting object instead of falling
  // back to its real default.
  setters.setParamsByMode((prev) => ({ ...prev, [preset.algo]: { ...prev[preset.algo], ...preset.lineArtParams } }))
  setters.setLineArtMode(preset.algo)
  setters.setLineArtDisplayMode(preset.lineArtParams.displayMode)

  setters.setLight(preset.color.light)
  setters.setColorAdjust(preset.color.colorAdjust)
  setters.setInvert(preset.color.invert)
  setters.setHslByBand(() => preset.color.hslByBand)
  setters.setCurveChannel(preset.color.curveChannel)
  setters.setCurves(preset.color.curves)
  setters.setCurveVisible(preset.color.curveVisible)
  setters.setGradeGradientMap(preset.color.gradeGradientMap)

  setters.setEnhance(preset.enhance)
}
