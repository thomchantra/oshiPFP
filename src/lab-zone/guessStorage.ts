import type { LineArtMode } from '../types'

// One record per "the peak-based algorithm guessed this threshold, I looked at the result applied
// live, and here's how good it actually is" — separate from ZoneRecord (which captures the user's
// own manually-converged ground truth) since this rates the *algorithm's* output specifically.
// See changelog/oshipfp-v0.5-instagram-mode-saga.md session 6.
export interface GuessRecord {
  imageId: string
  algo: LineArtMode
  guessedThreshold255: number
  guessConfidence: 'high' | 'low'
  rating: 'good' | 'maybe' | 'bad'
  remark?: string
  timestamp: number
}

const STORAGE_KEY = 'oshipfp-lab-zone-guess-state'

export function loadGuessRecords(): GuessRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveGuessRecords(records: GuessRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    // Storage full/unavailable — same as zoneStorage.ts, not worth surfacing for a dev tool.
  }
}

export function clearGuessRecords(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
