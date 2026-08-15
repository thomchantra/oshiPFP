/** Dev-only debug trace ring buffer, see docs/oshiPFP-invert-bug-devtool-trace-method.md for usage.
 *
 * Not wired to any UI on purpose — call `window.__pfpTrace.dump()` in the devtools console after
 * reproducing a symptom, or `.clear()` first to isolate just the repro sequence. No-ops entirely
 * outside dev builds (import.meta.env.DEV), so this never ships. */

export interface TraceEntry {
  t: number
  tag: string
  [key: string]: unknown
}

const MAX_ENTRIES = 1000
const buffer: TraceEntry[] = []

export function trace(tag: string, fields: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) return
  buffer.push({ t: performance.now(), tag, ...fields })
  if (buffer.length > MAX_ENTRIES) buffer.shift()
}

export function dumpTrace(): TraceEntry[] {
  return [...buffer]
}

export function clearTrace(): void {
  buffer.length = 0
}

declare global {
  interface Window {
    __pfpTrace?: { dump: () => TraceEntry[]; clear: () => void }
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__pfpTrace = { dump: dumpTrace, clear: clearTrace }
}
