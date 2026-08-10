import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useIsDesktop } from '../hooks/useIsDesktop'

const MIN_HEIGHT_PX = 64
const DEFAULT_HEIGHT_FRACTION = 0.36
const MAX_HEIGHT_FRACTION = 0.8
// Matches .bottom-sheet-handle-row (8px top/bottom padding + 5px handle) and
// .bottom-sheet-content's bottom padding (see base.css) — added to the
// measured content height below to get the sheet's true full-content height.
const HANDLE_ROW_HEIGHT_PX = 21
const CONTENT_BOTTOM_PADDING_PX = 20

interface BottomSheetProps {
  children: ReactNode
  /**
   * Overrides the default 0.8 max-height-of-window fraction. The Color
   * tab passes 0.5 so the sheet can never crowd the curve/viewport below
   * half the screen even if a sub-tab's content (e.g. HSL's 3 sliders)
   * would otherwise want more room than that — the sheet still caps DOWN
   * to its actual content height first (see below), this only lowers the
   * ceiling for when content is tall enough to hit it.
   */
  maxHeightFraction?: number
}

/**
 * Freely-draggable sheet (continuous height, not iOS/SwiftUI's 3-breakpoint
 * step behavior) — dragging the handle tracks the pointer 1:1 instead of
 * snapping between collapsed/default/expanded. The viewport above it is a
 * flex-shrinkable sibling (see App.tsx), so it fills whatever height this
 * sheet doesn't take, continuously.
 *
 * Height is capped to the content's own natural height (measured via
 * ResizeObserver on an unconstrained inner wrapper, not the flex/overflow-
 * clamped .bottom-sheet-content itself) rather than a flat viewport
 * fraction — a short panel (e.g. Crop's 2-slider Enhancement section)
 * used to leave a dead-space gap below the last row once dragged (or even
 * defaulted) past its actual content height; this makes "all rows
 * visible, no more" the hard ceiling instead.
 */
export default function BottomSheet({ children, maxHeightFraction = MAX_HEIGHT_FRACTION }: BottomSheetProps) {
  // The drag-to-resize sheet only makes sense in the mobile layout, where it
  // shares screen space with the viewport above it — desktop's two-column
  // layout gives the panel its own full-height column instead (see
  // .panel-col in base.css), so there's nothing to drag against.
  const isDesktop = useIsDesktop()
  const [height, setHeight] = useState(() =>
    Math.round(window.innerHeight * DEFAULT_HEIGHT_FRACTION),
  )
  const [contentHeight, setContentHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const dragStartY = useRef<number | null>(null)
  const dragStartHeight = useRef(0)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0].contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const maxHeight =
    contentHeight > 0
      ? Math.min(window.innerHeight * maxHeightFraction, contentHeight + HANDLE_ROW_HEIGHT_PX + CONTENT_BOTTOM_PADDING_PX)
      : window.innerHeight * maxHeightFraction
  const effectiveHeight = Math.max(MIN_HEIGHT_PX, Math.min(height, maxHeight))

  const handlePointerDown = (e: ReactPointerEvent) => {
    dragStartY.current = e.clientY
    dragStartHeight.current = effectiveHeight
    setDragging(true)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e: ReactPointerEvent) => {
    if (dragStartY.current === null) return
    const delta = e.clientY - dragStartY.current
    setHeight(Math.min(maxHeight, Math.max(MIN_HEIGHT_PX, dragStartHeight.current - delta)))
  }
  const endDrag = () => {
    dragStartY.current = null
    setDragging(false)
  }

  if (isDesktop) {
    return (
      <div className="bottom-sheet bottom-sheet-desktop">
        <div className="bottom-sheet-content">{children}</div>
      </div>
    )
  }

  return (
    <div className="bottom-sheet" style={{ height: effectiveHeight, transition: dragging ? 'none' : 'height 0.15s ease' }}>
      <div
        className="bottom-sheet-handle-row"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="bottom-sheet-handle" />
      </div>
      <div className="bottom-sheet-content">
        <div ref={contentRef}>{children}</div>
      </div>
    </div>
  )
}
