import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

interface IconButtonProps {
  icon?: IconName
  children: ReactNode
  variant?: 'primary' | 'secondary'
  active?: boolean
  onClick?: () => void
}

/** Pill button: primary = accent-lighter bg (header Upload button), secondary = accent-title bg when active (algo selector). */
export default function IconButton({ icon, children, variant = 'primary', active = true, onClick }: IconButtonProps) {
  const iconColor = variant === 'primary' ? 'var(--accent-title)' : active ? 'var(--bg-light)' : 'var(--accent-title)'
  return (
    <button
      type="button"
      className={`icon-button icon-button-${variant}${active ? ' active' : ''}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={20} color={iconColor} />}
      <span className="font-button-label">{children}</span>
    </button>
  )
}
