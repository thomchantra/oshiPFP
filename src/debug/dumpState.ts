import type {
  ColorAdjustParams,
  CropMode,
  CropTransform,
  EnhanceParams,
  ExportFormat,
  HslByBand,
  InvertParams,
  LightParams,
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
    /** Cosmetic display name (Botan/Chie/.../Inori) for the active mode only — see the caller. */
    label: string
    params: LineArtParams
  }
  color: {
    subTab: string
    light: LightParams
    colorAdjust: ColorAdjustParams
    invert: InvertParams
    hslByBand: HslByBand
    curveChannel: CurveChannel
    curves: CurvesByChannel
  }
  export: {
    resolutionMode: ResolutionMode
    customSize: { width: number; height: number }
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
 * tab's current config, for reproducing/comparing algo-tuning results across sessions. Line Art
 * is deliberately scoped to the currently active algorithm only, not the full per-algorithm
 * paramsByMode cache — see docs conversation, "only dump current active algo tab info". Pure
 * function (no DOM/file access) so it's trivially testable independent of the actual download
 * trigger. Returns a single valid JSON document (not the mixed markdown+JSON-blocks a `.txt`
 * predecessor of this used) since that's what the `.json` extension it's downloaded as promises. */
export function formatStateDump(input: DumpStateInput): string {
  const ext = input.fileInfo?.name.includes('.') ? input.fileInfo.name.split('.').pop() : null
  return JSON.stringify(
    {
      generated: new Date().toISOString(),
      file: {
        name: input.fileInfo?.name ?? null,
        extension: ext,
        type: input.fileInfo?.type ?? null,
        sizeBytes: input.fileInfo?.size ?? null,
      },
      crop: input.crop,
      lineArt: { activeAlgorithm: input.lineArt.label, params: input.lineArt.params },
      color: input.color,
      export: input.export,
      view: input.view,
    },
    null,
    2,
  )
}
