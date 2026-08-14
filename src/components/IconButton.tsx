import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

interface IconButtonProps {
  icon?: IconName
  children: ReactNode
  variant?: 'primary' | 'secondary'
  active?: boolean
  /** Greys the button out and ignores clicks — e.g. AlgoGalleryModal's Load Preset button with no photo loaded yet. */
  disabled?: boolean
  onClick?: () => void
}

/** Pill button: primary = accent-lighter bg (header Upload button, also header Dual Pane toggle when active), secondary = accent-title bg when active (algo selector). */
export default function IconButton({ icon, children, variant = 'primary', active = false, disabled = false, onClick }: IconButtonProps) {
  const iconColor = active ? 'var(--bg-light)' : 'var(--accent-title)'
  return (
    <button
      type="button"
      className={`icon-button icon-button-${variant}${active ? ' active' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={20} color={iconColor} />}
      <span className="font-button-label">{children}</span>
    </button>
  )
}
