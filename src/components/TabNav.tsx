import type { TabDef } from '../types'

interface TabNavProps {
  tabs: TabDef[]
  activeId: string
  onSelect: (id: string) => void
}

export default function TabNav({ tabs, activeId, onSelect }: TabNavProps) {
  return (
    <nav className="tab-nav">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tab-btn${activeId === t.id ? ' active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
