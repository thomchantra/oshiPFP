import type { LabParams } from '../lab/labPipeline'
import type { AlgoId, TagRecord } from './labGridTypes'

const STORAGE_KEY = 'oshipfp-lab-grid-state'

// Per (image, algo) baseline knobs — each image gets its own tuning per
// algorithm rather than one baseline shared across the whole test set,
// since this is an ongoing, recurring workflow across a growing image set.
export type Baselines = Record<string, Partial<Record<AlgoId, Partial<LabParams>>>>

export interface LabGridState {
  baselines: Baselines
  tags: TagRecord[]
}

const EMPTY_STATE: LabGridState = { baselines: {}, tags: [] }

// First localStorage use in this codebase — no existing convention to
// follow, so keep this defensive: any parse failure or shape mismatch just
// resets to empty rather than throwing and blanking the page.
export function loadLabGridState(): LabGridState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return EMPTY_STATE
    return {
      baselines: parsed.baselines && typeof parsed.baselines === 'object' ? parsed.baselines : {},
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    }
  } catch {
    return EMPTY_STATE
  }
}

export function saveLabGridState(state: LabGridState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full/unavailable (private browsing, quota) — tags/baselines
    // just won't persist this session; not worth surfacing as an error for
    // a dev-only lab tool.
  }
}
