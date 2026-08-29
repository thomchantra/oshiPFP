// Hinata (pathH)'s own ground-truth capture — same shape/rationale as chieZoneStorage.ts. Per the
// user's explicit calibration-view decision, this records the *thresholdEnabled* treatment
// (background raised to white, lines to black, softThresholdProgram's `threshold` field as the
// real per-image tunable, multiply composite) rather than the default Edge/responsive-color
// treatment — see the "Prepare Ground-Truth View" button in LabZoneApp.tsx's Hinata panel.
// `radius` (blur scale) and `highPassStrength` both shape the high-pass diff histogram directly
// (unlike Fumiko's fixed blur constant), so both are staleness-guard inputs the same way Chie's
// `radius` already is.
export interface HinataZoneRecord {
  imageId: string
  threshold: number
  radius: number
  highPassStrength: number
  otsu255: number
  valleyEmphasis255: number
  peakThreshold255: number
  peakConfidence: 'high' | 'low'
  remark?: string
  timestamp: number
}

const STORAGE_KEY = 'oshipfp-lab-zone-hinata-state'

export function loadHinataZoneRecords(): HinataZoneRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveHinataZoneRecords(records: HinataZoneRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage full/unavailable — same as zoneStorage.ts, not worth surfacing for a dev tool.
  }
}

export function clearHinataZoneRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
