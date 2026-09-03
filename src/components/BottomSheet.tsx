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
  /** Skips the drag handle and JS-driven height entirely, even on mobile — same fixed
   * content-height behavior the desktop branch below already uses. SimplifiedLineArtPanel uses
   * this so the filter carousel/edit sheet always sits pinned to its natural height, with no
   * resize handle to hide/disable separately. */
  noDrag?: boolean
  /** Rendered as a fixed-height sibling *below* the scrollable .bottom-sheet-content, not inside
   * it — SimplifiedLineArtPanel's edit-sheet Discard/name/Commit row uses this instead of
   * `position: sticky` inside the scroll area, which is unreliable in Safari when the sticky
   * element's containing block is itself a flex column (it can render mid-content instead of
   * pinned to the scrollport's true bottom edge). A real flex sibling has no such ambiguity: it
   * always gets exactly its own content height, and .bottom-sheet-content (flex: 1) fills
   * whatever's left and scrolls internally. */
  footer?: ReactNode
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
 * fraction, so a short panel (e.g. Crop's 2-slider Enhancement section)
 * never shows a dead-space gap below its last row — "all rows visible, no
 * more" is the hard ceiling.
 */
export default function BottomSheet({ children, maxHeightFraction = MAX_HEIGHT_FRACTION, noDrag = false, footer }: BottomSheetProps) {
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

  if (isDesktop || noDrag) {
    // Desktop: the footer (e.g. the filter edit-sheet's Discard/Commit row) pins to the TOP of the
    // panel instead of the bottom — it's a non-scrolling flex sibling either way, only the DOM
    // order differs. Mobile keeps it bottom-pinned (the drag-handle branch below).
    return (
      <div className="bottom-sheet bottom-sheet-desktop">
        {footer && <div className="bottom-sheet-footer bottom-sheet-footer-top">{footer}</div>}
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
      {footer && <div className="bottom-sheet-footer">{footer}</div>}
    </div>
  )
}
