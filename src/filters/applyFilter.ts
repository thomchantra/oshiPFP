import type { LineArtMode, LineArtParams } from '../types'
import type { FilterManifestEntry } from './filterTypes'

export interface ApplyFilterSetters {
  setLineArtMode: (mode: LineArtMode) => void
  setParamsByMode: (updater: (prev: Record<LineArtMode, LineArtParams>) => Record<LineArtMode, LineArtParams>) => void
}

/** Applies a filter's JSON defaults, then any session-accumulated overrides for that filter on top
 * (so re-selecting a previously-edited filter restores exactly where the user left it), merged
 * onto the algo's own current params — same "merge onto current, don't replace" convention as
 * src/presets/applyPreset.ts. Kept as its own module rather than folded into applyPreset.ts: filters
 * and presets are deliberately separate systems (see filterTypes.ts), not variants of one thing. */
export function applyFilter(filter: FilterManifestEntry, existingOverride: Partial<LineArtParams>, setters: ApplyFilterSetters): void {
  setters.setParamsByMode((prev) => ({
    ...prev,
    [filter.algo]: { ...prev[filter.algo], ...filter.params, ...existingOverride },
  }))
  setters.setLineArtMode(filter.algo)
}
