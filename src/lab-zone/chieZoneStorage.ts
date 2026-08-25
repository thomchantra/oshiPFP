// Chie (pathC)'s own ground-truth capture — deliberately a separate record shape from
// ZoneRecord (Botan/Daiya's), not a reuse: Chie's detection erodes `base` directly (never goes
// through toneShaping's Clip/Pinch stage at all — see pipeline.ts's pathC branch), so there's no
// clip/pinch state to capture here, just the fields that actually drive Chie's own detection
// (gateThreshold, radius, hardness) plus the edge-strength stats computed at record time for
// later comparison. See changelog/oshipfp-v0.5-instagram-mode-saga.md session 6.
export interface ChieZoneRecord {
  imageId: string
  gateThreshold: number
  radius: number
  hardness: number
  otsu255: number
  valleyEmphasis255: number
  peakThreshold255: number
  peakConfidence: 'high' | 'low'
  remark?: string
  timestamp: number
}

const STORAGE_KEY = 'oshipfp-lab-zone-chie-state'

export function loadChieZoneRecords(): ChieZoneRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveChieZoneRecords(records: ChieZoneRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage full/unavailable — same as zoneStorage.ts, not worth surfacing for a dev tool.
  }
}

export function clearChieZoneRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
