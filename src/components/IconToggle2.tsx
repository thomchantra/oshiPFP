import Icon, { type IconName } from './Icon'

interface IconToggle2Props<T extends string> {
  options: [{ value: T; icon: IconName; label: string }, { value: T; icon: IconName; label: string }]
  value: T
  onChange: (value: T) => void
}

/** The 2-icon pill toggle from the header (square/circle PFP mode) — one tap target, cycles between the two states. */
export default function IconToggle2<T extends string>({ options, value, onChange }: IconToggle2Props<T>) {
  const activeIndex = options.findIndex((opt) => opt.value === value)
  const label = options[activeIndex]?.label ?? ''

  const cycle = () => {
    const nextIndex = (activeIndex + 1) % options.length
    onChange(options[nextIndex].value)
  }

  return (
    <button type="button" className="icon-toggle-2" aria-label={`${label}, tap to switch`} onClick={cycle}>
      {options.map((opt) => (
        <span key={opt.value} className={`icon-toggle-2-btn${opt.value === value ? ' active' : ''}`}>
          <Icon name={opt.icon} size={20} color={opt.value === value ? 'var(--accent-dark)' : 'var(--white-50)'} />
        </span>
      ))}
    </button>
  )
}
