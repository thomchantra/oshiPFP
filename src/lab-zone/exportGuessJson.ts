import { downloadBlob } from '../export/exportPica'
import type { GuessRecord } from './guessStorage'

export function exportGuessJson(records: GuessRecord[]): void {
  const payload = {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_zone_guess_ratings`,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-zone-guess-${Date.now()}.json`)
}
