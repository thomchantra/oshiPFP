import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

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
export default function BottomSheet({ children }: BottomSheetProps) {
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
      ? Math.min(window.innerHeight * MAX_HEIGHT_FRACTION, contentHeight + HANDLE_ROW_HEIGHT_PX + CONTENT_BOTTOM_PADDING_PX)
      : window.innerHeight * MAX_HEIGHT_FRACTION
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
