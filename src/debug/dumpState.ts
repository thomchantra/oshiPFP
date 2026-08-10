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

function section(title: string, body: unknown): string {
  return `## ${title}\n${JSON.stringify(body, null, 2)}\n`
}

/** Dev-only debug dump (see HeaderBar's dev-only Dump State button) — a plain-text snapshot of
 * every tab's current config, for reproducing/comparing algo-tuning results across sessions.
 * Line Art is deliberately scoped to the currently active algorithm only, not the full
 * per-algorithm paramsByMode cache — see docs conversation, "only dump current active algo tab
 * info". Pure function (no DOM/file access) so it's trivially testable independent of the actual
 * download trigger. */
export function formatStateDump(input: DumpStateInput): string {
  const ext = input.fileInfo?.name.includes('.') ? input.fileInfo.name.split('.').pop() : null
  const lines = [
    'oshiPFP debug state dump',
    `generated: ${new Date().toISOString()}`,
    '',
    section('File', {
      name: input.fileInfo?.name ?? null,
      extension: ext,
      type: input.fileInfo?.type ?? null,
      sizeBytes: input.fileInfo?.size ?? null,
    }),
    section('Crop', input.crop),
    section(`Line Art (active algorithm: ${input.lineArt.label})`, input.lineArt.params),
    section('Color', input.color),
    section('Export', input.export),
    section('View', input.view),
  ]
  return lines.join('\n')
}
