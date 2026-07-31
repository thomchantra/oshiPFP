import type { ReactNode } from 'react'

interface CardProps {
  title: string
  dot?: 'blue' | 'green' | 'amber' | 'dim'
  meta?: string
  children: ReactNode
}

export default function Card({ title, dot = 'dim', meta, children }: CardProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span className={`status-dot dot-${dot}`} />
        <span className="card-title">{title}</span>
        {meta && <span className="card-header-meta">{meta}</span>}
      </div>
      <div className="card-body">{children}</div>
    </div>
  )
}
