import type { LineArtMode } from '../types'
import type { ConnectedComponentStats } from '../imageStats/thresholdStats'

// One record per "I looked at this image with the Zone tool, converged on this pinch position,
// and here's what the automated stats guessed at the same time" — the ground-truth capture this
// lab bench exists for for. See changelog/oshipfp-v0.5-instagram-mode-saga.md session 6.
export interface ZoneRecord {
  imageId: string
  algo: LineArtMode
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
