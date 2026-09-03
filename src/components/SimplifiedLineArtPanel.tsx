import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import BottomSheet from './BottomSheet'
import GradientSlider from './GradientSlider'
import SegmentedControl from './SegmentedControl'
import ToggleSwitch from './ToggleSwitch'
import Icon from './Icon'
import IconButton from './IconButton'
import { ALGO_OPTIONS } from './AlgoGalleryModal'
import { GradientFillControls, TintColorRow } from './GradientFillControls'
import { FillTypeRow } from './LineArtPanel'
import { FILTER_MANIFEST } from '../filters/filterManifest'
import { resolveQuickFields, resolveQuickMeta } from '../filters/quickMacros'
import { resolveMacroFields, resolveColorFields } from '../filters/macroFields'
import { brightnessToOpacityBlend, opacityBlendToBrightness } from '../lineart/lineBrightness'
import { toneBlendToParams, paramsToToneBlend, formatToneBlend } from '../lineart/hinataToneBlend'
import { useIsDesktop } from '../hooks/useIsDesktop'
import type { FillType, LineArtMode, LineArtParams } from '../types'

/** Algos with at least one authored filter, in ALGO_OPTIONS order — drives the category pill row
 * (jump-nav + scroll-spy) above the carousel. */
const CATEGORY_ALGOS = ALGO_OPTIONS.filter((o) => FILTER_MANIFEST.some((f) => f.algo === o.mode))

/** Nearest scrollable ancestor — the carousel's scrollport differs by layout: mobile is the
 * horizontal `.filter-carousel-row` itself, desktop is the vertical `.bottom-sheet-content` that
 * wraps the whole panel (the grid carousel has no inner scroll of its own). Used as the
 * IntersectionObserver root and the scroll-position-preservation target. */
function getScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement
  while (node) {
    const oy = getComputedStyle(node).overflowY
    if (oy === 'auto' || oy === 'scroll') return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/** Which manifest entries are the first of their algo — the carousel puts a wider gap before each
 * (CSS `[data-group-start]`) and the pill row scrolls/snaps to them. */
const GROUP_START_IDS = new Set(
  CATEGORY_ALGOS.map((o) => FILTER_MANIFEST.find((f) => f.algo === o.mode)!.id),
)

/** Per-invert-field label for the "Invert Filter" toggle row — some algos/treatments name the
 * concept differently (Hinata Edge "Fill Gaps Instead", Erode "Invert Erosion", Tone "Invert
 * Hue"). Anything not listed falls back to the generic "Invert Filter". */
const INVERT_LABELS: Partial<Record<string, string>> = {
  edgeInvertFill: 'Fill Gaps Instead',
  hiThresholdInvert: 'Invert Erosion',
  hiToneHueInvert: 'Invert Hue',
}

/** Per-algo carousel colour code — solid palette from docs/v05_frames/colorcode{Light,Dark}mode.svg,
 * defined as `--algo-active-<mode>` / `--algo-inactive-<mode>` token pairs in tokens.css (theme-aware).
 * A chip/pill exposes the two it needs as `--chip-active`/`--chip-inactive`/`--pill-active`; base.css
 * does the rest. */
const algoTintStyle = (mode: LineArtMode): CSSProperties => ({
  ['--chip-active' as string]: `var(--algo-active-${mode})`,
  ['--chip-inactive' as string]: `var(--algo-inactive-${mode})`,
})

/** Mobile chips are narrow and lean on the category-pill colour code for grouping, so the label is
 * trimmed to just the variant tag ("A1", "C2"). Desktop's bigger grid cells show `filter.label` in
 * full ("Botan A1"). */
const chipShortLabel = (label: string) => label.split(' ').slice(1).join(' ') || label

interface SimplifiedLineArtPanelProps {
  params: LineArtParams
  onChange: (next: LineArtParams) => void
  activeFilterId: string | null
  filterThumbnails: Record<string, string>
  thumbnailsGenerating: boolean
  editSheetOpen: boolean
  onSelectFilter: (filterId: string | null) => void
  onOpenEditSheet: () => void
  onDiscardEdit: () => void
  onCommitEdit: () => void
}

/** Simplified ("Instagram") mode's Line Art surface — a filter carousel with live per-photo
 * thumbnails (Stage D) instead of the full 7-algo field list, backed by the session-only
 * filterOverrides mechanism (Stage C). This component only ever reads/writes through the same
 * `onChange(next: LineArtParams)` the Advanced LineArtPanel already uses — App.tsx's existing
 * capture effect is what turns these edits into filterOverrides, no new plumbing here. */
export default function SimplifiedLineArtPanel({
  params,
  onChange,
  activeFilterId,
  filterThumbnails,
  thumbnailsGenerating,
  editSheetOpen,
  onSelectFilter,
  onOpenEditSheet,
  onDiscardEdit,
  onCommitEdit,
}: SimplifiedLineArtPanelProps) {
  const activeFilter = activeFilterId ? FILTER_MANIFEST.find((f) => f.id === activeFilterId) : undefined

  const setField = (key: keyof LineArtParams, value: unknown) => onChange({ ...params, [key]: value } as LineArtParams)
  const getNum = (key: keyof LineArtParams) => params[key] as number
  const getBool = (key: keyof LineArtParams) => params[key] as boolean
  const getColor = (key: keyof LineArtParams) => params[key] as [number, number, number]
  const getFillType = (key: keyof LineArtParams) => params[key] as FillType

  // Category pill row <-> carousel. Pills jump-scroll to a group's first chip (jumpToGroup); an
  // IntersectionObserver on the group-start chips highlights whichever group currently sits in the
  // top/left band of the scrollport (scroll-spy). The observer root is the actual scrollport for
  // the layout — see getScrollParent — so this works whether the carousel scrolls itself (mobile,
  // horizontal) or rides the panel's own scroll (desktop grid, vertical). Refs, not state, for the
  // DOM handles; activeCategory is the only render input.
  const isDesktop = useIsDesktop()
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const groupRefs = useRef<Partial<Record<LineArtMode, HTMLButtonElement | null>>>({})
  // While a pill jump-scroll animates, the highlight is pinned to the tapped target so the spy
  // doesn't walk it through every group the smooth-scroll passes over. Released on a timer.
  const jumpLockRef = useRef<LineArtMode | null>(null)
  const jumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Scroll position survives the edit-sheet round trip — the main carousel unmounts while the sheet
  // is open (early return below), so without this it re-mounts scrolled to 0.
  const carouselScrollRef = useRef(0)
  const [activeCategory, setActiveCategory] = useState<LineArtMode | null>(null)

  // Scroll-spy: which group-start chips are currently in the scrollport's leading band.
  useEffect(() => {
    if (editSheetOpen) return
    const container = carouselRef.current
    if (!container) return
    const root = isDesktop ? getScrollParent(container) : container
    const visible = new Set<LineArtMode>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const mode = CATEGORY_ALGOS.find((o) => groupRefs.current[o.mode] === e.target)?.mode
          if (!mode) continue
          if (e.isIntersecting) visible.add(mode)
          else visible.delete(mode)
        }
        if (jumpLockRef.current != null) return
        let current: LineArtMode | null = null
        for (const o of CATEGORY_ALGOS) if (visible.has(o.mode)) current = o.mode
        if (current) setActiveCategory(current)
      },
      // Shrink the root to a thin leading band so "in view" means "at the start of the scrollport",
      // not "anywhere on screen". Desktop: band starts ~150px down, clear of the sticky head (quick
      // controls + pills); mobile: a left-edge band on the horizontal strip.
      { root, rootMargin: isDesktop ? '-150px 0px -72% 0px' : '0px -82% 0px 0px', threshold: 0 },
    )
    for (const o of CATEGORY_ALGOS) {
      const el = groupRefs.current[o.mode]
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [editSheetOpen, isDesktop])

  // Track + restore scroll position across the edit-sheet round trip, on whichever element is the
  // real scrollport for this layout.
  useEffect(() => {
    if (editSheetOpen) return
    const container = carouselRef.current
    if (!container) return
    const scroller = isDesktop ? getScrollParent(container) : container
    const onScroll = () => { carouselScrollRef.current = isDesktop ? scroller.scrollTop : scroller.scrollLeft }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [editSheetOpen, isDesktop])

  useLayoutEffect(() => {
    if (editSheetOpen) return
    const container = carouselRef.current
    if (!container) return
    const scroller = isDesktop ? getScrollParent(container) : container
    if (isDesktop) scroller.scrollTop = carouselScrollRef.current
    else scroller.scrollLeft = carouselScrollRef.current
  }, [editSheetOpen, isDesktop])

  const jumpToGroup = useCallback((mode: LineArtMode) => {
    const el = groupRefs.current[mode]
    if (!el) return
    jumpLockRef.current = mode
    setActiveCategory(mode)
    // scrollIntoView walks every scroll ancestor as needed — no need to know which one moves.
    el.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'start' })
    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current)
    jumpTimerRef.current = setTimeout(() => { jumpLockRef.current = null }, 700)
  }, [])

  useEffect(() => () => { if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current) }, [])

  // Selecting a filter snaps the pill highlight to its algo without waiting for a scroll event (a
  // filter tap doesn't necessarily move the carousel). Clearing to None hands the highlight back to
  // the scroll-spy observer.
  useEffect(() => {
    if (!activeFilterId) return
    const f = FILTER_MANIFEST.find((x) => x.id === activeFilterId)
    if (f) setActiveCategory(f.algo)
  }, [activeFilterId])

  if (editSheetOpen && activeFilter) {
    const macroFields = resolveMacroFields(activeFilter)
    const colorFields = resolveColorFields(activeFilter)
    const quick = resolveQuickFields(activeFilter)
    const quickMeta = resolveQuickMeta(activeFilter)
    const locked = new Set(activeFilter.lockedFields ?? [])
    // Hide the Fill / Color group when it can't meaningfully drive the output: Find Edge mode
    // bypasses fillType/fillInvert entirely (raw Sobel colour, forced Multiply) and Overlay
    // Passthrough flattens the result onto the matte. Both are baked per-filter (never live toggles
    // here); each is false/absent for every algo that doesn't use it.
    const findEdgeOn = params.findEdge === true
    const passthroughOn = params.overlayPassthrough === true
    const gumiFillOn = params.gumiFillMode === true
    const gumiPixelThreshOn = gumiFillOn && params.gumiFillPixelThreshold === true
    const hideFillGroup = findEdgeOn || passthroughOn
    const hardnessField = macroFields.hardness
    const invertLabel = macroFields.invert ? (INVERT_LABELS[macroFields.invert] ?? 'Invert Filter') : 'Invert Filter'
    // Hinata Tone's Multiply/Screen bipolar control replaces the flat Invert row's neighbours —
    // shown when the filter opts in via macro.derivedFields (Edge/Emboss/Erode never do).
    const toneBlendOn = activeFilter.macro?.derivedFields?.includes('hiToneTarget') === true
    const fillType = colorFields ? getFillType(colorFields.fillType) : undefined

    // Blending Mode macro: "Mult / Add" is the one bipolar tab (sign picks the darken/brighten
    // branch, magnitude is opacity incl. the >1 overdrive-stacking range); Overwrite / Overlay /
    // Diff are each a plain 0-100% opacity of that blend. Any exotic blendMode set via Advanced
    // falls back to the bipolar tab (shown at +magnitude — see opacityBlendToBrightness).
    const blendTab: 'bipolar' | 'overwrite' | 'overlay' | 'difference' =
      params.blendMode === 'overwrite' ? 'overwrite'
        : params.blendMode === 'overlay' ? 'overlay'
          : params.blendMode === 'difference' ? 'difference'
            : 'bipolar'
    const bipolarBlend = blendTab === 'bipolar'
    const blendValue = bipolarBlend
      ? opacityBlendToBrightness(params.opacity, params.blendMode)
      : params.opacity * 100

    return (
      <BottomSheet
        footer={
          <div className="crop-bottomcontent" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="filter-edit-discard-btn" aria-label="Discard changes" onClick={onDiscardEdit}>
              <Icon name="cross" size={16} color="var(--accent-title)" />
            </button>
            <span className="font-button-label" style={{ color: 'var(--accent-title)' }}>{activeFilter.label}</span>
            <button type="button" className="filter-edit-commit-btn" aria-label="Commit changes" onClick={onCommitEdit}>
              <Icon name="check" size={16} color="var(--bg-light)" />
            </button>
          </div>
        }
      >
        <div className="lineart-slidergroup-stack">
          <GradientSlider
            label={quickMeta.threshold.label} value={getNum(quick.threshold)}
            min={quickMeta.threshold.min} max={quickMeta.threshold.max} step={quickMeta.threshold.step}
            defaultValue={(activeFilter.params[quick.threshold] as number) ?? 0}
            onChange={(v) => setField(quick.threshold, v)}
          />
          {!findEdgeOn && macroFields.invert && (
            <div
              className="lineart-toggle-row"
              role="button"
              tabIndex={0}
              onClick={() => setField(macroFields.invert!, !getBool(macroFields.invert!))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setField(macroFields.invert!, !getBool(macroFields.invert!))
                }
              }}
            >
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>{invertLabel}</span>
              <ToggleSwitch on={getBool(macroFields.invert)} label={invertLabel} />
            </div>
          )}
          {/* Pre-detection Denoise group — Hinata/Tsukiko only (macroFields.ts DENOISE_ALGOS). Nested
             `denoise` object, so rendered as an explicit special case rather than through extraFields;
             captured/isolated per-filter via getEditableFields pushing 'denoise'. Sits directly under
             the Threshold/Invert group — it's a pre-processing knob, ahead of the detection controls. */}
          {(activeFilter.algo === 'pathH' || activeFilter.algo === 'pathI') && (
            <>
              <div className="lineart-divider" />
              <GradientSlider
                label="Denoise Intensity" value={params.denoise.intensity} min={0} max={1}
                defaultValue={activeFilter.params.denoise?.intensity ?? 0}
                onChange={(v) => onChange({ ...params, denoise: { ...params.denoise, intensity: v } })}
              />
              <GradientSlider
                label="Denoise Threshold" value={params.denoise.threshold} min={0} max={1}
                defaultValue={activeFilter.params.denoise?.threshold ?? 0}
                onChange={(v) => onChange({ ...params, denoise: { ...params.denoise, threshold: v } })}
              />
            </>
          )}
          {/* Divider + thickness slider move together — thickness is only hidden for Gumi Fill's
             Pixel Threshold sub-mode, where keeping the standalone divider would double up against
             the next group's own leading divider. */}
          {!gumiPixelThreshOn && (
            <>
              <div className="lineart-divider" />
              <GradientSlider
                label={quickMeta.thickness.label} value={getNum(quick.thickness)}
                min={quickMeta.thickness.min} max={quickMeta.thickness.max} step={quickMeta.thickness.step}
                defaultValue={(activeFilter.params[quick.thickness] as number) ?? 1}
                onChange={(v) => setField(quick.thickness, v)}
              />
            </>
          )}
          {hardnessField && (
            <GradientSlider
              label="Hardness" value={getNum(hardnessField)} min={-1} max={1}
              defaultValue={(activeFilter.params[hardnessField] as number) ?? 0}
              onChange={(v) => setField(hardnessField, v)}
            />
          )}
          {toneBlendOn && (
            <GradientSlider
              label="Tone (Multiply / Screen)"
              value={paramsToToneBlend(params.hiToneTarget, params.hiToneGain)}
              min={-100} max={100}
              defaultValue={paramsToToneBlend(
                (activeFilter.params.hiToneTarget as LineArtParams['hiToneTarget']) ?? 'off',
                (activeFilter.params.hiToneGain as number) ?? 1,
              )}
              formatValue={formatToneBlend}
              onChange={(v) => onChange({ ...params, ...toneBlendToParams(v) })}
            />
          )}
          {activeFilter.extraFields?.map((extra) => {
            // `field` may be an array (one slider → several params); read/reset from the first.
            const fields = Array.isArray(extra.field) ? extra.field : [extra.field]
            if (fields.some((f) => locked.has(f))) return null
            return (
              <GradientSlider
                key={fields[0]}
                label={extra.label} value={getNum(fields[0])} min={extra.min} max={extra.max} step={extra.step}
                defaultValue={(activeFilter.params[fields[0]] as number) ?? extra.min}
                onChange={(v) => onChange(fields.reduce((acc, f) => ({ ...acc, [f]: v }), { ...params }) as LineArtParams)}
              />
            )
          })}
          {activeFilter.extraColorFields?.filter((extra) => !locked.has(extra.field)).map((extra) => (
            <TintColorRow
              key={extra.field}
              label={extra.label}
              tintColor={getColor(extra.field)}
              onChange={(rgb) => setField(extra.field, rgb)}
            />
          ))}
          {/* Blending Mode is hidden only where it's a genuine no-op: Find Edge forces Multiply on
             raw Sobel colour, and Overlay Passthrough flattens onto the matte before compositing.
             Every other treatment (Gumi Fill included) composites normally. */}
          {!findEdgeOn && !passthroughOn && (<>
          <div className="lineart-divider" />
          {/* Blending Mode: header row (label + %), a 4-way mode selector, then the value slider —
             bipolar -100..100 for Mult / Add, plain 0..100 for the single-blend tabs. The two
             fields it drives (blendMode/opacity) are already in BRIGHTNESS_FIELDS, so no
             macroFields change; every mode here is already implemented in composite.frag.ts. */}
          <div className="field-row-label">
            <span className="font-param-label">Blending Mode</span>
            <span className="field-row-right">
              <span className="value font-value">{`${Math.round(blendValue)}%`}</span>
            </span>
          </div>
          <div className="blend-mode-segmented">
            <SegmentedControl
              options={[
                { value: 'bipolar', label: 'Mult/Add' },
                { value: 'overwrite', label: 'Overwrite' },
                { value: 'overlay', label: 'Overlay' },
                { value: 'difference', label: 'Difference' },
              ]}
              value={blendTab}
              onChange={(tab) => {
                if (tab === blendTab) return
                const mode: LineArtParams['blendMode'] =
                  tab === 'bipolar' ? 'multiply' : tab === 'overwrite' ? 'overwrite' : tab === 'overlay' ? 'overlay' : 'difference'
                // Fresh start in the picked mode — same predictable reset the old Matte toggle did.
                onChange({ ...params, blendMode: mode, opacity: 1 })
              }}
            />
          </div>
          <GradientSlider
            label="Blending Mode"
            hideLabel
            value={blendValue}
            min={bipolarBlend ? -100 : 0}
            max={100}
            // Double-tap reset -> this filter's own saved opacity/blendMode (same rule as every
            // other slider here). Bipolar tab: the saved multiply/add brightness; single-blend
            // tabs: the saved opacity magnitude.
            defaultValue={
              bipolarBlend
                ? opacityBlendToBrightness(activeFilter.params.opacity ?? 1, activeFilter.params.blendMode ?? 'multiply')
                : (activeFilter.params.opacity ?? 1) * 100
            }
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={(v) => {
              if (bipolarBlend) { onChange({ ...params, ...brightnessToOpacityBlend(v) }); return }
              setField('opacity', v / 100)
            }}
          />
          </>)}
          {colorFields && !hideFillGroup && (
            <>
              <div className="lineart-divider" />
              <FillTypeRow value={fillType!} onChange={(v) => setField(colorFields.fillType, v)} />
              {fillType === 'image' && colorFields.exposure && (
                <GradientSlider
                  label="Exposure" value={getNum(colorFields.exposure)} min={-3} max={3}
                  defaultValue={(activeFilter.params[colorFields.exposure] as number) ?? 0}
                  onChange={(v) => setField(colorFields.exposure!, v)}
                />
              )}
              {fillType === 'image' && (
                <GradientSlider
                  label="Color Contrast" value={getNum(colorFields.colorContrast)} min={0.2} max={3}
                  defaultValue={(activeFilter.params[colorFields.colorContrast] as number) ?? 1}
                  onChange={(v) => setField(colorFields.colorContrast, v)}
                />
              )}
              {fillType === 'solid' && (
                <TintColorRow tintColor={getColor(colorFields.solidColor)} onChange={(rgb) => setField(colorFields.solidColor, rgb)} />
              )}
              {fillType === 'gradient' && (
                <GradientFillControls
                  shadow={getColor(colorFields.gradientShadow)} mid={getColor(colorFields.gradientMid)} highlight={getColor(colorFields.gradientHighlight)}
                  pivot={getNum(colorFields.gradientPivot)} duoTone={colorFields.gradientDuoTone ? getBool(colorFields.gradientDuoTone) : undefined}
                  onShadowChange={(rgb) => setField(colorFields.gradientShadow, rgb)}
                  onMidChange={(rgb) => setField(colorFields.gradientMid, rgb)}
                  onHighlightChange={(rgb) => setField(colorFields.gradientHighlight, rgb)}
                  onPivotChange={(v) => setField(colorFields.gradientPivot, v)}
                  onDuoToneChange={colorFields.gradientDuoTone ? (v) => setField(colorFields.gradientDuoTone!, v) : undefined}
                />
              )}
            </>
          )}
          {/* `color: null` in the JSON = this filter deliberately has no fill group (Hinata Edge/
             Emboss/Tone); only show the "not wired yet" note for an algo genuinely missing a
             COLOR_MACRO_FIELDS entry. */}
          {!colorFields && !hideFillGroup && activeFilter.color !== null && (
            <>
              <div className="lineart-divider" />
              <p className="font-value" style={{ color: 'var(--accent-dark)', opacity: 0.7 }}>Color: coming soon for this algorithm</p>
            </>
          )}
          {/* Overlay Passthrough flattens the result onto a solid matte instead of compositing —
             the matte colour is the one thing still worth exposing in that mode (the fill group is
             hidden, see hideFillGroup). Every passthrough filter bakes matteColor in lockedFields
             so it's captured/isolated per-filter. */}
          {passthroughOn && (
            <>
              <div className="lineart-divider" />
              <TintColorRow label="Matte Color" tintColor={params.matteColor} onChange={(rgb) => setField('matteColor', rgb)} />
            </>
          )}
        </div>
      </BottomSheet>
    )
  }

  const quick = activeFilter ? resolveQuickFields(activeFilter) : undefined
  const quickMeta = activeFilter ? resolveQuickMeta(activeFilter) : undefined
  // Gumi Fill + Pixel Threshold: no meaningful 2nd controller (raw per-pixel test) — Threshold only.
  const carouselThicknessHidden = params.gumiFillMode === true && params.gumiFillPixelThreshold === true

  return (
    <BottomSheet noDrag>
      <div className="lineart-slidergroup-stack">
        {/* Quick controls + pills pin together at the top of the panel scroll on desktop (see
           .simplified-sticky-head in base.css); plain passthrough wrapper on mobile. */}
        <div className="simplified-sticky-head">
          {quick && quickMeta && (
            <div className="simplified-quick-row">
              <GradientSlider
                label={quickMeta.threshold.label} value={getNum(quick.threshold)}
                min={quickMeta.threshold.min} max={quickMeta.threshold.max} step={quickMeta.threshold.step}
                defaultValue={(activeFilter!.params[quick.threshold] as number) ?? 0}
                onChange={(v) => setField(quick.threshold, v)}
              />
              {!carouselThicknessHidden && (
                <GradientSlider
                  label={quickMeta.thickness.label} value={getNum(quick.thickness)}
                  min={quickMeta.thickness.min} max={quickMeta.thickness.max} step={quickMeta.thickness.step}
                  defaultValue={(activeFilter!.params[quick.thickness] as number) ?? 1}
                  onChange={(v) => setField(quick.thickness, v)}
                />
              )}
            </div>
          )}
          <div className="simplified-category-row">
            {CATEGORY_ALGOS.map((o) => (
              <IconButton
                key={o.mode}
                icon={o.icon}
                variant="secondary"
                active={activeCategory === o.mode}
                style={{ ['--pill-active' as string]: `var(--algo-active-${o.mode})` } as CSSProperties}
                onClick={() => jumpToGroup(o.mode)}
              >
                {o.label}
              </IconButton>
            ))}
          </div>
        </div>
        <div className="filter-carousel-row" ref={carouselRef}>
          <FilterChip
            label="None"
            thumbnail={filterThumbnails.none}
            active={activeFilterId === null}
            editable={false}
            onClick={() => onSelectFilter(null)}
          />
          {FILTER_MANIFEST.map((filter) => {
            const groupStart = GROUP_START_IDS.has(filter.id)
            return (
              <FilterChip
                key={filter.id}
                label={filter.label}
                displayLabel={isDesktop ? filter.label : chipShortLabel(filter.label)}
                tintStyle={algoTintStyle(filter.algo)}
                thumbnail={filterThumbnails[filter.id]}
                loading={thumbnailsGenerating && !filterThumbnails[filter.id]}
                active={activeFilterId === filter.id}
                editable={activeFilterId === filter.id}
                editIconSize={isDesktop ? 52 : 30}
                groupStart={groupStart}
                buttonRef={groupStart ? (el) => { groupRefs.current[filter.algo] = el } : undefined}
                onClick={() => (activeFilterId === filter.id ? onOpenEditSheet() : onSelectFilter(filter.id))}
              />
            )
          })}
        </div>
      </div>
    </BottomSheet>
  )
}

function FilterChip({
  label,
  displayLabel,
  tintStyle,
  thumbnail,
  loading,
  active,
  editable,
  editIconSize = 30,
  groupStart,
  buttonRef,
  onClick,
}: {
  label: string
  /** Visible chip text — the trimmed variant tag ("A1"). `label` stays the full name for aria. */
  displayLabel?: string
  /** Slider glyph size on the active (edit) chip — larger on desktop where the chip thumb scales up. */
  editIconSize?: number
  /** Inline `--chip-active` / `--chip-inactive` custom props for this chip's algo (base.css does
   * the rest). Omitted for the "None" chip so it falls back to the neutral --white-50. */
  tintStyle?: CSSProperties
  thumbnail: string | undefined
  loading?: boolean
  active: boolean
  editable: boolean
  groupStart?: boolean
  buttonRef?: (el: HTMLButtonElement | null) => void
  onClick: () => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`filter-chip${active ? ' active' : ''}`}
      data-group-start={groupStart ? 'true' : undefined}
      style={tintStyle}
      onClick={onClick}
      aria-label={editable ? `Edit ${label}` : `Select ${label}`}
    >
      <span className="filter-chip-thumb">
        {editable ? (
          <span className="filter-chip-edit-icon"><Icon name="slider" size={editIconSize} color="var(--bg-light)" /></span>
        ) : thumbnail ? (
          <img src={thumbnail} alt={label} />
        ) : loading ? (
          <span className="filter-chip-placeholder" aria-hidden="true" />
        ) : null}
      </span>
      <span className="font-value filter-chip-label">{displayLabel ?? label}</span>
    </button>
  )
}
