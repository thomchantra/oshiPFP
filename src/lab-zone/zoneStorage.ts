import type { LineArtMode } from '../types'
import type { ConnectedComponentStats } from '../imageStats/thresholdStats'

// One record per "I looked at this image with the Zone tool, converged on this pinch position,
// and here's what the automated stats guessed at the same time" — the ground-truth capture this
// lab bench exists for for. See changelog/oshipfp-v0.5-instagram-mode-saga.md session 6.
export interface ZoneRecord {
  imageId: string
  algo: LineArtMode
  /** Which Ramp Mode was actually active at record time — the fields below are captured
   * regardless of which one, so a Clip-mode recording never silently loses what was actually
   * tuned. See changelog/oshipfp-v0.5-instagram-mode-saga.md session 6. */
  toneShapingMode: 'clip' | 'pinch'
  /** Both apply upstream of blackClip/whiteClip (exposure) or the contrast pivot after it — either
   * one changes what raw-image luminance a given clip/pinch/threshold combination actually
   * corresponds to, so both are captured unconditionally same as clip/pinch below, not just when
   * non-default. */
  toneShapingExposure: number
  toneShapingContrast: number
  clipBlackClip: number
  clipWhiteClip: number
  pinchPosition: number
  pinchExpand: number
  pinchFeathering: number
  /** The algo's own primary threshold-family field value at record time, if it has one (Botan/
   * Daiya/Gumi/Hinata/Tsukiko all have a literal `threshold`; Chie's is `gateThreshold`, Fumiko's
   * is `sensitivity` — recorded generically so this lab isn't Botan-only by construction). */
  liveThresholdFieldName: string
  liveThresholdFieldValue: number
  otsuThreshold255: number
  valleyEmphasisThreshold255: number
  componentStats: ConnectedComponentStats
  remark?: string
  timestamp: number
}

const STORAGE_KEY = 'oshipfp-lab-zone-state'

export function loadZoneRecords(): ZoneRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveZoneRecords(records: ZoneRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage full/unavailable — same as labGridStorage.ts, not worth surfacing for a dev tool.
  }
}

export function clearZoneRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
