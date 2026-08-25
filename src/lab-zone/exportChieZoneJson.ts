import { downloadBlob } from '../export/exportPica'
import type { ChieZoneRecord } from './chieZoneStorage'

export function exportChieZoneJson(records: ChieZoneRecord[]): void {
  const payload = {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_chie_gate_threshold`,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-zone-chie-${Date.now()}.json`)
}
