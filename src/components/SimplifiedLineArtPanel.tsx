import BottomSheet from './BottomSheet'
import GradientSlider from './GradientSlider'
import ToggleSwitch from './ToggleSwitch'
import Icon from './Icon'
import { GradientFillControls, TintColorRow } from './GradientFillControls'
import { FillTypeRow } from './LineArtPanel'
import { FILTER_MANIFEST } from '../filters/filterManifest'
import { QUICK_MACRO_FIELDS } from '../filters/quickMacros'
import { MACRO_FIELDS, COLOR_MACRO_FIELDS } from '../filters/macroFields'
import { brightnessToOpacityBlend, opacityBlendToBrightness } from '../lineart/lineBrightness'
import type { FillType, LineArtParams } from '../types'

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

  if (editSheetOpen && activeFilter) {
    const macroFields = MACRO_FIELDS[activeFilter.algo]
    const colorFields = COLOR_MACRO_FIELDS[activeFilter.algo]
    const quick = QUICK_MACRO_FIELDS[activeFilter.algo]
    const hardnessField = macroFields.hardness
    const fillType = colorFields ? getFillType(colorFields.fillType) : undefined

    return (
      <BottomSheet>
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
            label="Thickness" value={getNum(quick.thickness)} min={0} max={20}
            defaultValue={(activeFilter.params[quick.thickness] as number) ?? 1}
            onChange={(v) => setField(quick.thickness, v)}
          />
          {hardnessField && (
            <GradientSlider
              label="Hardness" value={getNum(hardnessField)} min={-1} max={1}
              defaultValue={(activeFilter.params[hardnessField] as number) ?? 0}
              onChange={(v) => setField(hardnessField, v)}
            />
          )}
          <div className="lineart-divider" />
          <GradientSlider
            label="Brightness"
            rightAccessory={
              <button
                type="button"
                className={`pill-toggle-btn font-button-label${params.overlayPassthrough ? ' active' : ''}`}
                onClick={() => setField('overlayPassthrough', !params.overlayPassthrough)}
              >
                Matte
              </button>
            }
            value={params.overlayPassthrough ? params.opacity * 100 : opacityBlendToBrightness(params.opacity, params.blendMode)}
            min={params.overlayPassthrough ? 0 : -100}
            max={100}
            defaultValue={0}
            formatValue={(v) => `${Math.round(v)}%`}
            onChange={(v) => {
              if (params.overlayPassthrough) { setField('opacity', v / 100); return }
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
                  pivot={getNum(colorFields.gradientPivot)} duoTone={getBool(colorFields.gradientDuoTone)}
                  onShadowChange={(rgb) => setField(colorFields.gradientShadow, rgb)}
                  onMidChange={(rgb) => setField(colorFields.gradientMid, rgb)}
                  onHighlightChange={(rgb) => setField(colorFields.gradientHighlight, rgb)}
                  onPivotChange={(v) => setField(colorFields.gradientPivot, v)}
                  onDuoToneChange={(v) => setField(colorFields.gradientDuoTone, v)}
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
          <div className="crop-bottomcontent" style={{ padding: 0, marginTop: 10, justifyContent: 'space-between' }}>
            <button type="button" className="theme-btn" aria-label="Discard changes" onClick={onDiscardEdit}>✕</button>
            <span className="font-button-label" style={{ color: 'var(--accent-title)' }}>{activeFilter.label}</span>
            <button type="button" className="theme-btn" aria-label="Commit changes" onClick={onCommitEdit}>✓</button>
          </div>
        </div>
      </BottomSheet>
    )
  }

  const quick = activeFilter ? QUICK_MACRO_FIELDS[activeFilter.algo] : undefined

  return (
    <BottomSheet>
      <div className="lineart-slidergroup-stack">
        {quick && (
          <>
            <GradientSlider
              label="Threshold" value={getNum(quick.threshold)} min={0} max={1}
              defaultValue={(activeFilter!.params[quick.threshold] as number) ?? 0}
              onChange={(v) => setField(quick.threshold, v)}
            />
            <GradientSlider
              label="Thickness" value={getNum(quick.thickness)} min={0} max={20}
              defaultValue={(activeFilter!.params[quick.thickness] as number) ?? 1}
              onChange={(v) => setField(quick.thickness, v)}
            />
            <div className="lineart-divider" />
          </>
        )}
        <div className="lineart-algoselector-row">
          <FilterChip
            label="None"
            thumbnail={undefined}
            active={activeFilterId === null}
            editable={false}
            onClick={() => onSelectFilter(null)}
          />
          {FILTER_MANIFEST.map((filter) => (
            <FilterChip
              key={filter.id}
              label={filter.label}
              thumbnail={filterThumbnails[filter.id]}
              loading={thumbnailsGenerating && !filterThumbnails[filter.id]}
              active={activeFilterId === filter.id}
              editable={activeFilterId === filter.id}
              onClick={() => (activeFilterId === filter.id ? onOpenEditSheet() : onSelectFilter(filter.id))}
            />
          ))}
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
  onClick,
}: {
  label: string
  thumbnail: string | undefined
  loading?: boolean
  active: boolean
  editable: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`filter-chip${active ? ' active' : ''}`}
      onClick={onClick}
      aria-label={editable ? `Edit ${label}` : `Select ${label}`}
    >
      <span className="filter-chip-thumb">
        {editable ? (
          <span className="filter-chip-edit-icon"><Icon name="slider" size={20} color="var(--bg-light)" /></span>
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
