import type { TabDef } from '../types'
import Icon from './Icon'

interface TabNavProps {
  tabs: TabDef[]
  activeId: string | null
  disabled: boolean
  onSelect: (id: string) => void
}

/** Tapping the already-active tab deselects it, letting the preview grow to full height. */
export default function TabNav({ tabs, activeId, disabled, onSelect }: TabNavProps) {
  return (
    <nav className="tab-nav">
      {tabs.map((t) => {
        const active = activeId === t.id
        return (
          <button
            key={t.id}
            className={`tab-btn${active ? ' active' : ''}`}
            disabled={disabled}
            onClick={() => onSelect(t.id)}
          >
            <Icon name={t.icon} size={22} color={active ? 'var(--tab-active-text)' : 'var(--accent-dark)'} />
            <span className="font-tab-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
