import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import type { FillType, LineArtMode, LineArtParams } from '../types'

/** Algos with at least one authored filter, in ALGO_OPTIONS order — drives the category pill row
 * (jump-nav + scroll-spy) above the carousel. */
const CATEGORY_ALGOS = ALGO_OPTIONS.filter((o) => FILTER_MANIFEST.some((f) => f.algo === o.mode))

/** Which manifest entries are the first of their algo — the carousel puts a wider gap before each
 * (CSS `[data-group-start]`) and the pill row scrolls/snaps to them. */
const GROUP_START_IDS = new Set(
  CATEGORY_ALGOS.map((o) => FILTER_MANIFEST.find((f) => f.algo === o.mode)!.id),
)

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

  // Category pill row <-> carousel: pills jump-scroll the carousel to a group's first chip, and a
  // manual carousel scroll highlights whichever group's first chip has passed the left edge
  // (scroll-spy). Refs, not state, for the DOM handles; activeCategory is the only render input.
  const carouselRef = useRef<HTMLDivElement | null>(null)
  const groupRefs = useRef<Partial<Record<LineArtMode, HTMLButtonElement | null>>>({})
  const scrollRafRef = useRef<number | null>(null)
  // Carousel scroll position survives the edit-sheet round trip — the main-view carousel unmounts
  // while the sheet is open (early return below), so without this it re-mounts scrolled to 0.
  const carouselScrollRef = useRef(0)
  const [activeCategory, setActiveCategory] = useState<LineArtMode | null>(null)

  const syncCategoryFromScroll = useCallback(() => {
    const container = carouselRef.current
    if (!container) return
    const slop = 24 // treat a group as "current" once its first chip is within 24px of the edge
    let current: LineArtMode | null = null
    for (const o of CATEGORY_ALGOS) {
      const el = groupRefs.current[o.mode]
      if (el && el.offsetLeft <= container.scrollLeft + slop) current = o.mode
    }
    setActiveCategory(current)
  }, [])

  const handleCarouselScroll = useCallback(() => {
    if (carouselRef.current) carouselScrollRef.current = carouselRef.current.scrollLeft
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      syncCategoryFromScroll()
    })
  }, [syncCategoryFromScroll])

  // Restore the saved scroll position each time the main-view carousel (re)mounts — i.e. when the
  // edit sheet closes. Layout effect so it lands before paint (no visible jump to 0 then back).
  useLayoutEffect(() => {
    if (editSheetOpen) return
    const container = carouselRef.current
    if (container) container.scrollLeft = carouselScrollRef.current
  }, [editSheetOpen])

  const jumpToGroup = useCallback((mode: LineArtMode) => {
    const container = carouselRef.current
    const el = groupRefs.current[mode]
    if (!container || !el) return
    container.scrollTo({ left: Math.max(0, el.offsetLeft - 4), behavior: 'smooth' })
    setActiveCategory(mode)
  }, [])

  // Selecting a filter (or clearing to None) keeps the pill highlight in step without waiting for a
  // scroll event — a filter tap doesn't necessarily move the carousel.
  useEffect(() => {
    if (!activeFilterId) { syncCategoryFromScroll(); return }
    const f = FILTER_MANIFEST.find((x) => x.id === activeFilterId)
    if (f) setActiveCategory(f.algo)
  }, [activeFilterId, syncCategoryFromScroll])

  if (editSheetOpen && activeFilter) {
    const macroFields = resolveMacroFields(activeFilter)
    const colorFields = resolveColorFields(activeFilter)
    const quick = resolveQuickFields(activeFilter)
    const quickMeta = resolveQuickMeta(activeFilter)
    const locked = new Set(activeFilter.lockedFields ?? [])
    // Hide the Fill / Color group when it can't meaningfully drive the output: Find Edge mode
    // bypasses fillType/fillInvert entirely (raw Sobel colour, forced Multiply), Overlay
    // Passthrough flattens the result onto the matte, and Gumi Fill's Pixel Threshold is a raw
    // per-pixel test with no fill region to colour. All three fields are baked per-filter (never
    // live toggles here); each is false/absent for every algo that doesn't use it.
    const findEdgeOn = params.findEdge === true
    const passthroughOn = params.overlayPassthrough === true
    const gumiFillOn = params.gumiFillMode === true
    const gumiPixelThreshOn = gumiFillOn && params.gumiFillPixelThreshold === true
    const hideFillGroup = findEdgeOn || passthroughOn || gumiPixelThreshOn
    const hardnessField = macroFields.hardness
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
          {!findEdgeOn && (
            <div
              className="lineart-toggle-row"
              role="button"
              tabIndex={0}
              onClick={() => setField(macroFields.invert, !getBool(macroFields.invert))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setField(macroFields.invert, !getBool(macroFields.invert))
                }
              }}
            >
              <span className="font-param-label" style={{ color: 'var(--accent-dark)' }}>Invert Filter</span>
              <ToggleSwitch on={getBool(macroFields.invert)} label="Invert Filter" />
            </div>
          )}
          <div className="lineart-divider" />
          {!gumiPixelThreshOn && (
            <GradientSlider
              label={quickMeta.thickness.label} value={getNum(quick.thickness)}
              min={quickMeta.thickness.min} max={quickMeta.thickness.max} step={quickMeta.thickness.step}
              defaultValue={(activeFilter.params[quick.thickness] as number) ?? 1}
              onChange={(v) => setField(quick.thickness, v)}
            />
          )}
          {hardnessField && (
            <GradientSlider
              label="Hardness" value={getNum(hardnessField)} min={-1} max={1}
              defaultValue={(activeFilter.params[hardnessField] as number) ?? 0}
              onChange={(v) => setField(hardnessField, v)}
            />
          )}
          {activeFilter.extraFields?.filter((extra) => !locked.has(extra.field)).map((extra) => (
            <GradientSlider
              key={extra.field}
              label={extra.label} value={getNum(extra.field)} min={extra.min} max={extra.max} step={extra.step}
              defaultValue={(activeFilter.params[extra.field] as number) ?? extra.min}
              onChange={(v) => setField(extra.field, v)}
            />
          ))}
          {/* Gumi Fill mode's edit sheet is Threshold / Invert / Fill Radius / Fill Type only —
             no Blending Mode (its output isn't composited the same way). */}
          {!gumiFillOn && (<>
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
          {!colorFields && !hideFillGroup && (
            <>
              <div className="lineart-divider" />
              <p className="font-value" style={{ color: 'var(--accent-dark)', opacity: 0.7 }}>Color — coming soon for this algorithm</p>
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
              onClick={() => jumpToGroup(o.mode)}
            >
              {o.label}
            </IconButton>
          ))}
        </div>
        <div className="filter-carousel-row" ref={carouselRef} onScroll={handleCarouselScroll}>
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
                thumbnail={filterThumbnails[filter.id]}
                loading={thumbnailsGenerating && !filterThumbnails[filter.id]}
                active={activeFilterId === filter.id}
                editable={activeFilterId === filter.id}
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
  thumbnail,
  loading,
  active,
  editable,
  groupStart,
  buttonRef,
  onClick,
}: {
  label: string
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
      onClick={onClick}
      aria-label={editable ? `Edit ${label}` : `Select ${label}`}
    >
      <span className="filter-chip-thumb">
        {editable ? (
          <span className="filter-chip-edit-icon"><Icon name="slider" size={30} color="var(--bg-light)" /></span>
        ) : thumbnail ? (
          <img src={thumbnail} alt={label} />
        ) : loading ? (
          <span className="filter-chip-placeholder" aria-hidden="true" />
        ) : null}
      </span>
      <span className="font-value filter-chip-label">{label}</span>
    </button>
  )
}
