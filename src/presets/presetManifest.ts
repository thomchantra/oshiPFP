import type { CurveChannel, CurvesByChannel } from '../curve/useColorCurve'
import type {
  ColorAdjustParams,
  EnhanceParams,
  GradeGradientMapParams,
  HslByBand,
  InvertParams,
  LightParams,
  LineArtMode,
  LineArtParams,
} from '../types'

/** One demo preset — a fully-tuned Line Art + Grade + Enhancement configuration, paired with its
 * own before/after WebP demo photos (see public/presets/<algo>/<slug>/). Consumed by the gallery
 * UI in LineArtPanel.tsx's info modal (per-algorithm before/after cards with a "Load Demo"
 * action) — see applyPreset.ts for how this gets applied to live app state. */
export interface PresetManifestEntry {
  id: string
  algo: LineArtMode
  algoLabel: string
  beforeImage: string
  afterImage: string
  /** Artist attribution (Figma's gallery card shows an "@handle" row) — framework laid out ahead
   * of need; left unset on every entry for now since these demos are the app author's own work.
   * The gallery UI only renders the credit row when this is set. */
  credit?: string
  lineArtParams: LineArtParams
  color: {
    light: LightParams
    colorAdjust: ColorAdjustParams
    invert: InvertParams
    hslByBand: HslByBand
    curveChannel: CurveChannel
    curves: CurvesByChannel
    curveVisible: boolean
    gradeGradientMap: GradeGradientMapParams
  }
  enhance: EnhanceParams
}

/** Each preset is a fully self-contained JSON file under ./data/<algo>/<slug>.json (paired with
 * public/presets/<algo>/<slug>/{before,after}.webp), auto-discovered here at build time instead of
 * being a hand-maintained array. scripts/import-presets.sh is the only thing that should ever add
 * to this — drop a new triplet in presetsprep/, run the script, done; this file itself never needs
 * editing again. */
const modules = import.meta.glob('./data/*/*.json', { eager: true }) as Record<string, { default: PresetManifestEntry }>

export const PRESET_MANIFEST: PresetManifestEntry[] = Object.keys(modules)
  .sort()
  .map((key) => modules[key].default)
