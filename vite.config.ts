import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // lab.html is a dev-only algorithm-tuning harness, not part of the public
  // app — excluded from `npm run build` (mode 'production') by default so it
  // doesn't ship to a real deploy, but still reachable any time via
  // `npm run dev` (the dev server serves any file in the project root
  // regardless of this config, since rollupOptions.input only governs the
  // production bundle) or via `npm run build:with-lab` when it's actually
  // needed for an empirical-testing round.
  const includeLab = mode !== 'production' || process.env.INCLUDE_LAB === 'true'
  const input: Record<string, string> = { main: 'index.html' }
  if (includeLab) {
    input.lab = 'lab.html'
    input.labGrid = 'lab-grid.html'
    input.labZone = 'lab-zone.html'
  }
  return {
    plugins: [react()],
    build: {
      rollupOptions: { input },
    },
  }
})
