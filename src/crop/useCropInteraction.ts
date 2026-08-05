import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { clampCropTransform, cropTransformToRect, defaultCropTransform, panBy, zoomAtPoint } from './cropMath'
import type { CropRect } from '../gl/pipeline'
import type { CropTransform } from '../types'

const WHEEL_ZOOM_SPEED = 0.0015

interface UseCropInteractionArgs {
  enabled: boolean
  sourceSize: { width: number; height: number } | null
  /** Target crop rect aspect ratio (width/height) — 1 for square, or a live-measured container aspect for free-form "original" mode. */
  aspect: number
  onRectChange: (rect: CropRect) => void
}

/**
 * Pan (drag)/zoom (pinch or wheel) interaction for the crop viewport,
 * decoupled from any specific component so the same hook drives the
 * pointer handlers regardless of which tab currently owns the shared
 * preview canvas (`enabled` gates whether gestures actually take effect).
 */
export function useCropInteraction({ enabled, sourceSize, aspect, onRectChange }: UseCropInteractionArgs) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [transform, setTransform] = useState<CropTransform>(defaultCropTransform())
  const transformRef = useRef(transform)
  const pendingFrame = useRef<number | null>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchStartDist = useRef<number | null>(null)

  useEffect(() => {
    transformRef.current = transform
  }, [transform])

  // Reset to a centered, fully-covering crop whenever a new image loads or the target aspect changes.
  useEffect(() => {
    if (sourceSize) {
      setTransform(clampCropTransform(defaultCropTransform(), sourceSize.width, sourceSize.height, aspect))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceSize, aspect])

  useEffect(() => {
    if (!sourceSize) return
    onRectChange(cropTransformToRect(transform, sourceSize.width, sourceSize.height, aspect))
    // onRectChange identity is stable from usePipeline; only re-run on data changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transform, sourceSize, aspect])

  const scheduleTransform = useCallback((next: CropTransform) => {
    transformRef.current = next
    if (pendingFrame.current !== null) return
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null
      setTransform(transformRef.current)
    })
  }, [])

  const getLocalPoint = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top, size: rect.width }
  }, [])

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled || !sourceSize) return
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      const p = getLocalPoint(e.clientX, e.clientY)
      pointers.current.set(e.pointerId, { x: p.x, y: p.y })
      if (pointers.current.size === 2) {
        const pts = Array.from(pointers.current.values())
        pinchStartDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      }
    },
    [enabled, sourceSize, getLocalPoint],
  )

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!enabled || !sourceSize || !pointers.current.has(e.pointerId)) return
      const prev = pointers.current.get(e.pointerId)!
      const p = getLocalPoint(e.clientX, e.clientY)
      pointers.current.set(e.pointerId, { x: p.x, y: p.y })

      if (pointers.current.size === 1) {
        const dx = p.x - prev.x
        const dy = p.y - prev.y
        scheduleTransform(panBy(transformRef.current, dx, dy, p.size, sourceSize.width, sourceSize.height, aspect))
      } else if (pointers.current.size === 2) {
        const pts = Array.from(pointers.current.values())
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        if (pinchStartDist.current && pinchStartDist.current > 0) {
          const factor = dist / pinchStartDist.current
          const midX = (pts[0].x + pts[1].x) / 2
          const midY = (pts[0].y + pts[1].y) / 2
          scheduleTransform(
            zoomAtPoint(
              transformRef.current,
              sourceSize.width,
              sourceSize.height,
              p.size,
              midX,
              midY,
              transformRef.current.scale * factor,
              aspect,
            ),
          )
        }
        pinchStartDist.current = dist
      }
    },
    [enabled, sourceSize, aspect, getLocalPoint, scheduleTransform],
  )

  const endPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStartDist.current = null
  }, [])

  // React attaches onWheel as a passive listener, so preventDefault() inside
  // it silently fails and the page would scroll underneath a trackpad/wheel
  // zoom gesture. Attach a native listener with { passive: false } instead.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      if (!enabled || !sourceSize) return
      e.preventDefault()
      const p = getLocalPoint(e.clientX, e.clientY)
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SPEED)
      scheduleTransform(
        zoomAtPoint(
          transformRef.current,
          sourceSize.width,
          sourceSize.height,
          p.size,
          p.x,
          p.y,
          transformRef.current.scale * factor,
          aspect,
        ),
      )
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [enabled, sourceSize, aspect, getLocalPoint, scheduleTransform])

  return { viewportRef, transform, handlePointerDown, handlePointerMove, endPointer }
}
