import { downloadBlob } from '../export/exportPica'
import type { HinataZoneRecord } from './hinataZoneStorage'

export function exportHinataZoneJson(records: HinataZoneRecord[]): void {
  const payload = {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_hinata_threshold`,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-zone-hinata-${Date.now()}.json`)
}
