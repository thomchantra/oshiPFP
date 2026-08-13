import type {
  ColorAdjustParams,
  CropMode,
  CropTransform,
  EnhanceParams,
  ExportDisplayMode,
  ExportFormat,
  GradeGradientMapParams,
  HslByBand,
  InvertParams,
  LightParams,
  LineArtMode,
  LineArtParams,
  ResampleMode,
  ResizeParams,
  ResolutionMode,
} from '../types'
import type { CurveChannel, CurvesByChannel } from '../curve/useColorCurve'

export interface DumpStateInput {
  fileInfo: { name: string; type: string; size: number } | null
  crop: {
    mode: CropMode
    transform: CropTransform
    enhance: EnhanceParams
    resize: ResizeParams
  }
  lineArt: {
    /** Which of the 7 algorithms is actually live on screen right now — paramsByAlgorithm below
     * has all 7 for reference, but only this one reflects the current render. */
    activeMode: LineArtMode
    activeLabel: string
    /** Every algorithm's own cached params (App.tsx's paramsByMode), not just the active one —
     * previously this dump only captured the active algorithm, silently dropping the other 6. */
    paramsByAlgorithm: Record<LineArtMode, { label: string; params: LineArtParams }>
  }
  color: {
    subTab: string
    light: LightParams
    colorAdjust: ColorAdjustParams
    invert: InvertParams
    hslByBand: HslByBand
    curveChannel: CurveChannel
    curves: CurvesByChannel
    curveVisible: boolean
    gradeGradientMap: GradeGradientMapParams
  }
  export: {
    displayMode: ExportDisplayMode
    colorGrade: boolean
    colorGradeIntensity: number
    resolutionMode: ResolutionMode
    customSize: { width: number; height: number }
    customRatio: number
    resampleMode: ResampleMode
    format: ExportFormat
  }
  view: {
    pfpMode: 'square' | 'circle'
    theme: 'light' | 'dark'
    previewMode: 'original' | 'result'
    dualPaneEnabled: boolean
    dualPaneMode: string
  }
}

/** Dev-only debug dump (see HeaderBar's dev-only Dump State button) — a JSON snapshot of every
 * tab's current config, for reproducing/comparing algo-tuning results across sessions. Pure
 * function (no DOM/file access) so it's trivially testable independent of the actual download
 * trigger. Returns a single valid JSON document (not the mixed markdown+JSON-blocks a `.txt`
 * predecessor of this used) since that's what the `.json` extension it's downloaded as promises. */
export function formatStateDump(input: DumpStateInput): string {
  const ext = input.fileInfo?.name.includes('.') ? input.fileInfo.name.split('.').pop() : null
  return JSON.stringify(
    {
      generated: new Date().toISOString(),
      // Plain-language pointers a human or a future parsing script can read programmatically,
      // instead of relying on code comments this dump's own consumers never see.
      notes: [
        'lineArt.activeMode/activeLabel identify which of the 7 algorithms is currently being tuned; lineArt.paramsByAlgorithm has all 7 for reference, but only the active one reflects what is currently on screen.',
        'This is a diagnostic/dev dump, not a portable preset file — see docs/oshiPFP-v0.3-tuningspecs.md\'s JSON preset saga notes for the planned distinction.',
      ],
      file: {
        name: input.fileInfo?.name ?? null,
        extension: ext,
        type: input.fileInfo?.type ?? null,
        sizeBytes: input.fileInfo?.size ?? null,
      },
      crop: input.crop,
      lineArt: input.lineArt,
      color: input.color,
      export: input.export,
      view: input.view,
    },
    null,
    2,
  )
}
