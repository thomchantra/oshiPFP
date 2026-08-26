// Gumi (pathG)'s own ground-truth capture — a separate record shape from ZoneRecord (Botan/
// Daiya's) and ChieZoneRecord, since Gumi's detection has its own multi-knob tuning surface
// (contrast-boost pre-pass, overdrive, gap closing, soft detection) beyond the single threshold
// Botan/Daiya converge on. See changelog/oshipfp-v0.5-instagram-mode-saga.md and
// thresholdStats.ts's peakBasedThresholdBright doc comment for the detection math this pairs with.
export interface GumiZoneRecord {
  imageId: string
  threshold: number
  radius: number
  gumiContrastBoost: number
  gumiOverdrive: number
  gumiGapClosing: boolean
  gumiSoftDetection: boolean
  gumiSoftness: number
  gumiTopHatMode: boolean
  gumiTopHatRadius: number
  toneShapingMode: 'clip' | 'pinch'
  toneShapingExposure: number
  toneShapingContrast: number
  clipBlackClip: number
  clipWhiteClip: number
  pinchPosition: number
  pinchExpand: number
  pinchFeathering: number
  otsu255: number
  valleyEmphasis255: number
  brightPeakThreshold255: number
  brightPeakConfidence: 'high' | 'low'
  remark?: string
  timestamp: number
}

const STORAGE_KEY = 'oshipfp-lab-zone-gumi-state'

export function loadGumiZoneRecords(): GumiZoneRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGumiZoneRecords(records: GumiZoneRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage full/unavailable — same as zoneStorage.ts, not worth surfacing for a dev tool.
  }
}

export function clearGumiZoneRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
