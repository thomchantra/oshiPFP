import { downloadBlob } from '../export/exportPica'
import { algoLabel } from './labGridTypes'
import type { TagRecord, ValueTagRecord } from './labGridTypes'

// Matches docs/0.5-lab-throwaway.md's Phase 4 export schema: one entry per
// tagged image, each carrying its tag records. Images with zero tags are
// omitted rather than exported empty.
export function buildGridExport(tags: TagRecord[]) {
  const byImage = new Map<string, TagRecord[]>()
  for (const tag of tags) {
    const list = byImage.get(tag.imageId) ?? []
    list.push(tag)
    byImage.set(tag.imageId, list)
  }

  const images = Array.from(byImage.entries()).map(([id, records]) => ({
    id,
    tags: records.map((r) => ({
      algo: r.algo,
      algo_label: algoLabel(r.algo),
      intensity: r.intensity,
      tag: r.tag,
      ...(r.remark ? { remark: r.remark } : {}),
      timestamp: r.timestamp,
    })),
  }))

  return {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_baseline`,
    images,
  }
}

export function exportGridJson(tags: TagRecord[]): void {
  const payload = buildGridExport(tags)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-grid-${Date.now()}.json`)
}

// Absolute-value sweep export — separate schema from buildGridExport since
// the two sweeps answer different questions (see labGridStorage.ts's
// valueTags doc comment). Includes the field name(s) and actual swept
// value(s) per record, so the exported JSON is self-describing without
// needing to cross-reference PRIMARY_KNOB_FIELDS/primaryKnobSweeps.
export function buildValueGridExport(valueTags: ValueTagRecord[]) {
  const byImage = new Map<string, ValueTagRecord[]>()
  for (const tag of valueTags) {
    const list = byImage.get(tag.imageId) ?? []
    list.push(tag)
    byImage.set(tag.imageId, list)
  }

  const images = Array.from(byImage.entries()).map(([id, records]) => ({
    id,
    tags: records.map((r) => ({
      algo: r.algo,
      algo_label: algoLabel(r.algo),
      step_index: r.stepIndex,
      values: r.values,
      tag: r.tag,
      ...(r.remark ? { remark: r.remark } : {}),
      timestamp: r.timestamp,
    })),
  }))

  return {
    test_run: `${new Date().toISOString().slice(0, 10)}_instagram_absolute_value`,
    images,
  }
}

export function exportValueGridJson(valueTags: ValueTagRecord[]): void {
  const payload = buildValueGridExport(valueTags)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  downloadBlob(blob, `oshipfp-lab-grid-values-${Date.now()}.json`)
}
