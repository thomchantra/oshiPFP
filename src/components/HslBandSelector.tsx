import { HUE_BAND_SWATCHES } from '../color/hslPalette'
import type { HslBand } from '../types'

interface HslBandSelectorProps {
  active: HslBand
  onChange: (band: HslBand) => void
}

/**
 * Rainbow swatch, leftmost — Figma's reference "Colordrawer" component (node 26-2353) only
 * covers the 8 targeted hue bands; this is the addition that makes "apply globally" a real,
 * visually distinct option in the same row instead of a separate control elsewhere. Uses a plain
 * vertical linear-gradient wipe, not conic/angular — conic-gradient inside a circular-clipped
 * button has known iOS Safari rendering artifacts, so linear-gradient sidesteps that entirely.
 */
const MASTER_SWATCH_BG = 'linear-gradient(180deg, #FF0000, #FF8000, #FFFF00, #00FF00, #00FFFF, #0000FF, #FF00FF)'

export default function HslBandSelector({ active, onChange }: HslBandSelectorProps) {
  return (
    <div className="hsl-band-row">
      <button
        type="button"
        className={`hsl-swatch${active === 'master' ? ' active' : ''}`}
        style={{ background: MASTER_SWATCH_BG }}
        onClick={() => onChange('master')}
        aria-label="Master (whole image)"
      />
      {HUE_BAND_SWATCHES.map((swatch) => (
        <button
          key={swatch.key}
          type="button"
          className={`hsl-swatch${active === swatch.key ? ' active' : ''}`}
          style={{ background: swatch.hex }}
          onClick={() => onChange(swatch.key)}
          aria-label={swatch.label}
        />
      ))}
    </div>
  )
}
