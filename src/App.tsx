import { useEffect, useRef, useState } from 'react'
import TabNav from './components/TabNav'
import HeaderBar from './components/HeaderBar'
import BlankState from './components/BlankState'
import PreviewViewport from './components/PreviewViewport'
import { CropTopContent, CropDebugInfo } from './components/CropChrome'
import CropPanel from './components/CropPanel'
import SegmentedControl from './components/SegmentedControl'
import ColorPanel from './components/ColorPanel'
import ColorCurveOverlay from './components/ColorCurveOverlay'
import ColorCurveTopContent from './components/ColorCurveTopContent'
import LineArtPanel from './components/LineArtPanel'
import RampMeter from './components/RampMeter'
import { useIsDesktop } from './hooks/useIsDesktop'
import { LINE_ART_MODE_DEFAULTS, LINE_ART_LABELS } from './lineArtDefaults'
import ExportPanel from './components/ExportPanel'
import { useExportSettings } from './export/useExportSettings'
import { getTheme, toggleTheme } from './theme'
import { usePipeline } from './gl/usePipeline'
import { useCropInteraction } from './crop/useCropInteraction'
import { useElementSize } from './crop/useElementSize'
import { useColorCurve } from './curve/useColorCurve'
import { useCropEnhance } from './crop/useCropEnhance'
import { useCropResize } from './crop/useCropResize'
import { formatStateDump } from './debug/dumpState'
import { downloadBlob } from './export/exportPica'
import { useColorAdjustments, IDENTITY_HSL_BY_BAND, IDENTITY_INVERT, IDENTITY_LIGHT, IDENTITY_COLOR_ADJUST } from './color/useColorAdjustments'
import type { PfpMode } from './components/HeaderBar'
import type { ColorSubTab, CropMode, DualPaneMode, LineArtDisplayMode, LineArtMode, LineArtParams, TabDef } from './types'

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

const DUAL_PANE_MODE_OPTIONS: { value: DualPaneMode; label: string }[] = [
  { value: 'original-composite', label: 'ORIGINAL | COMPOSITE' },
  { value: 'composite-overlay', label: 'COMPOSITE | OVERLAY' },
  { value: 'original-overlay', label: 'ORIGINAL | OVERLAY' },
]

/** Maps each DualPaneMode UI option to the [left, right] LineArtDisplayMode pair Pipeline.setDualPane needs — see pipeline.ts's doc comment on why it takes the resolved tuple directly rather than this string union. */
const DUAL_PANE_MODES: Record<DualPaneMode, [LineArtDisplayMode, LineArtDisplayMode]> = {
  'original-composite': ['original', 'composite'],
  'composite-overlay': ['composite', 'overlay'],
  'original-overlay': ['original', 'overlay'],
}

/** Which pane (0 or 1) the header's corner preview mirrors while Dual Pane is active — composite
 * takes priority over overlay, which takes priority over original (the most "finished" result
 * of whichever pair is showing), per user direction. */
const DUAL_PANE_PRIORITY_INDEX: Record<DualPaneMode, 0 | 1> = {
  'original-composite': 1,
  'composite-overlay': 0,
  'original-overlay': 1,
}

const PREVIEW_MODE_OPTIONS: { value: 'original' | 'result'; label: string }[] = [
  { value: 'original', label: 'ORIGINAL' },
  { value: 'result', label: 'RESULT' },
]

const LINE_ART_MODES: LineArtMode[] = ['pathB', 'pathC', 'pathD', 'pathF', 'pathG', 'pathH', 'pathI']

const IDENTITY_COLOR_LIFT = { red: 0, orange: 0, yellow: 0, green: 0, teal: 0, blue: 0, purple: 0, magenta: 0 }

const BASE_LINE_ART_PARAMS: LineArtParams = {
  mode: 'pathB',
  displayMode: 'composite',
  toneShaping: {
    exposure: 0,
    contrast: 0,
    mode: 'clip',
    clipMode: { blackClip: 0, whiteClip: 1 },
    pinchMode: { position: 0.5, expand: 0.3, feathering: 0.5 },
  },
  denoise: { intensity: 0, threshold: 0 },
  colorLift: IDENTITY_COLOR_LIFT,
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
  gumiContrastBoost: 1,
  blobMaxDt: 8,
  gumiOverdrive: 0,
  gumiLineFillType: 'solid',
  gumiLineSolidColor: [0, 0, 0],
  gumiLineInvert: false,
  gumiGapClosing: true,
  gumiBlobGamma: 1,
  gumiColorBleed: false,
  gumiBleedFeather: 1.5,
  gumiBleedRadius: 8,
  gumiSoftDetection: false,
  gumiSoftness: 0.1,
  gumiFillMode: false,
  gumiFillRadius: 8,
  gumiFillInvert: false,
  gumiFillType: 'image',
  gumiFillSolidColor: [0, 0, 0],
  gumiFillPixelThreshold: false,
  gumiGradientMap: false,
  gumiGradientShadow: [0, 0, 0],
  gumiGradientMid: [0.5, 0.5, 0.5],
  gumiGradientHighlight: [1, 1, 1],
  gumiRampFloor: 0,
  gumiRampInnerLow: 0.3,
  gumiRampInnerHigh: 0.7,
  gumiRampCeiling: 1,
  gumiRampFeather: 0,
  thresholdEnabled: false,
  hiToneTarget: 'off',
  hiToneGain: 1,
  hiToneContrast: 1,
  highPassStrength: 1,
  highPassResponsiveColor: false,
  responsiveCrossover: 0.5,
  responsiveGrow: 0,
  responsiveGrowBias: 0,
  laplacianStrength: 1,
  laplacianPreBlur: 0,
  laplacianSharpenAmount: 0,
  laplacianGrow: 0,
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
  const [colorSubTab, setColorSubTab] = useState<ColorSubTab>('color')
  const [lineArtDisplayMode, setLineArtDisplayMode] = useState<LineArtDisplayMode>('composite')
  const [previewMode, setPreviewMode] = useState<'original' | 'result'>('result')
  const [paramsByMode, setParamsByMode] = useState<Record<LineArtMode, LineArtParams>>(buildInitialParamsByMode)
  // Desktop-only Dual Pane toggle (oshiPFP v0.3 Workstream C) — off by default, only meaningful at
  // the 900px breakpoint (isDesktop below); see the tab === 'maximizer' block for how this and
  // dualPaneMode swap out the single-mode SegmentedControl for a 3-way pane-pair one.
  const [dualPaneEnabled, setDualPaneEnabled] = useState(false)
  const [dualPaneMode, setDualPaneMode] = useState<DualPaneMode>('original-composite')
  const isDesktop = useIsDesktop()
  // Dual Pane visually reverts to single-pane behavior below the desktop breakpoint even if
  // dualPaneEnabled is still true (e.g. the window was resized narrower after enabling it on
  // desktop) — gated here, once, rather than repeating `dualPaneEnabled && isDesktop` at each of
  // the toggle's several call sites below.
  const dualPaneActive = dualPaneEnabled && isDesktop
  const pipeline = usePipeline()
  const hasImage = pipeline.sourceSize !== null
  const viewportWrapperRef = useRef<HTMLDivElement | null>(null)
  const colorCurve = useColorCurve(pipeline.setCurveLut)
  const colorAdjustments = useColorAdjustments(pipeline)
  const exportSettings = useExportSettings(pipeline.cropSize)
  const cropEnhance = useCropEnhance(pipeline.setEnhanceParams)
  const cropResize = useCropResize(pipeline.cropSize, pipeline.setResizeParams)

  // Promoted from "reset the curve" to "reset everything in the Color tab" —
  // curve + HSL (all 9 bands) + Invert + Light + Color basic adjustments —
  // since it's the only Reset visible regardless of which Color sub-tab is
  // open (it lives in the top row, above the viewport).
  const resetColorTab = () => {
    colorCurve.reset()
    colorAdjustments.setHslByBand(() => IDENTITY_HSL_BY_BAND)
    colorAdjustments.setInvert(IDENTITY_INVERT)
    colorAdjustments.setLight(IDENTITY_LIGHT)
    colorAdjustments.setColorAdjust(IDENTITY_COLOR_ADJUST)
  }

  const lineArtParams: LineArtParams = { ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode }

  // Dev-only debug aid (see HeaderBar's dev-only Dump State button, gated on import.meta.env.DEV)
  // — a plain-text snapshot of every tab's current config, for reproducing/comparing algo-tuning
  // results across sessions without hand-transcribing slider values. Line Art is deliberately
  // scoped to just the active algorithm (lineArtParams above), not the full paramsByMode cache.
  const handleDumpState = () => {
    const text = formatStateDump({
      fileInfo: pipeline.fileInfo,
      crop: { mode: cropMode, transform: crop.transform, enhance: cropEnhance.enhance, resize: { mode: cropResize.mode, customSize: cropResize.customSize } },
      lineArt: { label: LINE_ART_LABELS[lineArtMode], params: lineArtParams },
      color: {
        subTab: colorSubTab,
        light: colorAdjustments.light,
        colorAdjust: colorAdjustments.colorAdjust,
        invert: colorAdjustments.invert,
        hslByBand: colorAdjustments.hslByBand,
        curveChannel: colorCurve.channel,
        curves: colorCurve.curves,
      },
      export: {
        resolutionMode: exportSettings.resolutionMode,
        customSize: exportSettings.customSize,
        resampleMode: exportSettings.resampleMode,
        format: exportSettings.format,
      },
      view: { pfpMode, theme, previewMode, dualPaneEnabled, dualPaneMode },
    })
    downloadBlob(new Blob([text], { type: 'application/json' }), `oshipfp-state-${Date.now()}.json`)
  }

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
  // Color tab's curve graph is deliberately NOT sized off the image's own
  // viewport box (squareSize/originalSize above) — those vary with crop
  // aspect (especially 'original' mode, which can be a tall/narrow
  // rectangle), and the curve control needs a stable 1:1 boundary of its
  // own regardless of what shape the underlying photo happens to be
  // displayed at right now. Same min(width,height)-of-wrapper approach as
  // squareSize, just decoupled from cropMode.
  const colorCurveSize = wrapperSize ? Math.min(wrapperSize.width, wrapperSize.height) : undefined

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

  // The Original/Result A/B toggle only applies to the deselected
  // (tab === null) fullscreen preview — any active tab always shows the
  // real, fully-processed result regardless of what previewMode was last
  // set to, so switching back to a tab doesn't leave the canvas silently
  // stuck on the pre-processing view.
  useEffect(() => {
    pipeline.setPreviewMode(tab === null ? previewMode : 'result')
    // pipeline identity is stable; only re-run when tab or previewMode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, previewMode])

  useEffect(() => {
    pipeline.setLineArtParams({ ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode })
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsByMode, lineArtMode, lineArtDisplayMode])

  // dualPaneActive (not the raw dualPaneEnabled boolean) drives the pipeline — resizing back below
  // 900px with the toggle still on should stop the pipeline from doubling canvas width/running the
  // Color chain twice, same as it visually reverts the segmented control (see dualPaneActive above).
  useEffect(() => {
    pipeline.setDualPane(dualPaneActive, DUAL_PANE_MODES[dualPaneMode])
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dualPaneActive, dualPaneMode])

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

  // Gumi's Luminance Ramp calibration picker (v0.3 tuning) — shelved out of the UI
  // for now (real clickzone issues surfaced in testing, needs its own dedicated
  // session). Pipeline.sampleEnhancePixel/usePipeline's wrapper/this hook are left
  // in place unchanged so the next pass can pick it back up without re-deriving the
  // enhanceTarget-sourcing work; see changelog. Not instantiated here anymore.

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
        showDualPaneToggle={isDesktop}
        dualPaneEnabled={dualPaneEnabled}
        onToggleDualPane={() => setDualPaneEnabled((v) => !v)}
        dualPanePriorityIndex={DUAL_PANE_PRIORITY_INDEX[dualPaneMode]}
        onDumpState={handleDumpState}
      />

      <div className="body-layout">
      <div className="viewport-area">
        {hasImage && tab === 'crop' && <CropTopContent zoom={crop.transform.scale} onZoomReset={() => {}} />}
        {hasImage && tab === 'crop' && (
          <CropDebugInfo sourceSize={pipeline.sourceSize} fileInfo={pipeline.fileInfo} />
        )}
        {hasImage && tab === 'maximizer' && (
          dualPaneActive ? (
            <SegmentedControl options={DUAL_PANE_MODE_OPTIONS} value={dualPaneMode} onChange={setDualPaneMode} />
          ) : (
            <SegmentedControl options={DISPLAY_MODE_OPTIONS} value={lineArtDisplayMode} onChange={setLineArtDisplayMode} />
          )
        )}
        {hasImage && tab === 'color' && (
          <ColorCurveTopContent
            channel={colorCurve.channel}
            onChannelChange={colorCurve.setChannel}
            visible={colorCurve.visible}
            onVisibleChange={colorCurve.setVisible}
            onResetAll={resetColorTab}
          />
        )}
        {hasImage && tab === null && (
          <SegmentedControl options={PREVIEW_MODE_OPTIONS} value={previewMode} onChange={setPreviewMode} />
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
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          <PreviewViewport
            canvasRef={pipeline.canvasRef}
            viewportRef={crop.viewportRef}
            cropMode={cropMode}
            squareSize={squareSize}
            originalSize={originalSize}
            fillWrapper={dualPaneActive}
            circle={pfpMode === 'circle'}
            interactive={tab === 'crop' && cropMode === 'square'}
            overlay={!hasImage ? <BlankState onLoadFile={pipeline.loadFile} circle={pfpMode === 'circle'} /> : undefined}
            onPointerDown={crop.handlePointerDown}
            onPointerMove={crop.handlePointerMove}
            onPointerUp={crop.endPointer}
            onPointerCancel={crop.endPointer}
          />
          {/* Deliberately a sibling of PreviewViewport, not routed through its
              `overlay` prop — that slot is sized/clipped to the image's own
              current viewport box (.preview-viewport), which varies with crop
              aspect. The curve control needs to always draw on top of the
              viewport at its own stable 1:1 size (colorCurveSize above),
              independent of whatever shape the photo underneath happens to
              be at the moment. */}
          {hasImage && tab === 'maximizer' && lineArtMode !== 'pathC' && (
            <div className="rampmeter-mobile-overlay" aria-hidden="true">
              <RampMeter kind="tone" toneShaping={lineArtParams.toneShaping} orientation="column" />
              <RampMeter kind="color" colorLift={lineArtParams.colorLift} orientation="column" />
            </div>
          )}
          {hasImage && tab === 'color' && colorCurve.visible && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: colorCurveSize,
                  height: colorCurveSize,
                  pointerEvents: 'auto',
                  // Without these, iOS's long-press callout (image save/copy
                  // menu) and text/image selection compete with grabbing a
                  // curve point — the corner points sit right where a photo
                  // is most likely to trigger it, so a drag can take several
                  // attempts to register instead of the callout's touch-hold
                  // timer winning the race the first try or two. Set
                  // redundantly at every layer down to the svg itself
                  // (CurveEditor.tsx) — Safari's touch-callout suppression
                  // has historically been inconsistent about which ancestor
                  // "counts" for a given descendant, especially for SVG.
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                <ColorCurveOverlay
                  channel={colorCurve.channel}
                  curves={colorCurve.curves}
                  onChangeActive={colorCurve.setActivePoints}
                />
              </div>
            </div>
          )}
          {pipeline.error && (
            <p style={{ color: 'var(--red)', marginTop: 10, fontSize: 12 }}>{pipeline.error}</p>
          )}
        </div>

      </div>

      {/* Order within this column is CSS-controlled (see .panel-col rules in
          base.css): mobile keeps the tab bar pinned below the panel/sheet
          (its historical position as a trailing sibling of .viewport-area),
          desktop's two-column layout puts the tab row above the drawer
          content instead, matching the Figma desktop reference. DOM order
          here doesn't need to match either — `order` handles both. */}
      <div className="panel-col">
        <TabNav tabs={TABS} activeId={tab} disabled={!hasImage} onSelect={selectTab} />

        {hasImage && tab === 'crop' && (
          <CropPanel
            mode={cropMode}
            onModeChange={setCropMode}
            enhance={cropEnhance.enhance}
            setEnhance={cropEnhance.setEnhance}
            cropSize={pipeline.cropSize}
            resizeMode={cropResize.mode}
            setResizeMode={cropResize.setMode}
            resizeCustomSize={cropResize.customSize}
            setResizeCustomSize={cropResize.setCustomSize}
          />
        )}

        {hasImage && tab === 'color' && (
          <ColorPanel
            subTab={colorSubTab}
            onSubTabChange={setColorSubTab}
            hslByBand={colorAdjustments.hslByBand}
            setHslByBand={colorAdjustments.setHslByBand}
            activeBand={colorAdjustments.activeBand}
            setActiveBand={colorAdjustments.setActiveBand}
            invert={colorAdjustments.invert}
            setInvert={colorAdjustments.setInvert}
            light={colorAdjustments.light}
            setLight={colorAdjustments.setLight}
            colorAdjust={colorAdjustments.colorAdjust}
            setColorAdjust={colorAdjustments.setColorAdjust}
          />
        )}
        {hasImage && tab === 'maximizer' && (
          <LineArtPanel params={lineArtParams} onChange={handleLineArtChange} onReset={handleLineArtReset} />
        )}
        {hasImage && tab === 'export' && (
          <ExportPanel
            cropSize={pipeline.cropSize}
            fileName={pipeline.fileInfo?.name ?? null}
            readExportPixels={pipeline.readExportPixels}
            exportDisplayMode={exportSettings.exportDisplayMode}
            setExportDisplayMode={exportSettings.setExportDisplayMode}
            resolutionMode={exportSettings.resolutionMode}
            setResolutionMode={exportSettings.setResolutionMode}
            customSize={exportSettings.customSize}
            setCustomSize={exportSettings.setCustomSize}
            resampleMode={exportSettings.resampleMode}
            setResampleMode={exportSettings.setResampleMode}
            format={exportSettings.format}
            setFormat={exportSettings.setFormat}
          />
        )}
      </div>
      </div>
    </div>
  )
}
