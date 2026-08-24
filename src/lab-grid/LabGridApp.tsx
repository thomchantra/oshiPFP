import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { LabParams } from '../lab/labPipeline'
import { useLabPipeline } from '../lab/useLabPipeline'
import {
  ALGOS,
  DEFAULT_LAB_PARAMS,
  INTENSITY_PRESETS,
  TIER1_KNOBS,
  VALUE_GRID_SIZE,
  primaryKnobSweeps,
  toLabMode,
} from './labGridTypes'
import type { AlgoId, Intensity, NumericLabParamKey, TagRecord, TagValue, ValueTagRecord } from './labGridTypes'
import { TEST_IMAGES, fetchTestImageFile } from './testImages'
import { loadLabGridState, saveLabGridState } from './labGridStorage'
import type { Baselines, LabGridState } from './labGridStorage'
import { useBatchRender } from './useBatchRender'
import { useValueGridRender } from './useValueGridRender'
import { useTriplePreview } from './useTriplePreview'
import { exportGridJson, exportValueGridJson } from './exportGridJson'
import { scaleParams } from './intensityScaling'

type GridMode = 'intensity' | 'absolute'

// Slider drags fire many rapid 'input' events; each triple-preview refresh
// is 3 full renders + 3 toBlob captures, too heavy to run on every tick.
// Collapse rapid changes into one refresh after the user pauses.
const PREVIEW_DEBOUNCE_MS = 150

// Stable reference for "no baseline set yet" — a fresh `{}` literal on
// every render would give the baseline-tuning effect below a new object
// identity every time, even when the underlying value hasn't changed,
// re-firing it (and its un-synced pipeline.setMode/setParams, which
// schedule a render via requestAnimationFrame) on every re-render of this
// component — including the ones useBatchRender's own setProgress() calls
// trigger mid-grid-render, racing with and occasionally overwriting
// whatever a specific intensity cell's capture is trying to read.
const EMPTY_BASELINE: Partial<LabParams> = {}

const TAG_BUTTONS: { value: TagValue; label: string; color: string }[] = [
  { value: 'good', label: '✓ Good', color: '#2a7a3c' },
  { value: 'bad', label: '✗ Bad', color: '#a03030' },
  { value: 'maybe', label: '? Maybe', color: '#a08020' },
  { value: 'na', label: 'N/A', color: '#555' },
]

function setBaseline(
  baselines: Baselines,
  imageId: string,
  algo: AlgoId,
  field: keyof LabParams,
  value: LabParams[keyof LabParams],
): Baselines {
  return setBaselineFields(baselines, imageId, algo, { [field]: value })
}

function setBaselineFields(baselines: Baselines, imageId: string, algo: AlgoId, patch: Partial<LabParams>): Baselines {
  const forImage = baselines[imageId] ?? {}
  const forAlgo = forImage[algo] ?? {}
  return {
    ...baselines,
    [imageId]: {
      ...forImage,
      [algo]: { ...forAlgo, ...patch },
    },
  }
}

type GumiInkMode = 'image' | 'black' | 'white'

function gumiInkMode(baseline: Partial<LabParams>): GumiInkMode {
  if (baseline.vividMode) return 'image'
  const tint = (baseline.tintColor as [number, number, number] | undefined) ?? DEFAULT_LAB_PARAMS.tintColor
  return tint[0] > 0.5 ? 'white' : 'black'
}

export default function LabGridApp() {
  const pipeline = useLabPipeline()
  const batch = useBatchRender(pipeline)
  const valueBatch = useValueGridRender(pipeline)
  const triplePreview = useTriplePreview(pipeline)
  const [gridMode, setGridMode] = useState<GridMode>('intensity')
  const previewDebounceRef = useRef<number | null>(null)

  // Drag-to-resize the tuning-viewport/grid split — session-only (not
  // persisted), a pure layout preference rather than tagging data.
  const [previewHeight, setPreviewHeight] = useState(240)
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  function handleResizeStart(e: ReactPointerEvent<HTMLDivElement>) {
    resizeDragRef.current = { startY: e.clientY, startHeight: previewHeight }
    const handleMove = (moveEvent: PointerEvent) => {
      if (!resizeDragRef.current) return
      const delta = moveEvent.clientY - resizeDragRef.current.startY
      const next = Math.min(600, Math.max(120, resizeDragRef.current.startHeight + delta))
      setPreviewHeight(next)
    }
    const handleUp = () => {
      resizeDragRef.current = null
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const [state, setState] = useState<LabGridState>(() => loadLabGridState())
  const [selectedImageId, setSelectedImageId] = useState<string | null>(TEST_IMAGES[0]?.id ?? null)
  const [selectedAlgo, setSelectedAlgo] = useState<AlgoId>('pathA')
  const [gridAlgos, setGridAlgos] = useState<AlgoId[]>(ALGOS.map((a) => a.id))
  const [gridIntensities, setGridIntensities] = useState<Intensity[]>([...INTENSITY_PRESETS])

  useEffect(() => {
    saveLabGridState(state)
  }, [state])

  const selectedImage = TEST_IMAGES.find((i) => i.id === selectedImageId) ?? null

  // Baseline live preview: swap the pipeline's source image whenever the
  // selected test image changes.
  useEffect(() => {
    if (!selectedImage) return
    let cancelled = false
    fetchTestImageFile(selectedImage).then((file) => {
      if (!cancelled) {
        pipeline.loadFile(file).then(() => {
          if (!cancelled) triplePreview.refresh()
        })
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedImageId])

  const baseline = (selectedImageId && state.baselines[selectedImageId]?.[selectedAlgo]) || EMPTY_BASELINE

  // Baseline live preview: re-render (debounced) on algo/knob changes,
  // refreshing all 3 view-mode snapshots (original/raw/composited).
  useEffect(() => {
    const fullParams: LabParams = { ...DEFAULT_LAB_PARAMS, ...baseline }
    pipeline.setMode(toLabMode(selectedAlgo))
    pipeline.setParams(fullParams)

    if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = window.setTimeout(() => {
      triplePreview.refresh()
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      if (previewDebounceRef.current) window.clearTimeout(previewDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAlgo, baseline])

  const knobs = TIER1_KNOBS[selectedAlgo]

  function updateBaselineField<K extends keyof LabParams>(field: K, value: LabParams[K]) {
    if (!selectedImageId) return
    setState((prev) => ({ ...prev, baselines: setBaseline(prev.baselines, selectedImageId, selectedAlgo, field, value) }))
  }

  // Gumi ink color — reuses the same tintColor/vividMode fields Path D/F's
  // tint feature already has (see labPipeline.ts's ink-resolution pass on
  // the default Gumi branch) rather than a dedicated field.
  function applyGumiInkMode(mode: GumiInkMode) {
    if (!selectedImageId) return
    const patch: Partial<LabParams> =
      mode === 'image' ? { vividMode: true } : { vividMode: false, tintColor: mode === 'white' ? [1, 1, 1] : [0, 0, 0] }
    // Multiply's identity/no-op color is white, Screen's is black — a
    // white ink under Multiply (or black ink under Screen) is invisible
    // by construction, same mismatch already fixed for Hinata/Tsukiko's
    // tone target below. Auto-pair; still independently editable after.
    if (mode === 'white') patch.compositeBlendMode = 2
    else if (mode === 'black') patch.compositeBlendMode = 1
    setState((prev) => ({ ...prev, baselines: setBaselineFields(prev.baselines, selectedImageId, 'pathG', patch) }))
  }

  // Baselines persist in localStorage across sessions (by design, see
  // labGridStorage.ts) — but that means a baseline tuned into a degenerate
  // corner (e.g. a ramp band that ends up matching nothing) has no way
  // back except manually dragging every slider back. This clears just the
  // current image+algo's baseline, falling back to DEFAULT_LAB_PARAMS.
  function resetBaseline() {
    if (!selectedImageId) return
    setState((prev) => {
      const forImage = { ...(prev.baselines[selectedImageId] ?? {}) }
      delete forImage[selectedAlgo]
      return { ...prev, baselines: { ...prev.baselines, [selectedImageId]: forImage } }
    })
  }

  function toggleGridAlgo(id: AlgoId) {
    setGridAlgos((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]))
  }

  function toggleGridIntensity(intensity: Intensity) {
    setGridIntensities((prev) => (prev.includes(intensity) ? prev.filter((i) => i !== intensity) : [...prev, intensity]))
  }

  async function handleRenderGrid() {
    if (!selectedImage) return
    const sortedIntensities = [...gridIntensities].sort((a, b) => a - b)
    await batch.renderGrid(selectedImage, gridAlgos, sortedIntensities, state.baselines)
  }

  async function handleRenderValueGrid() {
    if (!selectedImage) return
    await valueBatch.renderGrid(selectedImage, gridAlgos)
  }

  function currentRecord(algo: AlgoId, intensity: Intensity): TagRecord | undefined {
    if (!selectedImageId) return undefined
    return state.tags.find((t) => t.imageId === selectedImageId && t.algo === algo && t.intensity === intensity)
  }

  // Shared upsert for both the tag-verdict buttons and the remark text box
  // — each patches only its own field, preserving whatever the other one
  // already holds (clicking ✗ Bad shouldn't blank out an existing remark,
  // and typing a remark shouldn't blank out an existing tag).
  function upsertTag(algo: AlgoId, intensity: Intensity, patch: Partial<Pick<TagRecord, 'tag' | 'remark'>>) {
    if (!selectedImageId) return
    setState((prev) => {
      const existing = prev.tags.find((t) => t.imageId === selectedImageId && t.algo === algo && t.intensity === intensity)
      const next: TagRecord = {
        imageId: selectedImageId,
        algo,
        intensity,
        tag: patch.tag ?? existing?.tag ?? 'maybe',
        remark: patch.remark ?? existing?.remark,
        timestamp: Date.now(),
      }
      return {
        ...prev,
        tags: [
          ...prev.tags.filter((t) => !(t.imageId === selectedImageId && t.algo === algo && t.intensity === intensity)),
          next,
        ],
      }
    })
  }

  function setTag(algo: AlgoId, intensity: Intensity, tag: TagValue) {
    upsertTag(algo, intensity, { tag })
  }

  function currentValueRecord(algo: AlgoId, stepIndex: number): ValueTagRecord | undefined {
    if (!selectedImageId) return undefined
    return state.valueTags.find((t) => t.imageId === selectedImageId && t.algo === algo && t.stepIndex === stepIndex)
  }

  function upsertValueTag(
    algo: AlgoId,
    stepIndex: number,
    values: Partial<Record<NumericLabParamKey, number>>,
    patch: Partial<Pick<ValueTagRecord, 'tag' | 'remark'>>,
  ) {
    if (!selectedImageId) return
    setState((prev) => {
      const existing = prev.valueTags.find((t) => t.imageId === selectedImageId && t.algo === algo && t.stepIndex === stepIndex)
      const next: ValueTagRecord = {
        imageId: selectedImageId,
        algo,
        stepIndex,
        values,
        tag: patch.tag ?? existing?.tag ?? 'maybe',
        remark: patch.remark ?? existing?.remark,
        timestamp: Date.now(),
      }
      return {
        ...prev,
        valueTags: [
          ...prev.valueTags.filter((t) => !(t.imageId === selectedImageId && t.algo === algo && t.stepIndex === stepIndex)),
          next,
        ],
      }
    })
  }

  // Sets this cell's swept field(s) to their step value(s), leaving every
  // other Tier-1 knob at whatever the baseline already has — unlike the
  // intensity grid's applyCellAsBaseline, there's no secondary-knob scaling
  // to apply since the absolute-value sweep only ever varies its own fixed
  // field set.
  function applyValueCellAsBaseline(algo: AlgoId, values: Partial<Record<NumericLabParamKey, number>>) {
    if (!selectedImageId) return
    setState((prev) => ({
      ...prev,
      baselines: setBaselineFields(prev.baselines, selectedImageId, algo, values),
    }))
    setSelectedAlgo(algo)
  }

  function applyCellAsBaseline(algo: AlgoId, intensity: Intensity) {
    if (!selectedImageId) return
    const existingBaseline = state.baselines[selectedImageId]?.[algo] ?? {}
    const resolvedBaseline: LabParams = { ...DEFAULT_LAB_PARAMS, ...existingBaseline }
    const scaled = scaleParams(algo, resolvedBaseline, intensity)
    setState((prev) => ({
      ...prev,
      baselines: {
        ...prev.baselines,
        [selectedImageId]: {
          ...prev.baselines[selectedImageId],
          [algo]: { ...existingBaseline, ...scaled },
        },
      },
    }))
    setSelectedAlgo(algo)
  }

  const taggedCount = useMemo(
    () => state.tags.filter((t) => t.imageId === selectedImageId).length,
    [state.tags, selectedImageId],
  )
  const valueTaggedCount = useMemo(
    () => state.valueTags.filter((t) => t.imageId === selectedImageId).length,
    [state.valueTags, selectedImageId],
  )

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: 'system-ui, sans-serif', fontSize: 13, color: '#eee', background: '#181818' }}>
      <div style={{ width: 320, borderRight: '1px solid #333', padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 16, margin: 0 }}>oshiPFP lab grid</h1>
        <p style={{ margin: 0, color: '#888' }}>v0.5 Instagram-mode baseline discovery</p>

        <section>
          <h2 style={sectionTitleStyle}>Test image</h2>
          {TEST_IMAGES.length === 0 ? (
            <p style={{ color: '#888' }}>
              No images found. Drop files into <code>lab-test-images/</code> at the repo root.
            </p>
          ) : (
            <select value={selectedImageId ?? ''} onChange={(e) => setSelectedImageId(e.target.value)} style={selectStyle}>
              {TEST_IMAGES.map((img) => (
                <option key={img.id} value={img.id}>
                  {img.id}
                </option>
              ))}
            </select>
          )}
          <p style={{ color: '#888', margin: '4px 0 0' }}>
            {taggedCount} intensity tags / {valueTaggedCount} absolute-value tags on this image
          </p>
        </section>

        <section>
          <h2 style={sectionTitleStyle}>Baseline tuning: algo</h2>
          <select value={selectedAlgo} onChange={(e) => setSelectedAlgo(e.target.value as AlgoId)} style={selectStyle}>
            {ALGOS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={sectionTitleStyle}>Tier-1 knobs ({ALGOS.find((a) => a.id === selectedAlgo)?.label})</h2>
            <button onClick={resetBaseline} style={{ ...tagButtonStyle, flexShrink: 0 }}>
              Reset to defaults
            </button>
          </div>
          {knobs.map((knob) => {
            const value = (baseline[knob.field] as number | undefined) ?? (DEFAULT_LAB_PARAMS[knob.field] as number)
            return (
              <label key={knob.field} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>
                  {knob.label}: {value.toFixed(2)}
                </span>
                <input
                  type="range"
                  min={knob.min}
                  max={knob.max}
                  step={knob.step}
                  value={value}
                  onChange={(e) => updateBaselineField(knob.field, Number(e.target.value))}
                />
              </label>
            )
          })}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={sectionTitleStyle}>Output</h2>
          <p style={{ margin: 0, color: '#888', fontSize: 11 }}>
            Controls how the detected mask/diff resolves onto the base image — this is what determines whether
            Composited lands on a white or black background, and (for Hinata/Tsukiko's gray diff output) which
            direction gray leans.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Blend mode</span>
            <select
              value={(baseline.compositeBlendMode as number | undefined) ?? DEFAULT_LAB_PARAMS.compositeBlendMode}
              onChange={(e) => updateBaselineField('compositeBlendMode', Number(e.target.value))}
              style={selectStyle}
            >
              <option value={0}>Replace</option>
              <option value={1}>Multiply</option>
              <option value={2}>Screen</option>
              <option value={3}>Overlay</option>
            </select>
          </label>

          {(selectedAlgo === 'pathH' || selectedAlgo === 'pathI') && (
            <>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>Tone target (takes priority over Threshold below)</span>
                <select
                  value={(baseline.hiToneTarget as LabParams['hiToneTarget'] | undefined) ?? DEFAULT_LAB_PARAMS.hiToneTarget}
                  onChange={(e) => {
                    const target = e.target.value as LabParams['hiToneTarget']
                    updateBaselineField('hiToneTarget', target)
                    // Tone target and blend mode need to agree to produce a
                    // legible result — e.g. a Screen-toned (bright-edges-
                    // on-black) diff multiplied onto the original crushes
                    // almost everything to black. Auto-pair a matching
                    // blend mode; still independently editable below.
                    if (target === 'multiply') updateBaselineField('compositeBlendMode', 1)
                    else if (target === 'screen') updateBaselineField('compositeBlendMode', 2)
                  }}
                  style={selectStyle}
                >
                  <option value="off">Off (raw gray diff)</option>
                  <option value="multiply">Multiply (darkens toward black bg)</option>
                  <option value="screen">Screen (lightens toward white bg)</option>
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="checkbox"
                  checked={(baseline.thresholdEnabled as boolean | undefined) ?? DEFAULT_LAB_PARAMS.thresholdEnabled}
                  onChange={(e) => updateBaselineField('thresholdEnabled', e.target.checked)}
                />
                Threshold enabled (binarize; ignored if Tone target is set)
              </label>
              {selectedAlgo === 'pathI' && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span>Threshold: {((baseline.threshold as number | undefined) ?? DEFAULT_LAB_PARAMS.threshold).toFixed(2)}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={(baseline.threshold as number | undefined) ?? DEFAULT_LAB_PARAMS.threshold}
                    onChange={(e) => updateBaselineField('threshold', Number(e.target.value))}
                  />
                </label>
              )}
            </>
          )}

          {selectedAlgo === 'pathG' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span>Ink color</span>
              <select value={gumiInkMode(baseline)} onChange={(e) => applyGumiInkMode(e.target.value as GumiInkMode)} style={selectStyle}>
                <option value="image">Image (real source color)</option>
                <option value="black">Solid black</option>
                <option value="white">Solid white</option>
              </select>
            </label>
          )}
        </section>

        <section>
          <h2 style={sectionTitleStyle}>Grid: algorithms</h2>
          {ALGOS.map((a) => (
            <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={gridAlgos.includes(a.id)} onChange={() => toggleGridAlgo(a.id)} />
              {a.label}
            </label>
          ))}
        </section>

        <section>
          <h2 style={sectionTitleStyle}>Grid: sweep type</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setGridMode('intensity')}
              style={{ ...buttonStyle, flex: 1, background: gridMode === 'intensity' ? '#3a5a3a' : '#2a2a2a' }}
            >
              Intensity ×
            </button>
            <button
              onClick={() => setGridMode('absolute')}
              style={{ ...buttonStyle, flex: 1, background: gridMode === 'absolute' ? '#3a5a3a' : '#2a2a2a' }}
            >
              Absolute value
            </button>
          </div>
          <p style={{ margin: '6px 0 0', color: '#888', fontSize: 11 }}>
            {gridMode === 'intensity'
              ? 'Scales each algo’s tuned baseline by a multiplier — tests how hard to push a baseline you already picked.'
              : 'Sweeps each algo’s primary sensitivity/threshold knob across 5 fixed values from DEFAULT_LAB_PARAMS, ignoring your manual baseline — tests what raw value the image itself calls for.'}
          </p>
        </section>

        {gridMode === 'intensity' ? (
          <section>
            <h2 style={sectionTitleStyle}>Grid: intensities</h2>
            {INTENSITY_PRESETS.map((intensity) => (
              <label key={intensity} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={gridIntensities.includes(intensity)} onChange={() => toggleGridIntensity(intensity)} />
                {Math.round(intensity * 100)}%
              </label>
            ))}
          </section>
        ) : (
          <section>
            <h2 style={sectionTitleStyle}>Grid: primary-knob values</h2>
            <p style={{ margin: 0, color: '#888', fontSize: 11 }}>5 steps per algo, own field/range each — see column headers in the grid.</p>
          </section>
        )}

        {gridMode === 'intensity' ? (
          <>
            <p style={{ margin: 0, color: '#888', fontSize: 11 }}>
              Render Grid takes the current image and, for each checked algorithm below, renders it at each checked
              intensity (50/100/150/200% — each algo's own Tier-1 knobs above scaled from its baseline) as a contact
              sheet you can tag ✓/✗/?/N/A per cell.
            </p>
            <button onClick={handleRenderGrid} disabled={!selectedImage || batch.isRendering} style={{ ...buttonStyle, padding: '10px 14px' }}>
              {batch.isRendering ? `Rendering ${batch.progress?.done ?? 0}/${batch.progress?.total ?? 0}…` : 'Render Grid'}
            </button>
            <button onClick={() => exportGridJson(state.tags)} style={buttonStyle}>
              Export JSON ({state.tags.length} tags total)
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: 0, color: '#888', fontSize: 11 }}>
              Render Grid takes the current image and, for each checked algorithm below, renders it at 5 fixed
              absolute values of that algo's primary knob (defaults elsewhere) as a contact sheet you can tag.
            </p>
            <button onClick={handleRenderValueGrid} disabled={!selectedImage || valueBatch.isRendering} style={{ ...buttonStyle, padding: '10px 14px' }}>
              {valueBatch.isRendering ? `Rendering ${valueBatch.progress?.done ?? 0}/${valueBatch.progress?.total ?? 0}…` : 'Render Grid'}
            </button>
            <button onClick={() => exportValueGridJson(state.valueTags)} style={buttonStyle}>
              Export JSON ({state.valueTags.length} tags total)
            </button>
          </>
        )}

        {pipeline.error && <p style={{ color: '#e66' }}>{pipeline.error}</p>}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Real GL canvas stays mounted (useLabPipeline needs it for the
            context) but visually tucked away — the 3 panels below are
            toBlob snapshots captured off it via useTriplePreview, not a
            live view. Must stay actually composited (not display:none) —
            a display:none canvas isn't painted by the browser, so
            toBlob() captures went stale/blank when this was display:none. */}
        <canvas ref={pipeline.canvasRef} style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
        <div style={{ height: previewHeight, flexShrink: 0, padding: 12, display: 'flex', gap: 12, overflow: 'auto' }}>
          {(
            [
              ['original', 'Original'],
              ['composited', 'Composited'],
              ['raw', 'Overlay (raw)'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', color: '#888', fontSize: 11, textTransform: 'uppercase' }}>{label}</p>
              <div style={{ background: '#111', border: '1px solid #333', height: previewHeight - 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {triplePreview.preview[key] ? (
                  <img
                    src={triplePreview.preview[key]!}
                    alt={label}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ color: '#555', fontSize: 12 }}>—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Drag-to-resize handle for the tuning-viewport/grid split. */}
        <div
          onPointerDown={handleResizeStart}
          style={{
            height: 8,
            flexShrink: 0,
            cursor: 'row-resize',
            background: '#222',
            borderTop: '1px solid #333',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ width: 40, height: 3, borderRadius: 2, background: '#555' }} />
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
          {gridMode === 'intensity' ? (
            batch.cells.length === 0 ? (
              <p style={{ color: '#888' }}>Tune a baseline per algorithm above, then click Render Grid.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${gridIntensities.length}, 1fr)`, gap: 8 }}>
                <div />
                {[...gridIntensities]
                  .sort((a, b) => a - b)
                  .map((intensity) => (
                    <div key={intensity} style={{ textAlign: 'center', color: '#888' }}>
                      {Math.round(intensity * 100)}%
                    </div>
                  ))}
                {gridAlgos.map((algo) => (
                  <Fragment key={algo}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {ALGOS.find((a) => a.id === algo)?.label}
                    </div>
                    {[...gridIntensities]
                      .sort((a, b) => a - b)
                      .map((intensity) => {
                        const cell = batch.cells.find((c) => c.algo === algo && c.intensity === intensity)
                        const record = currentRecord(algo, intensity)
                        const tag = record?.tag ?? null
                        return (
                          <div key={`${algo}-${intensity}`} style={cellStyle}>
                            {cell ? <img src={cell.url} alt={`${algo} ${intensity}`} style={{ width: '100%', display: 'block' }} /> : <div style={{ color: '#555' }}>—</div>}
                            <div style={{ display: 'flex', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                              {TAG_BUTTONS.map((tb) => (
                                <button
                                  key={tb.value}
                                  onClick={() => setTag(algo, intensity, tb.value)}
                                  style={{
                                    ...tagButtonStyle,
                                    background: tag === tb.value ? tb.color : '#2a2a2a',
                                  }}
                                >
                                  {tb.label}
                                </button>
                              ))}
                            </div>
                            {tag && (
                              <input
                                type="text"
                                placeholder="remark, e.g. too thick…"
                                value={record?.remark ?? ''}
                                onChange={(e) => upsertTag(algo, intensity, { remark: e.target.value })}
                                style={{ ...tagButtonStyle, marginTop: 2, width: '100%', boxSizing: 'border-box' }}
                              />
                            )}
                            {cell && (
                              <button onClick={() => applyCellAsBaseline(algo, intensity)} style={{ ...tagButtonStyle, marginTop: 2, width: '100%' }}>
                                Use as baseline
                              </button>
                            )}
                          </div>
                        )
                      })}
                  </Fragment>
                ))}
              </div>
            )
          ) : valueBatch.cells.length === 0 ? (
            <p style={{ color: '#888' }}>Check algorithms below, then click Render Grid.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `120px repeat(${VALUE_GRID_SIZE}, 1fr)`, gap: 8 }}>
              <div />
              {Array.from({ length: VALUE_GRID_SIZE }, (_, i) => (
                <div key={i} style={{ textAlign: 'center', color: '#888' }}>
                  step {i + 1}/{VALUE_GRID_SIZE}
                </div>
              ))}
              {gridAlgos.map((algo) => {
                const sweeps = primaryKnobSweeps(algo)
                return (
                  <Fragment key={algo}>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                      <span>{ALGOS.find((a) => a.id === algo)?.label}</span>
                      <span style={{ color: '#666', fontSize: 10 }}>{sweeps.map((s) => s.field).join(' + ')}</span>
                    </div>
                    {Array.from({ length: VALUE_GRID_SIZE }, (_, stepIndex) => {
                      const stepValues: Partial<Record<NumericLabParamKey, number>> = {}
                      for (const sweep of sweeps) stepValues[sweep.field] = sweep.values[stepIndex]
                      const cell = valueBatch.cells.find((c) => c.algo === algo && c.stepIndex === stepIndex)
                      const record = currentValueRecord(algo, stepIndex)
                      const tag = record?.tag ?? null
                      const valueLabel = sweeps.map((s) => (stepValues[s.field] as number).toFixed(2)).join(' / ')
                      return (
                        <div key={`${algo}-${stepIndex}`} style={cellStyle}>
                          <div style={{ color: '#888', fontSize: 10, marginBottom: 2 }}>{valueLabel}</div>
                          {cell ? <img src={cell.url} alt={`${algo} step ${stepIndex}`} style={{ width: '100%', display: 'block' }} /> : <div style={{ color: '#555' }}>—</div>}
                          <div style={{ display: 'flex', gap: 2, marginTop: 4, flexWrap: 'wrap' }}>
                            {TAG_BUTTONS.map((tb) => (
                              <button
                                key={tb.value}
                                onClick={() => upsertValueTag(algo, stepIndex, stepValues, { tag: tb.value })}
                                style={{
                                  ...tagButtonStyle,
                                  background: tag === tb.value ? tb.color : '#2a2a2a',
                                }}
                              >
                                {tb.label}
                              </button>
                            ))}
                          </div>
                          {tag && (
                            <input
                              type="text"
                              placeholder="remark, e.g. too thick…"
                              value={record?.remark ?? ''}
                              onChange={(e) => upsertValueTag(algo, stepIndex, stepValues, { remark: e.target.value })}
                              style={{ ...tagButtonStyle, marginTop: 2, width: '100%', boxSizing: 'border-box' }}
                            />
                          )}
                          {cell && (
                            <button onClick={() => applyValueCellAsBaseline(algo, stepValues)} style={{ ...tagButtonStyle, marginTop: 2, width: '100%' }}>
                              Use as baseline
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const sectionTitleStyle: React.CSSProperties = { fontSize: 12, textTransform: 'uppercase', color: '#888', margin: '0 0 6px' }
const selectStyle: React.CSSProperties = { width: '100%', padding: 6, background: '#222', color: '#eee', border: '1px solid #444' }
const buttonStyle: React.CSSProperties = { padding: '6px 10px', background: '#2a2a2a', color: '#eee', border: '1px solid #444', cursor: 'pointer' }
const tagButtonStyle: React.CSSProperties = { padding: '2px 6px', fontSize: 11, background: '#2a2a2a', color: '#eee', border: '1px solid #444', cursor: 'pointer' }
const cellStyle: React.CSSProperties = { border: '1px solid #333', padding: 4, background: '#1e1e1e' }
