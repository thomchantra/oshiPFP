import { downloadBlob } from '../export/exportPica'
import type { ZoneRecord } from './zoneStorage'

export function exportZoneJson(records: ZoneRecord[]): void {
  const payload = {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_zone_threshold`,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-zone-${Date.now()}.json`)
}
