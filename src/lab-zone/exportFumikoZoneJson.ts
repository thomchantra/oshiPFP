import { downloadBlob } from '../export/exportPica'
import type { FumikoZoneRecord } from './fumikoZoneStorage'

export function exportFumikoZoneJson(records: FumikoZoneRecord[]): void {
  const payload = {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_fumiko_sensitivity`,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-zone-fumiko-${Date.now()}.json`)
}
