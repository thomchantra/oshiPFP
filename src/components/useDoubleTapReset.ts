import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

const DOUBLE_TAP_MS = 350

/**
 * Returns an onPointerDown handler that resets a control to `defaultValue`
 * on double-tap/double-click. Calls preventDefault on the triggering event —
 * without it, a native <input type=range> still runs its own default
 * "jump thumb to touch point" behavior for that same pointerdown right after
 * our reset fires, which visibly looked like the slider flashing to the
 * reset value then immediately bouncing back to wherever you tapped.
 */
export function useDoubleTapReset(defaultValue: number, onChange: (value: number) => void) {
  const lastTapRef = useRef(0)

  return (e: ReactPointerEvent) => {
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      e.preventDefault()
      onChange(defaultValue)
      lastTapRef.current = 0
    } else {
      lastTapRef.current = now
    }
  }
}
