/** Dev-only ring-buffer tracer for the Invert Fill Flip-Flop Bug investigation (see
 * docs/oshiPFP-v0.3-tuningspecs.md, "Invert Fill Flip-Flop Bug"). Session 10's static/instrumented
 * tracing couldn't pin down whether a Gumi->Botan round-trip desyncs React state, the params object
 * handed to the pipeline, or the actual GPU uniform — this logs all three at their respective
 * boundaries with a shared timeline so a live repro can be diffed after the fact.
 *
 * Not wired to any UI on purpose — call `window.__pfpTrace.dump()` in the devtools console after
 * reproducing the symptom, or `.clear()` first to isolate just the repro sequence. No-ops entirely
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
