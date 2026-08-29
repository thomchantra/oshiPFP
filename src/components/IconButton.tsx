import type { CSSProperties, ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

interface IconButtonProps {
  icon?: IconName
  children: ReactNode
  variant?: 'primary' | 'secondary'
  active?: boolean
  /** Greys the button out and ignores clicks — e.g. AlgoGalleryModal's Load Preset button with no photo loaded yet. */
  disabled?: boolean
  /** Inline style passthrough — e.g. Simplified mode's category pills set a `--pill-tint` custom property for the per-algo colour code. */
  style?: CSSProperties
  onClick?: () => void
}

/** Pill button: primary = accent-lighter bg (header Upload button, also header Dual Pane toggle when active), secondary = accent-title bg when active (algo selector). */
export default function IconButton({ icon, children, variant = 'primary', active = false, disabled = false, style, onClick }: IconButtonProps) {
  const iconColor = active ? 'var(--bg-light)' : 'var(--accent-title)'
  return (
    <button
      type="button"
      className={`icon-button icon-button-${variant}${active ? ' active' : ''}`}
      disabled={disabled}
      style={style}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={20} color={iconColor} />}
      <span className="font-button-label">{children}</span>
    </button>
  )
}
