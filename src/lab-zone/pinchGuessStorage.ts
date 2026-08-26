// Gumi's Pinch-position auto-guess (stroke-shape-score sweep, see
// src/imageStats/pinchPositionStats.ts) ground-truth/rating capture — a separate record shape
// from GuessRecord (Botan/Daiya/Chie's threshold guess) since this guesses a different field
// entirely (toneShaping.pinchMode.position, not a top-level threshold-family field) and is its
// own unvalidated algorithm, not yet folded into the generic guess flow.
export interface PinchGuessRecord {
  imageId: string
  guessedPosition255: number
  guessScore: number
  guessDensity: number
  rating: 'good' | 'maybe' | 'bad'
  remark?: string
  timestamp: number
}

const STORAGE_KEY = 'oshipfp-lab-zone-pinch-guess-state'

export function loadPinchGuessRecords(): PinchGuessRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePinchGuessRecords(records: PinchGuessRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage full/unavailable — same as guessStorage.ts, not worth surfacing for a dev tool.
  }
}

export function clearPinchGuessRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
