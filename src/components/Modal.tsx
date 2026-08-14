import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 'large' (v0.3 polish pass) widens the card on desktop — for content that benefits from more
   * room there (e.g. Line Art's algorithm gallery), while every other modal (About, Reset confirm)
   * stays at the default width, which reads better for plain text at any viewport size. */
  size?: 'default' | 'large'
}

export default function Modal({ open, onClose, title, children, size = 'default' }: ModalProps) {
  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card${size === 'large' ? ' modal-card-large' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="font-button-label" style={{ color: 'var(--accent-title)' }}>{title}</span>
          <button type="button" className="modal-close-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
