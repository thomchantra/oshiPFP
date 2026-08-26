import { downloadBlob } from '../export/exportPica'
import type { GumiZoneRecord } from './gumiZoneStorage'

export function exportGumiZoneJson(records: GumiZoneRecord[]): void {
  const payload = {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_gumi_ground_truth`,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-zone-gumi-${Date.now()}.json`)
}
