import { getManagedFields } from './macroFields'
import type { FilterManifestEntry } from './filterTypes'
import type { LineArtMode } from '../types'

/** Each filter is a self-contained JSON file under ./data/<algo>/<slug>.json, auto-discovered here
 * at build time — same pattern as src/presets/presetManifest.ts. Drop a new filter JSON, get an
 * entry, no manual registration. */
const modules = import.meta.glob('./data/*/*.json', { eager: true }) as Record<string, { default: FilterManifestEntry }>

export const FILTER_MANIFEST: FilterManifestEntry[] = Object.keys(modules)
  .sort()
  .map((key) => modules[key].default)

if (import.meta.env.DEV) {
  // Cross-filter self-containment guard. Every field that ANY filter on an algo manages (rendered
  // control or hidden lockedFields) must appear in EVERY filter's `params` on that algo — even the
  // ones that have no local reason to care about it. Otherwise, selecting a filter that omits the
  // field leaves whatever a *sibling* filter last wrote into the shared per-algo paramsByMode base
  // (e.g. Gumi Fill's `gumiFillMode`/`gumiFillPixelThreshold` leaking into the Line-mode filters,
  // silently switching which pipeline branch they render through). Warn loudly at load in dev.
  const byAlgo = new Map<LineArtMode, FilterManifestEntry[]>()
  for (const f of FILTER_MANIFEST) {
    const arr = byAlgo.get(f.algo) ?? []
    arr.push(f)
    byAlgo.set(f.algo, arr)
  }
  for (const [algo, filters] of byAlgo) {
    const union = new Set<string>()
    for (const f of filters) for (const k of getManagedFields(f)) union.add(k)
    for (const f of filters) {
      const missing = [...union].filter((k) => !(k in f.params))
      if (missing.length) {
        console.warn(`[filters] "${f.id}" (${algo}) omits params a sibling filter manages: ${missing.join(', ')} — state-leak risk, add explicit values (+ lockedFields if not a visible control)`)
      }
    }
  }
}
