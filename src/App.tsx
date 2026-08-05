import { useEffect, useRef, useState } from 'react'
import TabNav from './components/TabNav'
import HeaderBar from './components/HeaderBar'
import BlankState from './components/BlankState'
import PreviewViewport from './components/PreviewViewport'
import { CropTopContent, CropDebugInfo } from './components/CropChrome'
import CropPanel from './components/CropPanel'
import SegmentedControl from './components/SegmentedControl'
import ColorPanel from './components/ColorPanel'
import LineArtPanel from './components/LineArtPanel'
import { LINE_ART_MODE_DEFAULTS } from './lineArtDefaults'
import ExportPanel from './components/ExportPanel'
import { getTheme, toggleTheme } from './theme'
import { usePipeline } from './gl/usePipeline'
import { useCropInteraction } from './crop/useCropInteraction'
import { useElementSize } from './crop/useElementSize'
import type { PfpMode } from './components/HeaderBar'
import type { CropMode, LineArtDisplayMode, LineArtMode, LineArtParams, TabDef } from './types'

const TABS: TabDef[] = [
  { id: 'crop', label: 'CROP', icon: 'crop' },
  { id: 'maximizer', label: 'LINEART', icon: 'lineart' },
  { id: 'color', label: 'COLOR', icon: 'color' },
  { id: 'export', label: 'EXPORT', icon: 'download' },
]

const DISPLAY_MODE_OPTIONS: { value: LineArtDisplayMode; label: string }[] = [
  { value: 'original', label: 'ORIGINAL' },
  { value: 'composite', label: 'COMPOSITE' },
  { value: 'overlay', label: 'OVERLAY' },
]

/** Botan and Chie never produce a separate mask — Botan defaults to (and Chie always uses) a plain crossfade of its own resolved output onto the base, so at the default 100% opacity "Overlay" and "Composite" render identically. Hiding it avoids a confusing no-op toggle. */
const OVERLAY_HIDDEN_MODES = new Set<LineArtMode>(['pathB', 'pathC'])

const LINE_ART_MODES: LineArtMode[] = ['pathB', 'pathC', 'pathD', 'pathF']

const BASE_LINE_ART_PARAMS: LineArtParams = {
  mode: 'pathB',
  displayMode: 'composite',
  toneShapingEnabled: false,
  toneShaping: { exposure: 0, contrast: 0, blackClip: 0, whiteClip: 1 },
  denoiseEnabled: false,
  denoise: { intensity: 0, threshold: 0 },
  opacity: 1,
  blendMode: 'multiply',
  threshold: 0,
  radius: 1,
  hardness: 1,
  blobContrast: 1,
  colorExpansion: true,
  colorContrast: 1,
  gateThreshold: 0,
  sensitivity: 3,
  saturation: 0.5,
  colorMode: 'tint',
  tintColor: [1, 0.475, 0.886],
  vividDeadzone: 0.15,
  vividBoost: 1,
}

function buildDefaultParams(mode: LineArtMode): LineArtParams {
  return { ...BASE_LINE_ART_PARAMS, mode, ...LINE_ART_MODE_DEFAULTS[mode] }
}

/** One independent params object per algorithm — so tweaking Botan, switching to Chie, and switching back doesn't lose Botan's edits (each mode remembers its own values until page refresh). displayMode lives outside this map since it's a global viewport toggle, not per-algorithm. */
function buildInitialParamsByMode(): Record<LineArtMode, LineArtParams> {
  const byMode = {} as Record<LineArtMode, LineArtParams>
  for (const mode of LINE_ART_MODES) {
    byMode[mode] = buildDefaultParams(mode)
  }
  return byMode
}

export default function App() {
  const [tab, setTab] = useState<string | null>('crop')
  const [theme, setTheme] = useState(getTheme)
  const [pfpMode, setPfpMode] = useState<PfpMode>('square')
  const [cropMode, setCropMode] = useState<CropMode>('square')
  const [lineArtMode, setLineArtMode] = useState<LineArtMode>('pathB')
  const [lineArtDisplayMode, setLineArtDisplayMode] = useState<LineArtDisplayMode>('composite')
  const [paramsByMode, setParamsByMode] = useState<Record<LineArtMode, LineArtParams>>(buildInitialParamsByMode)
  const pipeline = usePipeline()
  const hasImage = pipeline.sourceSize !== null
  const viewportWrapperRef = useRef<HTMLDivElement | null>(null)

  const lineArtParams: LineArtParams = { ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode }

  // Measured from the wrapper (a pure CSS-layout box) rather than the canvas
  // element itself — the canvas's own backing-store resolution is derived
  // from this same aspect, so watching it directly risked a measure->resize->
  // remeasure feedback loop causing a visible jitter when switching tabs.
  const wrapperSize = useElementSize(viewportWrapperRef)
  // 'original' mode's aspect must be the image's own fixed native aspect,
  // not whatever the wrapper happens to measure — the wrapper's shape varies
  // per tab (Line Art's bottom sheet eats vertical space Crop's pills don't),
  // so deriving aspect from it made a 4:5 portrait source render at a
  // different apparent shape on each tab. sourceSize is fixed once an image
  // loads, so basing it there keeps 'original' framing identical everywhere.
  const sourceAspect = pipeline.sourceSize ? pipeline.sourceSize.width / pipeline.sourceSize.height : 1
  const aspect = cropMode === 'square' ? 1 : sourceAspect
  // Explicit pixel size for the square box, computed in JS rather than via
  // CSS aspect-ratio + max-height — that combination can only shrink height
  // and leaves width fixed at 100%, squashing the square into an ellipse
  // once the bottom sheet takes enough room. min() of both wrapper
  // dimensions guarantees a true (undistorted) square that fits either way.
  const squareSize = cropMode === 'square' && wrapperSize ? Math.min(wrapperSize.width, wrapperSize.height) : undefined
  // Same class of problem for 'original': contain-fit the fixed sourceAspect
  // box within whatever space the wrapper actually has this tab, rather than
  // letting it stretch to 100% width/height (which is what silently distorted
  // it to the wrapper's own aspect before).
  const originalSize =
    cropMode === 'original' && wrapperSize
      ? wrapperSize.width / wrapperSize.height > sourceAspect
        ? { width: wrapperSize.height * sourceAspect, height: wrapperSize.height }
        : { width: wrapperSize.width, height: wrapperSize.width / sourceAspect }
      : undefined

  // 'original' means "show the whole image, uncropped" — it's a fixed,
  // non-repositionable framing (fill-width/fill-height at native aspect),
  // not an actual crop tool. Only 'square' mode is interactive pan/zoom;
  // letting 'original' also pan/zoom let it drift off-center, which then
  // desynced the Line Art viewport and the corner preview (both read the
  // same crop rect) from what Crop tab itself was showing.
  const crop = useCropInteraction({
    enabled: tab === 'crop' && cropMode === 'square',
    sourceSize: pipeline.sourceSize,
    aspect,
    onRectChange: pipeline.setCropRect,
  })

  // Line Art's algorithm chain (JFA etc.) only actually needs to run live
  // while its own tab is open — freeze it everywhere else so Crop-tab pan/
  // zoom (which fires setCropRect on every pointer-move) doesn't pay for a
  // recompute nobody's looking at.
  useEffect(() => {
    pipeline.setLineArtActive(tab === 'maximizer')
    // pipeline identity is stable; only re-run when the active tab changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    pipeline.setLineArtParams({ ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode })
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsByMode, lineArtMode, lineArtDisplayMode])

  // Botan/Chie don't have a meaningful Overlay view (see OVERLAY_HIDDEN_MODES) —
  // if the user was on Overlay and switches into one of those algorithms, fall
  // back to Composite rather than leaving a hidden option selected.
  useEffect(() => {
    if (OVERLAY_HIDDEN_MODES.has(lineArtMode) && lineArtDisplayMode === 'overlay') {
      setLineArtDisplayMode('composite')
    }
  }, [lineArtMode, lineArtDisplayMode])

  // Fumiko's "Find Edge" color mode only supports Multiply (see pipeline.ts's
  // forcedMultiply) — LineArtPanel hides the other two pills for that combo,
  // but if a user had Screen/Overlay selected on Tint/Vivid and switches
  // straight into Find Edge, snap the cached param back to Multiply so it
  // doesn't silently keep a hidden, non-applied selection.
  useEffect(() => {
    const pathFParams = paramsByMode.pathF
    if (pathFParams.colorMode === 'findEdge' && pathFParams.blendMode !== 'multiply') {
      setParamsByMode((prev) => ({ ...prev, pathF: { ...prev.pathF, blendMode: 'multiply' } }))
    }
  }, [paramsByMode.pathF])

  // LineArtPanel's onChange either signals a mode switch (mode differs from
  // the currently active one — just swap which cached entry is active, don't
  // touch the cache) or an in-place edit (cache it under the active mode).
  const handleLineArtChange = (next: LineArtParams) => {
    if (next.mode !== lineArtMode) {
      setLineArtMode(next.mode)
      return
    }
    setParamsByMode((prev) => ({ ...prev, [lineArtMode]: next }))
  }

  const handleLineArtReset = () => {
    setParamsByMode((prev) => ({ ...prev, [lineArtMode]: buildDefaultParams(lineArtMode) }))
    setLineArtDisplayMode('composite')
  }

  const selectTab = (id: string) => setTab((current) => (current === id ? null : id))

  return (
    <div className="app">
      <HeaderBar
        onLoadFile={pipeline.loadFile}
        pfpMode={pfpMode}
        onPfpModeChange={setPfpMode}
        sourceCanvasRef={pipeline.canvasRef}
        hasImage={hasImage}
        theme={theme}
        onToggleTheme={() => setTheme(toggleTheme())}
      />

      <div className="viewport-area">
        {hasImage && tab === 'crop' && <CropTopContent zoom={crop.transform.scale} onZoomReset={() => {}} />}
        {hasImage && tab === 'crop' && (
          <CropDebugInfo sourceSize={pipeline.sourceSize} fileInfo={pipeline.fileInfo} />
        )}
        {hasImage && tab === 'maximizer' && (
          <SegmentedControl
            options={
              OVERLAY_HIDDEN_MODES.has(lineArtMode)
                ? DISPLAY_MODE_OPTIONS.filter((opt) => opt.value !== 'overlay')
                : DISPLAY_MODE_OPTIONS
            }
            value={lineArtDisplayMode}
            onChange={setLineArtDisplayMode}
          />
        )}

        {/* The canvas/Pipeline must stay mounted regardless of hasImage — loadFile()
            needs a live WebGL context to load into in the first place. */}
        <div
          ref={viewportWrapperRef}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 0,
            flex: '1 1 auto',
          }}
        >
          <PreviewViewport
            canvasRef={pipeline.canvasRef}
            viewportRef={crop.viewportRef}
            cropMode={cropMode}
            squareSize={squareSize}
            originalSize={originalSize}
            circle={pfpMode === 'circle'}
            interactive={tab === 'crop' && cropMode === 'square'}
            overlay={!hasImage ? <BlankState onLoadFile={pipeline.loadFile} circle={pfpMode === 'circle'} /> : undefined}
            onPointerDown={crop.handlePointerDown}
            onPointerMove={crop.handlePointerMove}
            onPointerUp={crop.endPointer}
            onPointerCancel={crop.endPointer}
          />
          {pipeline.error && (
            <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 12 }}>{pipeline.error}</p>
          )}
        </div>

        {hasImage && tab === 'crop' && (
          <CropPanel mode={cropMode} onModeChange={setCropMode} onEnhanceChange={pipeline.setEnhanceParams} />
        )}

        {hasImage && tab === 'color' && <ColorPanel onCurveChange={pipeline.setCurveLut} onHslChange={pipeline.setHsl} />}
        {hasImage && tab === 'maximizer' && (
          <LineArtPanel params={lineArtParams} onChange={handleLineArtChange} onReset={handleLineArtReset} />
        )}
        {hasImage && tab === 'export' && <ExportPanel sourceSize={pipeline.sourceSize} readFinalPixels={pipeline.readFinalPixels} />}
      </div>

      <TabNav tabs={TABS} activeId={tab} disabled={!hasImage} onSelect={selectTab} />
    </div>
  )
}
