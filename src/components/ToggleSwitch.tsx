interface ToggleSwitchProps {
  on: boolean
  label: string
}

/** Purely visual — click handling lives on the containing row (e.g.
    `.lineart-toggle-row`) so the whole row is tappable, not just this
    small control. See LineArtPanel.tsx's usage. */
export default function ToggleSwitch({ on, label }: ToggleSwitchProps) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle-switch${on ? ' on' : ''}`}
    />
  )
}
