interface ToggleSwitchProps {
  on: boolean
  onChange: (on: boolean) => void
  label: string
}

export default function ToggleSwitch({ on, onChange, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle-switch${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
    />
  )
}
