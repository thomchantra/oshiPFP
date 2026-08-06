import Icon from './Icon'
import { CURVE_CHANNEL_OPTIONS, type CurveChannel } from '../curve/useColorCurve'

interface ColorCurveTopContentProps {
  channel: CurveChannel
  onChannelChange: (channel: CurveChannel) => void
  visible: boolean
  onVisibleChange: (visible: boolean) => void
  /** Resets everything in the Color tab (curve + HSL + Invert + Light + Color basic adjustments) — not just the curve. */
  onResetAll: () => void
}

/**
 * Channel selector + visibility toggle + Reset All, positioned same as
 * Line Art's display-mode SegmentedControl (viewport-area, right under the
 * header/Upload row) — moved out of the on-image curve graph itself so a
 * card background isn't needed there anymore (see ColorCurveOverlay.tsx).
 *
 * The curve-visibility toggle (leftmost) is styled identically to the RGB
 * channel pill's active/inactive states, so it reads as part of the same
 * button group rather than a visually distinct control.
 */
export default function ColorCurveTopContent({ channel, onChannelChange, visible, onVisibleChange, onResetAll }: ColorCurveTopContentProps) {
  return (
    <div className="crop-topcontent">
      <div className="curve-overlay-channels">
        <button
          type="button"
          className={`curve-channel-btn${visible ? ' active' : ''}`}
          style={{ color: visible ? 'var(--bg-light)' : 'var(--accent-title)', background: visible ? 'var(--accent-title)' : undefined }}
          onClick={() => onVisibleChange(!visible)}
          aria-label={visible ? 'Hide curve overlay' : 'Show curve overlay'}
          aria-pressed={visible}
        >
          <Icon name="curve" size={14} color="currentColor" />
        </button>
        {CURVE_CHANNEL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`curve-channel-btn font-button-label${opt.value === channel ? ' active' : ''}`}
            style={{ color: opt.value === channel ? 'var(--bg-light)' : opt.color, background: opt.value === channel ? opt.color : undefined }}
            onClick={() => onChannelChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
        {visible && (
          <span className="font-value curve-hint" style={{ color: 'var(--accent-dark)', opacity: 0.6 }}>
            Double-tap +/- point
          </span>
        )}
      </div>
      <button type="button" className="text-reset-btn font-value" onClick={onResetAll}>
        Reset All
      </button>
    </div>
  )
}
