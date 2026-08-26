import { useEffect, useRef, useState, type DragEvent } from 'react'
import TabNav from './components/TabNav'
import HeaderBar from './components/HeaderBar'
import AlgoGalleryModal from './components/AlgoGalleryModal'
import BlankState from './components/BlankState'
import PreviewViewport from './components/PreviewViewport'
import { CropTopContent } from './components/CropChrome'
import CropPanel from './components/CropPanel'
import SegmentedControl from './components/SegmentedControl'
import ColorPanel from './components/ColorPanel'
import ColorCurveOverlay from './components/ColorCurveOverlay'
import LineArtPanel from './components/LineArtPanel'
import RampMeter from './components/RampMeter'
import { useIsDesktop } from './hooks/useIsDesktop'
import { LINE_ART_LABELS, LINE_ART_MODES, buildDefaultParams, buildInitialParamsByMode } from './lineArtDefaults'
import ExportPanel from './components/ExportPanel'
import { useExportSettings } from './export/useExportSettings'
import { initTheme, toggleTheme } from './theme'
import { usePipeline } from './gl/usePipeline'
import { useCropInteraction } from './crop/useCropInteraction'
import { useElementSize } from './crop/useElementSize'
import { useColorCurve } from './curve/useColorCurve'
import { useCropEnhance } from './crop/useCropEnhance'
import { useCropResize } from './crop/useCropResize'
import { formatStateDump, parseStateDump } from './debug/dumpState'
import { PRESET_MANIFEST } from './presets/presetManifest'
import { applyPreset } from './presets/applyPreset'
import { FILTER_MANIFEST } from './filters/filterManifest'
import { getEditableFields } from './filters/macroFields'
import { applyFilter } from './filters/applyFilter'
import { useFilterThumbnails } from './filters/useFilterThumbnails'
import SimplifiedLineArtPanel from './components/SimplifiedLineArtPanel'
import LoadSampleModal from './components/LoadSampleModal'
import { trace } from './debug/renderTrace'
import { buildResampledCanvas, downloadBlob } from './export/exportPica'
import { computeTarget } from './export/computeTarget'
import { useColorAdjustments, IDENTITY_HSL_BY_BAND, IDENTITY_INVERT, IDENTITY_LIGHT, IDENTITY_COLOR_ADJUST, IDENTITY_GRADE_GRADIENT_MAP } from './color/useColorAdjustments'
import type { PfpMode } from './components/HeaderBar'
import type { ColorSubTab, CropMode, DualPaneMode, LineArtDisplayMode, LineArtMode, LineArtParams, LineArtSubTab, TabDef } from './types'
import type { FilterManifestEntry } from './filters/filterTypes'

declare global {
  interface Window {
    __pfpFilters?: {
      list: () => FilterManifestEntry[]
      select: (filterId: string | null) => void
      openEdit: () => void
      discardEdit: () => void
      commitEdit: () => void
      /** Pokes a single field through the same handleLineArtChange path a real macro slider would
       * use, for exercising the filterOverrides capture effect without the Simplified panel UI
       * that doesn't exist yet (Stage D/E). */
      setField: (field: keyof LineArtParams, value: unknown) => void
      state: () => {
        activeFilterId: string | null
        filterOverrides: Record<string, Partial<LineArtParams>>
        editSnapshot: Partial<LineArtParams> | null
        currentParams: LineArtParams
      }
      thumbnails: () => Record<string, string>
      thumbnailsGenerating: () => boolean
      regenerateThumbnails: () => void
    }
  }
}

const TABS: TabDef[] = [
  { id: 'crop', label: 'CROP', icon: 'crop' },
  { id: 'maximizer', label: 'LINEART', icon: 'lineart' },
  { id: 'color', label: 'GRADE', icon: 'color' },
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

const COLOR_DISPLAY_MODE_OPTIONS: { value: 'original' | 'graded'; label: string }[] = [
  { value: 'original', label: 'ORIGINAL' },
  { value: 'graded', label: 'GRADED' },
]

/** Grade's Dual Pane always shows the same fixed pair — Original left, Graded right — rendered as
 * a single always-active pill (mirrors Line Art's DUAL_PANE_MODE_OPTIONS pattern above, but with
 * only one possible option). */
const GRADE_DUAL_PANE_OPTIONS: { value: 'original-graded'; label: string }[] = [
  { value: 'original-graded', label: 'ORIGINAL | GRADED' },
]


/** Manual override for the secret dev-mode entrance (see AvatarCornerPreview's 7-tap gesture) —
 * flip to `true` to force dev mode on regardless of build mode or tapping, for testing a
 * production-style build (`npm run build && npm run preview`) locally without tapping.
 * `import.meta.env.DEV` already covers `npm run dev` automatically. */
const FORCE_DEV_MODE = false

export default function App() {
  const [tab, setTab] = useState<string | null>('crop')
  const [theme, setTheme] = useState(initTheme)
  // Session-only — resets to the automatic default on every reload; the 7-tap gesture is a
  // one-way unlock, never toggles back off once set true.
  const [devMode, setDevMode] = useState(FORCE_DEV_MODE || import.meta.env.DEV)
  const [pfpMode, setPfpMode] = useState<PfpMode>('square')
  const [cropMode, setCropMode] = useState<CropMode>('square')
  const [lineArtMode, setLineArtMode] = useState<LineArtMode>('pathB')
  const [colorSubTab, setColorSubTab] = useState<ColorSubTab>('light')
  const [lineArtSubTab, setLineArtSubTab] = useState<LineArtSubTab>('lineart')
  const [lineArtDisplayMode, setLineArtDisplayMode] = useState<LineArtDisplayMode>('composite')
  const [colorDisplayMode, setColorDisplayMode] = useState<'original' | 'graded'>('graded')
  // AlgoGalleryModal's open state lives here (not LineArtPanel) so BlankState's "Browse Gallery"
  // button can open the same modal before any image (and therefore LineArtPanel itself) exists.
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<'original' | 'result'>('result')
  const [paramsByMode, setParamsByMode] = useState<Record<LineArtMode, LineArtParams>>(buildInitialParamsByMode)
  // Simplified-mode filter carousel state — session-only, cleared by resetApp/page refresh, never
  // persisted to the (read-only) filter JSON. See src/filters/filterTypes.ts.
  const [filterOverrides, setFilterOverrides] = useState<Record<string, Partial<LineArtParams>>>({})
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null)
  const [editSnapshot, setEditSnapshot] = useState<Partial<LineArtParams> | null>(null)
  // "Lab" is the front-facing name for the Advanced/Simplified Line Art toggle (HeaderBar's new
  // button) — true shows today's full LineArtPanel, false (default — Simplified is the intended
  // front-facing experience) shows SimplifiedLineArtPanel's filter carousel. Deliberately not
  // reset by resetApp(), same precedent as `theme` (a display preference, not app data).
  const [labMode, setLabMode] = useState(false)
  const [filterEditSheetOpen, setFilterEditSheetOpen] = useState(false)
  const [loadSampleOpen, setLoadSampleOpen] = useState(false)
  // Desktop-only Dual Pane toggle — off by default, only meaningful at the 900px breakpoint
  // (isDesktop below); see the tab === 'maximizer' block for how this and dualPaneMode swap out
  // the single-mode SegmentedControl for a 3-way pane-pair one.
  const [dualPaneEnabled, setDualPaneEnabled] = useState(false)
  const [dualPaneMode, setDualPaneMode] = useState<DualPaneMode>('original-composite')
  const isDesktop = useIsDesktop()
  // Dual Pane visually reverts to single-pane behavior below the desktop breakpoint even if
  // dualPaneEnabled is still true — gated here, once, rather than repeating
  // `dualPaneEnabled && isDesktop` at each call site below. One shared toggle, two mutually-
  // exclusive-by-tab kinds: Line Art's own [LineArtDisplayMode, LineArtDisplayMode] pane pair, and
  // Grade's fixed Original|Graded pair (pipeline.ts's setGradeDualPane) — Crop/Export have neither.
  const dualPaneActive = dualPaneEnabled && isDesktop && tab === 'maximizer'
  const gradeDualPaneActive = dualPaneEnabled && isDesktop && tab === 'color'
  const pipeline = usePipeline()
  const hasImage = pipeline.sourceSize !== null
  const viewportWrapperRef = useRef<HTMLDivElement | null>(null)
  // Desktop-only drag-and-drop to replace an already-loaded image (like Dropbox web) — BlankState
  // already covers drag-and-drop for the initial, no-image-yet load; this covers the loaded-image
  // case.
  const [viewportDragOver, setViewportDragOver] = useState(false)
  const handleViewportDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasImage || !isDesktop) return
    e.preventDefault()
    setViewportDragOver(true)
  }
  const handleViewportDragLeave = () => setViewportDragOver(false)
  const handleViewportDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!hasImage || !isDesktop) return
    e.preventDefault()
    setViewportDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) pipeline.loadFile(file)
  }
  const colorCurve = useColorCurve(pipeline.setCurveLut)
  const colorAdjustments = useColorAdjustments(pipeline)
  const exportSettings = useExportSettings(pipeline.cropSize)
  const cropEnhance = useCropEnhance(pipeline.setEnhanceParams)
  const cropResize = useCropResize(pipeline.cropSize, pipeline.setResizeParams)

  // Export tab's own live preview: the main viewport, while this tab is open, shows the actual
  // resampled result at its true target pixel dimensions (shrink-to-fit/never-enlarge, same
  // convention pipeline.ts's own blit already uses for every other tab) — not just correct
  // *content* at native working resolution, which the tabPreviewBypass='exportPreview' mechanism
  // already handles. Rendered via PreviewViewport's `overlay` slot so it sits in the exact same
  // box the live GL canvas already occupies. Debounced (readExportPixels forces a synchronous GPU
  // render + readback) and request-id-guarded (a slower in-flight resample, e.g. a large
  // "Original" target, must not paint over a newer, faster one that already landed).
  const exportTarget = computeTarget(exportSettings.resolutionMode, pipeline.cropSize, exportSettings.customSize)
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string | null>(null)
  const [exportPreviewDims, setExportPreviewDims] = useState<{ width: number; height: number } | null>(null)
  const exportPreviewRequestId = useRef(0)
  useEffect(() => {
    if (tab !== 'export' || !exportTarget) return
    const timer = setTimeout(() => {
      const requestId = ++exportPreviewRequestId.current
      void (async () => {
        const pixels = pipeline.readExportPixels(exportSettings.exportDisplayMode, exportSettings.exportColorGrade, exportSettings.exportColorGradeIntensity)
        if (!pixels) return
        const resampled = await buildResampledCanvas(pixels, exportTarget.width, exportTarget.height, exportSettings.resampleMode)
        if (requestId !== exportPreviewRequestId.current) return
        setExportPreviewUrl(resampled.toDataURL())
        setExportPreviewDims({ width: exportTarget.width, height: exportTarget.height })
      })()
    }, 80)
    return () => clearTimeout(timer)
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, exportSettings.exportDisplayMode, exportSettings.exportColorGrade, exportSettings.exportColorGradeIntensity, exportSettings.resampleMode, exportTarget?.width, exportTarget?.height])

  // Resets everything in the Color tab: curve + HSL (all 9 bands) + Invert + Light + Color basic
  // adjustments. "Reset Grade" lives in the LIGHT sub-tab, alongside the curve controls.
  const resetColorTab = () => {
    colorCurve.reset()
    colorAdjustments.setHslByBand(() => IDENTITY_HSL_BY_BAND)
    colorAdjustments.setInvert(IDENTITY_INVERT)
    colorAdjustments.setLight(IDENTITY_LIGHT)
    colorAdjustments.setColorAdjust(IDENTITY_COLOR_ADJUST)
    colorAdjustments.setGradeGradientMap(IDENTITY_GRADE_GRADIENT_MAP)
  }

  const lineArtParams: LineArtParams = { ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode }
  // Filter edit sheet is a modal-like takeover of the bottom bar's spot (see the panel-col render
  // below) — only reachable via Simplified mode's carousel, so gated on !labMode defensively too.
  const filterEditActive = !labMode && filterEditSheetOpen

  // Keeps the pipeline's real, cross-tab line-art bypass (pipeline.setLineArtBypassed — see its
  // own doc comment) in sync with "Simplified mode, None selected" as a single source of truth,
  // rather than scattering setLineArtBypassed calls across every place activeFilterId/labMode can
  // change (handleSelectFilter, resetApp, the Lab toggle) and risking one getting missed. Lab mode
  // has no "None" concept, so entering it always clears the bypass regardless of what was selected
  // in Simplified mode underneath.
  useEffect(() => {
    pipeline.setLineArtBypassed(!labMode && activeFilterId === null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labMode, activeFilterId])

  // Dev-only debug aid (see HeaderBar's dev-only Dump State button, gated on import.meta.env.DEV)
  // — a JSON snapshot of every tab's current config, for reproducing/comparing algo-tuning
  // results across sessions without hand-transcribing slider values. Line Art dumps all 7
  // algorithms' cached params (paramsByMode), not just the active one, so a report/comparison
  // isn't silently missing the other 6 — activeMode/activeLabel mark which is actually live.
  const handleDumpState = () => {
    const text = formatStateDump({
      fileInfo: pipeline.fileInfo,
      crop: { mode: cropMode, transform: crop.transform, enhance: cropEnhance.enhance, resize: { mode: cropResize.mode, customSize: cropResize.customSize } },
      lineArt: {
        activeMode: lineArtMode,
        activeLabel: LINE_ART_LABELS[lineArtMode],
        paramsByAlgorithm: Object.fromEntries(
          LINE_ART_MODES.map((mode) => [
            mode,
            { label: LINE_ART_LABELS[mode], params: mode === lineArtMode ? lineArtParams : paramsByMode[mode] },
          ]),
        ) as Record<LineArtMode, { label: string; params: LineArtParams }>,
      },
      color: {
        subTab: colorSubTab,
        light: colorAdjustments.light,
        colorAdjust: colorAdjustments.colorAdjust,
        invert: colorAdjustments.invert,
        hslByBand: colorAdjustments.hslByBand,
        curveChannel: colorCurve.channel,
        curves: colorCurve.curves,
        curveVisible: colorCurve.visible,
        gradeGradientMap: colorAdjustments.gradeGradientMap,
      },
      export: {
        displayMode: exportSettings.exportDisplayMode,
        colorGrade: exportSettings.exportColorGrade,
        colorGradeIntensity: exportSettings.exportColorGradeIntensity,
        resolutionMode: exportSettings.resolutionMode,
        customSize: exportSettings.customSize,
        customRatio: exportSettings.exportCustomRatio,
        resampleMode: exportSettings.resampleMode,
        format: exportSettings.format,
      },
      view: { pfpMode, theme, previewMode, dualPaneEnabled, dualPaneMode },
    })
    downloadBlob(new Blob([text], { type: 'application/json' }), `${lineArtMode}-oshipfp-state-${Date.now()}.json`)
  }

  // Dev-only "Load State" (see HeaderBar's button next to Dump State) — reverses handleDumpState
  // above via parseStateDump, for a post-deploy round-trip check: dump on one build, load the same
  // file back in on another (e.g. after a Netlify deploy), then dump again and diff the two files
  // to confirm every param survived. Restores everything the dump captures except crop.transform
  // (pan/zoom) — useCropInteraction only exposes a reset-to-default setter (resetTransform), not an
  // arbitrary-value one, so a saved pan/zoom position specifically can't be replayed — and fileInfo
  // (the dump only records the loaded file's name/type/size, not its bytes — there's no image to
  // restore, just whatever's already loaded stays as-is).
  const handleLoadState = async (file: File) => {
    let data: Awaited<ReturnType<typeof parseStateDump>>
    try {
      data = parseStateDump(await file.text())
    } catch (err) {
      alert(`Couldn't load state: ${err instanceof Error ? err.message : String(err)}`)
      return
    }

    setCropMode(data.crop.mode)
    cropEnhance.setEnhance(data.crop.enhance)
    cropResize.setMode(data.crop.resize.mode)
    cropResize.setCustomSize(data.crop.resize.customSize)

    // Merged against each mode's own freshly-built defaults rather than a wholesale replace — a
    // state dump saved before a LineArtParams field addition would otherwise leave that field
    // `undefined` instead of falling back to its real default.
    setParamsByMode(() =>
      Object.fromEntries(
        LINE_ART_MODES.map((mode) => [mode, { ...buildDefaultParams(mode), ...data.lineArt.paramsByAlgorithm[mode].params }]),
      ) as Record<LineArtMode, LineArtParams>,
    )
    setLineArtMode(data.lineArt.activeMode)
    setLineArtDisplayMode(data.lineArt.paramsByAlgorithm[data.lineArt.activeMode].params.displayMode)

    setColorSubTab(data.color.subTab as ColorSubTab)
    colorAdjustments.setLight(data.color.light)
    colorAdjustments.setColorAdjust(data.color.colorAdjust)
    colorAdjustments.setInvert(data.color.invert)
    colorAdjustments.setHslByBand(() => data.color.hslByBand)
    colorAdjustments.setGradeGradientMap(data.color.gradeGradientMap)
    colorCurve.setChannel(data.color.curveChannel)
    colorCurve.setCurves(data.color.curves)
    colorCurve.setVisible(data.color.curveVisible)

    exportSettings.setExportDisplayMode(data.export.displayMode)
    exportSettings.setExportColorGrade(data.export.colorGrade)
    exportSettings.setExportColorGradeIntensity(data.export.colorGradeIntensity)
    exportSettings.setResolutionMode(data.export.resolutionMode)
    exportSettings.setCustomSize(data.export.customSize)
    exportSettings.setExportCustomRatio(data.export.customRatio)
    exportSettings.setResampleMode(data.export.resampleMode)
    exportSettings.setFormat(data.export.format)

    setPfpMode(data.view.pfpMode)
    if (data.view.theme !== theme) setTheme(toggleTheme())
    setPreviewMode(data.view.previewMode)
    setDualPaneEnabled(data.view.dualPaneEnabled)
    setDualPaneMode(data.view.dualPaneMode as DualPaneMode)
  }

  // Dev-only "Load Demo" trigger (see HeaderBar's PRESET_MANIFEST-driven buttons, gated the same
  // as handleDumpState) — exercises applyPreset.ts's real code path.
  const handleLoadPreset = (presetId: string, options?: { skipImage?: boolean }) => {
    const preset = PRESET_MANIFEST.find((p) => p.id === presetId)
    if (!preset) return
    void applyPreset(preset, {
      loadFile: pipeline.loadFile,
      setLineArtMode,
      setLineArtDisplayMode,
      setParamsByMode,
      setLight: colorAdjustments.setLight,
      setColorAdjust: colorAdjustments.setColorAdjust,
      setInvert: colorAdjustments.setInvert,
      setHslByBand: colorAdjustments.setHslByBand,
      setCurveChannel: colorCurve.setChannel,
      setCurves: colorCurve.setCurves,
      setCurveVisible: colorCurve.setVisible,
      setGradeGradientMap: colorAdjustments.setGradeGradientMap,
      setEnhance: cropEnhance.setEnhance,
    }, options)
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

  const { filterThumbnails, thumbnailsGenerating, regenerateThumbnails, refreshFilterThumbnail } = useFilterThumbnails({
    hasImage,
    paramsByMode,
    filterOverrides,
    liveLineArtParams: lineArtParams,
    cropSignal: crop.transform,
    pipeline,
  })

  // Line Art's algorithm chain (JFA etc.) is frozen/reactivated by
  // Pipeline's own settle timer (armed from setCropRect) rather than tab
  // identity — see armLineArtSettle in pipeline.ts.

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

  // Grade tab's Original/Graded toggle and Line Art tab's own preview-strip buttons (Original/
  // Overlay) both peek at an earlier/alternate pipeline stage on the live canvas — see
  // tabPreviewBypass's doc comment in pipeline.ts. Grade's "Original" means "before Grade" (the
  // true, ungraded Line Art module output, 'lineArtComposite' -> lineArtOutputTarget) — workflow
  // runs crop -> line art -> grade -> export, so this is one stage back, not all the way to
  // pre-Line-Art. Line Art's own "Original" preview button means "before Line Art" instead
  // ('enhance' -> enhanceTarget); 'overlay' gets its own dedicated 'lineArtOverlay' bypass,
  // computed on demand by the pipeline only while active. None of these ever touch the real,
  // always-composite lineArtOutputTarget/colorTarget — this is purely a live-canvas substitution.
  // Guarded by !dualPaneActive since Dual Pane resolves
  // its own per-pane peeks directly in its blit branch instead (two panes can independently want
  // different modes at once, which this single tab-scoped value can't express). Export tab is the
  // sole WYSIWYG authority for its own (displayMode, colorGrade) selection — its own resolve
  // (renderExportPreview) is fully decoupled from Line Art's/Grade's live tab state, not just an
  // earlier-stage peek. Only one of these can be "active" at a time since they're keyed off which
  // tab is actually open, and it resets to 'none' the moment none of them apply (including Grade's
  // own "Graded" mode, which must show true full grading regardless of what Line Art's preview strip
  // happens to show).
  useEffect(() => {
    const bypass =
      tab === 'color' && colorDisplayMode === 'original' ? 'lineArtComposite' :
      tab === 'export' ? 'exportPreview' :
      tab === 'maximizer' && !dualPaneActive && lineArtDisplayMode === 'original' ? 'enhance' :
      tab === 'maximizer' && !dualPaneActive && lineArtDisplayMode === 'overlay' ? 'lineArtOverlay' :
      'none'
    pipeline.setTabPreviewBypass(bypass)
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, colorDisplayMode, lineArtDisplayMode, dualPaneActive])

  useEffect(() => {
    if (tab !== 'export') return
    pipeline.setExportPreviewParams(exportSettings.exportDisplayMode, exportSettings.exportColorGrade, exportSettings.exportColorGradeIntensity)
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, exportSettings.exportDisplayMode, exportSettings.exportColorGrade, exportSettings.exportColorGradeIntensity])

  useEffect(() => {
    const next = { ...paramsByMode[lineArtMode], mode: lineArtMode, displayMode: lineArtDisplayMode }
    trace('react:effect->pipeline.setLineArtParams', {
      mode: next.mode,
      fillInvert: (next as { fillInvert?: boolean }).fillInvert,
    })
    pipeline.setLineArtParams(next)
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

  useEffect(() => {
    pipeline.setGradeDualPane(gradeDualPaneActive)
    // pipeline identity is stable; only re-run when the relevant params actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradeDualPaneActive])

  // Fumiko's "Find Edge" mode only supports Multiply (see pipeline.ts's
  // forcedMultiply) — LineArtPanel hides the other blend options for that combo,
  // but if a user had Screen/Overlay selected with Find Edge off and switches
  // straight into Find Edge, snap the cached param back to Multiply so it
  // doesn't silently keep a hidden, non-applied selection.
  useEffect(() => {
    const pathFParams = paramsByMode.pathF
    if (pathFParams.findEdge && pathFParams.blendMode !== 'multiply') {
      setParamsByMode((prev) => ({ ...prev, pathF: { ...prev.pathF, blendMode: 'multiply' } }))
    }
  }, [paramsByMode.pathF])

  // LineArtPanel's onChange either signals a mode switch (mode differs from
  // the currently active one — just swap which cached entry is active, don't
  // touch the cache) or an in-place edit (cache it under the active mode).
  const handleLineArtChange = (next: LineArtParams) => {
    if (next.mode !== lineArtMode) {
      trace('react:mode-switch', { from: lineArtMode, to: next.mode })
      setLineArtMode(next.mode)
      return
    }
    trace('react:param-edit', { mode: lineArtMode, fillInvert: (next as { fillInvert?: boolean }).fillInvert })
    setParamsByMode((prev) => ({ ...prev, [lineArtMode]: next }))
  }

  // Keeps filterOverrides in sync with whatever the active filter's own editable fields currently
  // read in paramsByMode — every edit path (quick sliders, the edit sheet, double-tap reset)
  // already flows through handleLineArtChange above, so this one effect covers all of them instead
  // of each site writing to filterOverrides itself. Whitelisted against getEditableFields(filter) —
  // the FULL macro surface the Simplified panel can touch for this filter (algo baseline plus any
  // of its own extraFields) — not just the keys the filter's own JSON happens to declare:
  // whitelisting against the JSON's own (possibly sparse)
  // keys let an edit to a field the JSON omitted (e.g. Fill Type on a filter that only declared
  // threshold/radius/hardness) go uncaptured and leak straight into the shared per-algo
  // paramsByMode base, permanently bleeding into every other filter on that algo. Every filter's
  // JSON must supply a value for every field getEditableFields returns for it to actually behave
  // as advertised — see macroFields.ts's own doc comment.
  useEffect(() => {
    if (!activeFilterId) return
    const filter = FILTER_MANIFEST.find((f) => f.id === activeFilterId)
    if (!filter || filter.algo !== lineArtMode) return
    const current = paramsByMode[lineArtMode]
    const snapshot: Partial<LineArtParams> = {}
    for (const key of getEditableFields(filter)) {
      ;(snapshot as Record<string, unknown>)[key] = current[key]
    }
    setFilterOverrides((prev) => ({ ...prev, [activeFilterId]: snapshot }))
  }, [paramsByMode, lineArtMode, activeFilterId])

  // Selecting a filter from the carousel — re-applies its JSON defaults plus any
  // session-accumulated overrides for that filter (so A/B switching between filters is
  // non-destructive), same merge-onto-current convention as applyPreset.ts.
  const handleSelectFilter = (filterId: string | null) => {
    // Refresh the filter we're switching AWAY from — its own thumbnail was hidden behind the
    // edit-icon overlay the whole time it was selected, so this is the one moment to catch up
    // whatever ended up committed (or discarded back to baseline) before it becomes visible again.
    if (activeFilterId && activeFilterId !== filterId) refreshFilterThumbnail(activeFilterId)
    setEditSnapshot(null)
    setActiveFilterId(filterId)
    // The pipeline bypass (pipeline.setLineArtBypassed — the real, cross-tab fix) is kept in sync
    // by a dedicated effect below, derived from activeFilterId/labMode. The ORIGINAL/COMPOSITE/
    // OVERLAY viewport strip (lineArtDisplayMode) is deliberately left untouched here — it's a
    // user-controlled preview toggle, independent of which filter is selected; filter selection
    // used to force it to 'original'/'composite', which fought with the user's own choice there.
    if (!filterId) return
    const filter = FILTER_MANIFEST.find((f) => f.id === filterId)
    if (!filter) return
    applyFilter(filter, filterOverrides[filterId] ?? {}, { setLineArtMode, setParamsByMode })
  }

  // Edit-sheet reset tier (sheet UI itself is Stage E) — Discard reverts to whatever was live the
  // moment the sheet opened, not the filter's JSON default; Commit just confirms and exits, since
  // live edits are already the persisted state.
  const handleOpenFilterEdit = () => {
    if (!activeFilterId) return
    setEditSnapshot(filterOverrides[activeFilterId] ?? {})
    setFilterEditSheetOpen(true)
  }
  const handleDiscardFilterEdit = () => {
    const filter = activeFilterId ? FILTER_MANIFEST.find((f) => f.id === activeFilterId) : undefined
    if (filter && editSnapshot !== null) {
      setParamsByMode((prev) => ({ ...prev, [filter.algo]: { ...prev[filter.algo], ...filter.params, ...editSnapshot } }))
    }
    setEditSnapshot(null)
    setFilterEditSheetOpen(false)
  }
  const handleCommitFilterEdit = () => {
    setEditSnapshot(null)
    setFilterEditSheetOpen(false)
  }

  // Dev-only console hook for exercising the filter data layer before Stage D/E build its UI —
  // same pattern as renderTrace.ts's window.__pfpTrace, no-ops outside dev builds.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return
    window.__pfpFilters = {
      list: () => FILTER_MANIFEST,
      select: handleSelectFilter,
      openEdit: handleOpenFilterEdit,
      discardEdit: handleDiscardFilterEdit,
      commitEdit: handleCommitFilterEdit,
      setField: (field, value) => handleLineArtChange({ ...paramsByMode[lineArtMode], mode: lineArtMode, [field]: value }),
      state: () => ({ activeFilterId, filterOverrides, editSnapshot, currentParams: lineArtParams }),
      thumbnails: () => filterThumbnails,
      thumbnailsGenerating: () => thumbnailsGenerating,
      regenerateThumbnails,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilterId, filterOverrides, editSnapshot, lineArtParams, filterThumbnails, thumbnailsGenerating, regenerateThumbnails])

  const handleLineArtReset = () => {
    setParamsByMode((prev) => ({ ...prev, [lineArtMode]: buildDefaultParams(lineArtMode) }))
    setLineArtDisplayMode('composite')
  }

  // "Reset oshiPFP" — clears the loaded image and every tuned param back to defaults without a
  // page reload. Deliberately does NOT touch `theme` — a display preference, not app data. Every
  // other hook holding its own state exposes its own reset() rather than this function reaching
  // into their internals, same separation resetColorTab/handleLineArtReset keep.
  const resetApp = () => {
    pipeline.clearSource()
    setTab('crop')
    setPfpMode('square')
    setCropMode('square')
    setLineArtMode('pathB')
    setColorSubTab('light')
    setLineArtSubTab('lineart')
    // The viewport strip is independent user-controlled state now (see handleSelectFilter's own
    // comment) — reset just restores its plain default, unrelated to activeFilterId/labMode.
    setLineArtDisplayMode('composite')
    setColorDisplayMode('graded')
    setPreviewMode('result')
    setParamsByMode(buildInitialParamsByMode())
    setFilterOverrides({})
    setActiveFilterId(null)
    setEditSnapshot(null)
    setFilterEditSheetOpen(false)
    setDualPaneEnabled(false)
    setDualPaneMode('original-composite')
    setViewportDragOver(false)
    setExportPreviewUrl(null)
    setExportPreviewDims(null)
    colorCurve.reset()
    colorAdjustments.reset()
    exportSettings.reset()
    cropEnhance.reset()
    cropResize.reset()
  }

  // Gumi's Luminance Ramp eyedropper (useLuminanceEyedropper) is shelved — not instantiated here.
  // See that hook's file header for details.

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
        showDualPaneToggle={isDesktop && (tab === 'maximizer' || tab === 'color')}
        dualPaneEnabled={dualPaneEnabled}
        onToggleDualPane={() => setDualPaneEnabled((v) => !v)}
        dualPaneActive={dualPaneActive || gradeDualPaneActive}
        dualPanePriorityIndex={gradeDualPaneActive ? 1 : DUAL_PANE_PRIORITY_INDEX[dualPaneMode]}
        onDumpState={handleDumpState}
        onLoadState={handleLoadState}
        onReset={resetApp}
        devMode={devMode}
        onUnlockDevMode={() => setDevMode(true)}
        onOpenGallery={() => setGalleryOpen(true)}
        labMode={labMode}
        onToggleLabMode={() => setLabMode((v) => !v)}
      />

      {/* Rendered unconditionally — needs to work whether or not hasImage, since BlankState's
          "Browse Gallery" opens it before any photo exists. */}
      <AlgoGalleryModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        initialAlgo={lineArtMode}
        onLoadPreset={handleLoadPreset}
        hasImage={hasImage}
      />
      <LoadSampleModal open={loadSampleOpen} onClose={() => setLoadSampleOpen(false)} onLoadFile={pipeline.loadFile} />

      <div className="body-layout">
      <div className="viewport-area">
        {hasImage && tab === 'crop' && (
          <CropTopContent
            zoom={crop.transform.scale}
            onZoomReset={crop.resetTransform}
            sourceSize={pipeline.sourceSize}
            fileInfo={pipeline.fileInfo}
          />
        )}
        {hasImage && tab === 'maximizer' && (
          dualPaneActive ? (
            <SegmentedControl options={DUAL_PANE_MODE_OPTIONS} value={dualPaneMode} onChange={setDualPaneMode} />
          ) : (
            <SegmentedControl options={DISPLAY_MODE_OPTIONS} value={lineArtDisplayMode} onChange={setLineArtDisplayMode} />
          )
        )}
        {hasImage && tab === 'color' && (
          gradeDualPaneActive ? (
            <SegmentedControl options={GRADE_DUAL_PANE_OPTIONS} value="original-graded" onChange={() => {}} />
          ) : (
            <SegmentedControl options={COLOR_DISPLAY_MODE_OPTIONS} value={colorDisplayMode} onChange={setColorDisplayMode} />
          )
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
          onDragOver={handleViewportDragOver}
          onDragLeave={handleViewportDragLeave}
          onDrop={handleViewportDrop}
        >
          {hasImage && isDesktop && viewportDragOver && (
            <div className="viewport-drop-overlay" aria-hidden="true">
              <span className="font-button-label" style={{ color: 'var(--accent-dark)' }}>Drop to replace image</span>
            </div>
          )}
          <PreviewViewport
            canvasRef={pipeline.canvasRef}
            viewportRef={crop.viewportRef}
            cropMode={cropMode}
            squareSize={squareSize}
            originalSize={originalSize}
            fillWrapper={dualPaneActive || gradeDualPaneActive}
            hasImage={hasImage}
            circle={pfpMode === 'circle'}
            interactive={tab === 'crop' && cropMode === 'square'}
            overlay={
              !hasImage ? (
                <BlankState
                  onLoadFile={pipeline.loadFile}
                  circle={pfpMode === 'circle'}
                  onBrowseGallery={() => (labMode ? setGalleryOpen(true) : setLoadSampleOpen(true))}
                  browseGalleryLabel={labMode ? 'Browse Gallery' : 'Load Sample Image'}
                />
              ) :
              tab === 'export' && exportPreviewUrl && exportPreviewDims ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-light)' }}>
                  {/* Shows the actual resampled output at its true target pixel dimensions —
                      shrink-to-fit/never-enlarge via width/height attrs (intrinsic size) + CSS
                      max-width/max-height with width/height:auto, the same "contain, don't
                      distort, don't upscale" convention pipeline.ts's own blit sizing uses for
                      the live GL canvas everywhere else. Closes the remaining WYSIWYG gap: this
                      is what the file will actually look like at its real size, not just correct
                      content shown at native working resolution. */}
                  <img
                    src={exportPreviewUrl}
                    width={exportPreviewDims.width}
                    height={exportPreviewDims.height}
                    alt="Export preview at target size"
                    style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', imageRendering: 'pixelated', display: 'block' }}
                  />
                </div>
              ) : undefined
            }
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
          {hasImage && tab === 'maximizer' && lineArtSubTab === 'tuning' && lineArtMode !== 'pathC' && (
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
                  // Without these, iOS's long-press callout (image save/copy menu) and text/image
                  // selection compete with grabbing a curve point. Set redundantly at every layer
                  // down to the svg itself (CurveEditor.tsx) — Safari is inconsistent about which
                  // ancestor "counts" for touch-callout suppression on a given descendant,
                  // especially for SVG.
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

      {/* Order within this column is CSS-controlled (see .panel-col rules in base.css): mobile
          keeps the tab bar pinned below the panel/sheet, desktop's two-column layout puts the tab
          row above the drawer content instead. DOM order here doesn't need to match either —
          `order` handles both. */}
      <div className="panel-col">
        {/* Filter edit sheet takes over the bottom bar's spot with its own sticky Discard/name/
            Commit row (SimplifiedLineArtPanel.tsx) while active — no tab switching until the user
            explicitly exits the edit flow, so the underlying tab bar is hidden rather than left
            clickable underneath. */}
        {!filterEditActive && <TabNav tabs={TABS} activeId={tab} disabled={!hasImage} onSelect={selectTab} />}

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
            resizeCustomRatio={cropResize.customRatio}
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
            gradeGradientMap={colorAdjustments.gradeGradientMap}
            setGradeGradientMap={colorAdjustments.setGradeGradientMap}
            curveChannel={colorCurve.channel}
            setCurveChannel={colorCurve.setChannel}
            curveVisible={colorCurve.visible}
            setCurveVisible={colorCurve.setVisible}
            onResetGrade={resetColorTab}
            onResetCurve={colorCurve.reset}
          />
        )}
        {hasImage && tab === 'maximizer' && (
          labMode ? (
            <LineArtPanel
              params={lineArtParams}
              onChange={handleLineArtChange}
              onReset={handleLineArtReset}
              subTab={lineArtSubTab}
              onSubTabChange={setLineArtSubTab}
              onOpenGallery={() => setGalleryOpen(true)}
            />
          ) : (
            <SimplifiedLineArtPanel
              params={lineArtParams}
              onChange={handleLineArtChange}
              activeFilterId={activeFilterId}
              filterThumbnails={filterThumbnails}
              thumbnailsGenerating={thumbnailsGenerating}
              editSheetOpen={filterEditSheetOpen}
              onSelectFilter={handleSelectFilter}
              onOpenEditSheet={handleOpenFilterEdit}
              onDiscardEdit={handleDiscardFilterEdit}
              onCommitEdit={handleCommitFilterEdit}
            />
          )
        )}
        {hasImage && tab === 'export' && (
          <ExportPanel
            cropSize={pipeline.cropSize}
            fileName={pipeline.fileInfo?.name ?? null}
            readExportPixels={pipeline.readExportPixels}
            exportDisplayMode={exportSettings.exportDisplayMode}
            setExportDisplayMode={exportSettings.setExportDisplayMode}
            exportColorGrade={exportSettings.exportColorGrade}
            setExportColorGrade={exportSettings.setExportColorGrade}
            exportColorGradeIntensity={exportSettings.exportColorGradeIntensity}
            setExportColorGradeIntensity={exportSettings.setExportColorGradeIntensity}
            resolutionMode={exportSettings.resolutionMode}
            setResolutionMode={exportSettings.setResolutionMode}
            customSize={exportSettings.customSize}
            setCustomSize={exportSettings.setCustomSize}
            exportCustomRatio={exportSettings.exportCustomRatio}
            setExportCustomRatio={exportSettings.setExportCustomRatio}
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
