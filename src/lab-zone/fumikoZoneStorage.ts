// Fumiko (pathF)'s own ground-truth capture — same shape/rationale as chieZoneStorage.ts (not a
// reuse of ZoneRecord: Fumiko's detection is a Sobel gradient-magnitude cutoff, not raw luminance
// or Chie's erosion edge-strength). `sensitivity` is the real tunable knob (findEdges.frag.ts's
// `uSensitivity`); `blobContrast` (the shader's `uGamma`) is recorded for context even though it
// doesn't affect the gradient-magnitude histogram itself, same as Chie recording `hardness`. Blur
// radius is a fixed shader constant (1.2, not user-tunable), so unlike Chie/Hinata there's no
// staleness risk to guard against here.
export interface FumikoZoneRecord {
  imageId: string
  sensitivity: number
  blobContrast: number
  otsu255: number
  valleyEmphasis255: number
  peakThreshold255: number
  peakConfidence: 'high' | 'low'
  remark?: string
  timestamp: number
}

const STORAGE_KEY = 'oshipfp-lab-zone-fumiko-state'

export function loadFumikoZoneRecords(): FumikoZoneRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveFumikoZoneRecords(records: FumikoZoneRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage full/unavailable — same as zoneStorage.ts, not worth surfacing for a dev tool.
  }
}

export function clearFumikoZoneRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
