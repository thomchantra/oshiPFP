import type { LineArtMode, LineArtParams } from '../types'

/** One "filter" — a named, pre-tuned Line Art recipe for the Simplified-mode carousel, distinct
 * from src/presets/ (which is a static before/after demo-photo gallery for the Advanced panel).
 * `params` is a whitelisted subset of LineArtParams: exactly the fields Simplified mode's macro
 * controls expose for `algo` (see docs/0.5-simplified-mode-mvp-plan.md's mapping table) — not a
 * full LineArtParams object, and not a separate macro-named schema, since every macro control
 * already corresponds 1:1 to a real LineArtParams field. No image fields: unlike presets, a
 * filter's thumbnail is live-rendered against the user's own photo (Stage D), not a static asset. */
export interface FilterManifestEntry {
  id: string
  algo: LineArtMode
  label: string
  params: Partial<LineArtParams>
}
