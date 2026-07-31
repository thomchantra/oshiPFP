interface StepperProps {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
}

export default function Stepper({ value, min = -Infinity, max = Infinity, step = 1, onChange, disabled }: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn dec"
        disabled={disabled}
        onClick={() => onChange(clamp(value - step))}
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(clamp(n))
        }}
      />
      <button
        type="button"
        className="stepper-btn inc"
        disabled={disabled}
        onClick={() => onChange(clamp(value + step))}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )
}
