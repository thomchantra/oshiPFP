import { downloadBlob } from '../export/exportPica'
import type { PinchGuessRecord } from './pinchGuessStorage'

export function exportPinchGuessJson(records: PinchGuessRecord[]): void {
  const payload = {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_gumi_pinch_position_guess`,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-zone-pinch-guess-${Date.now()}.json`)
}
