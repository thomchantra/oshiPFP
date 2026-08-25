import type { FilterManifestEntry } from './filterTypes'

/** Each filter is a self-contained JSON file under ./data/<algo>/<slug>.json, auto-discovered here
 * at build time — same pattern as src/presets/presetManifest.ts. Drop a new filter JSON, get an
 * entry, no manual registration. */
const modules = import.meta.glob('./data/*/*.json', { eager: true }) as Record<string, { default: FilterManifestEntry }>

export const FILTER_MANIFEST: FilterManifestEntry[] = Object.keys(modules)
  .sort()
  .map((key) => modules[key].default)
