import { useCallback, useEffect, useRef, useState } from 'react'
import BottomSheet from './BottomSheet'
import GradientSlider from './GradientSlider'
import ToggleSwitch from './ToggleSwitch'
import Icon from './Icon'
import IconButton from './IconButton'
import { ALGO_OPTIONS } from './AlgoGalleryModal'
import { GradientFillControls, TintColorRow } from './GradientFillControls'
import { FillTypeRow } from './LineArtPanel'
import { FILTER_MANIFEST } from '../filters/filterManifest'
import { resolveQuickFields } from '../filters/quickMacros'
import { MACRO_FIELDS, COLOR_MACRO_FIELDS } from '../filters/macroFields'
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

/** Gumi-specific: blobMask.frag.ts rejects a pixel once it sits farther than blobMaxDt from any
 * boundary — meant to reject blob *interiors*, but a stroke whose own width (after growth) exceeds
 * ~2×blobMaxDt has its center rejected too, hollowing out what should be one solid stroke into a
 * double outline with the original photo showing through the middle. gumiOverdrive (a true dilate
 * that runs after blob-rejection) is what fills that hole back in — so Thickness (mapped to
 * blobMaxDt for Gumi, see quickMacros.ts) has to move both together, at a fixed 3:0.5 ratio, to
 * avoid resurfacing this by construction rather than just resizing blobMaxDt alone. No other
 * algo's Thickness macro maps to blobMaxDt (Botan/Daiya/Fumiko all map to `radius`, a real
 * independent morphological grow with no such rejection step), so this coupling is scoped to
 * pathG only. */
const GUMI_OVERDRIVE_PER_THICKNESS = 0.5 / 3

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
    if (scrollRafRef.current != null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      syncCategoryFromScroll()
    })
  }, [syncCategoryFromScroll])

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
    const macroFields = MACRO_FIELDS[activeFilter.algo]
    const colorFields = COLOR_MACRO_FIELDS[activeFilter.algo]
    const quick = resolveQuickFields(activeFilter)
    const locked = new Set(activeFilter.lockedFields ?? [])
    const hardnessField = macroFields.hardness
    const fillType = colorFields ? getFillType(colorFields.fillType) : undefined
    const matteOn = params.blendMode === 'overwrite'

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
            label="Threshold" value={getNum(quick.threshold)} min={0} max={1}
            defaultValue={(activeFilter.params[quick.threshold] as number) ?? 0}
            onChange={(v) => setField(quick.threshold, v)}
          />
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
          <div className="lineart-divider" />
          <GradientSlider
            label="Thickness" value={getNum(quick.thickness)} min={0} max={10}
            defaultValue={(activeFilter.params[quick.thickness] as number) ?? 1}
            onChange={(v) => {
              if (activeFilter.algo === 'pathG') {
                onChange({ ...params, [quick.thickness]: v, gumiOverdrive: v * GUMI_OVERDRIVE_PER_THICKNESS })
                return
              }
              setField(quick.thickness, v)
            }}
          />
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
          <div className="lineart-divider" />
          <GradientSlider
            label={matteOn ? 'Opacity' : 'Brightness'}
            rightAccessory={
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${matteOn ? ' active' : ''}`}
                onClick={() => {
                  // Matte: single 'overwrite' blend mode (standard alpha compositing — ink where
                  // detected, base photo shows through elsewhere) with a plain 0-100% opacity
                  // slider, instead of the bipolar Multiply/Add "Brightness" scheme. Deliberately
                  // NOT the same thing as Advanced mode's overlayPassthrough/matteColor toggle
                  // (that one flattens onto a solid backing color, bypassing composite entirely,
                  // which is why Brightness read as a no-op there) — this reuses the exact same
                  // single-layer compositeProgram call site every other blend mode already goes
                  // through, just with blendMode fixed to 'overwrite' and opacity capped at 1
                  // (never entering the >1 overdrive-stacking range), so no new GL call site.
                  if (matteOn) { onChange({ ...params, blendMode: 'multiply', opacity: 1 }); return }
                  onChange({ ...params, blendMode: 'overwrite', opacity: 1 })
                }}
              >
                Matte
              </button>
            }
            value={matteOn ? params.opacity * 100 : opacityBlendToBrightness(params.opacity, params.blendMode)}
            min={matteOn ? 0 : -100}
            max={100}
            defaultValue={matteOn ? 100 : 0}
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={(v) => {
              if (matteOn) { setField('opacity', v / 100); return }
              onChange({ ...params, ...brightnessToOpacityBlend(v) })
            }}
          />
          {colorFields && (
            <>
              <div className="lineart-divider" />
              <FillTypeRow value={fillType!} onChange={(v) => setField(colorFields.fillType, v)} />
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
          {!colorFields && (
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

  return (
    <BottomSheet noDrag>
      <div className="lineart-slidergroup-stack">
        {quick && (
          <div className="simplified-quick-row">
            <GradientSlider
              label="Threshold" value={getNum(quick.threshold)} min={0} max={1}
              defaultValue={(activeFilter!.params[quick.threshold] as number) ?? 0}
              onChange={(v) => setField(quick.threshold, v)}
            />
            <GradientSlider
              label="Thickness" value={getNum(quick.thickness)} min={0} max={10}
              defaultValue={(activeFilter!.params[quick.thickness] as number) ?? 1}
              onChange={(v) => setField(quick.thickness, v)}
            />
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
