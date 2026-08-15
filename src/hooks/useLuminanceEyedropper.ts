import { useCallback, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'

// Intentionally unused/shelved, not orphaned — Gumi's Luminance Ramp eyedropper UI was pulled
// after real clickzone issues surfaced in testing. Kept in place for a future pass; see App.tsx.

/** The 4 Luminance Ramp sliders an eyedropper pick can target — Feather excluded, it's a softness param, not a luminance sample point. */
export type RampSliderKey = 'gumiRampFloor' | 'gumiRampInnerLow' | 'gumiRampInnerHigh' | 'gumiRampCeiling'

interface SampledColor {
  r: number
  g: number
  b: number
}

interface HoverSample extends SampledColor {
  clientX: number
  clientY: number
  luminance: number
}

/** BT.709 luminance, matching threshold.frag.ts's dot(rgb, vec3(0.2126, 0.7152, 0.0722)) exactly so a picked value lines up with what the shader thresholds against. */
function bt709Luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

interface UseLuminanceEyedropperArgs {
  canvasRef: RefObject<HTMLCanvasElement | null>
  sampleEnhancePixel: (u: number, v: number) => SampledColor | null
  onCommit: (target: RampSliderKey, luminance: number) => void
}

/**
 * Tap-icon-then-drag-on-canvas calibration flow for Gumi's Luminance Ramp
 * sliders: arm() targets one slider, dragging over the preview canvas
 * live-samples enhanceTarget (see Pipeline.sampleEnhancePixel) under the
 * pointer, and release commits the sampled luminance to that slider and
 * disarms — single-shot per arm, not a sticky mode.
 *
 * Lives at App.tsx level (not inside LineArtPanel) because it needs
 * pipeline.canvasRef and must supply pointer handlers to PreviewViewport,
 * which sits outside LineArtPanel's subtree.
 */
export function useLuminanceEyedropper({ canvasRef, sampleEnhancePixel, onCommit }: UseLuminanceEyedropperArgs) {
  const [armedTarget, setArmedTarget] = useState<RampSliderKey | null>(null)
  const [samples, setSamples] = useState<Partial<Record<RampSliderKey, SampledColor>>>({})
  const [hover, setHover] = useState<HoverSample | null>(null)
  const [dragging, setDragging] = useState(false)

  const arm = useCallback((target: RampSliderKey) => {
    setArmedTarget(target)
  }, [])

  const disarm = useCallback(() => {
    setArmedTarget(null)
    setDragging(false)
    setHover(null)
  }, [])

  const sampleAt = useCallback(
    (clientX: number, clientY: number): HoverSample | null => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      const u = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const v = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
      const rgb = sampleEnhancePixel(u, v)
      if (!rgb) return null
      return { ...rgb, clientX, clientY, luminance: bt709Luminance(rgb.r, rgb.g, rgb.b) }
    },
    [canvasRef, sampleEnhancePixel],
  )

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!armedTarget) return
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      setDragging(true)
      setHover(sampleAt(e.clientX, e.clientY))
    },
    [armedTarget, sampleAt],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!armedTarget || !dragging) return
      setHover(sampleAt(e.clientX, e.clientY))
    },
    [armedTarget, dragging, sampleAt],
  )

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!armedTarget || !dragging) return
      const result = sampleAt(e.clientX, e.clientY)
      if (result) {
        onCommit(armedTarget, result.luminance)
        setSamples((prev) => ({ ...prev, [armedTarget]: { r: result.r, g: result.g, b: result.b } }))
      }
      disarm()
    },
    [armedTarget, dragging, sampleAt, onCommit, disarm],
  )

  const resetSamples = useCallback(() => setSamples({}), [])

  return {
    armedTarget,
    samples,
    hover,
    arm,
    disarm,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel: disarm,
    resetSamples,
  }
}
