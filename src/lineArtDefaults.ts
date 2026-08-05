import type { LineArtMode, LineArtParams } from './types'

/** Per-algorithm default overrides — used both by LineArtPanel (when switching modes fresh) and App.tsx (to seed each algorithm's initial cached params, see the per-mode memory there). */
export const LINE_ART_MODE_DEFAULTS: Record<LineArtMode, Partial<LineArtParams>> = {
  pathB: {
    opacity: 1,
    threshold: 0,
    radius: 1,
    hardness: 1,
    blobContrast: 1,
    colorExpansion: true,
    colorContrast: 1,
    tintColor: [0, 0, 0],
  },
  pathC: { opacity: 1, gateThreshold: 0, radius: 1, hardness: 1 },
  pathD: { opacity: 1, threshold: 0.05, colorMode: 'tint', tintColor: [1, 0.475, 0.886], vividDeadzone: 0.15, vividBoost: 1 },
  pathF: {
    opacity: 1,
    sensitivity: 3,
    radius: 0.5,
    colorMode: 'findEdge',
    saturation: 0.5,
    tintColor: [1, 0.475, 0.886],
    vividDeadzone: 0.15,
    vividBoost: 1,
  },
}
