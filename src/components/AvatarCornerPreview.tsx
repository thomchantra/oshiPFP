import { useEffect, useRef, useState, type RefObject } from 'react'
import Icon from './Icon'

interface AvatarCornerPreviewProps {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  hasImage: boolean
  circle: boolean
  /** When Dual Pane is active, the mirrored source canvas is two panes side by side (see
   * pipeline.ts's dual-pane blit) — this preview must mirror only one, not the whole doubled
   * canvas, or it visibly shows a squished split view instead of a single PFP crop. */
  dualPaneActive: boolean
  /** Which half (0 = left, 1 = right) to mirror when dualPaneActive — App.tsx resolves this via
   * a composite > overlay > original priority so the corner preview always shows the most
   * "finished" of the two active panes. */
  dualPanePriorityIndex: 0 | 1
  /** Secret dev-mode entrance (v0.3 polish pass) — whether it's already unlocked (swaps the
   * smiley icon for nerd.svg) and the callback that unlocks it, fired once 7 taps land here
   * within a 2-second window while `!hasImage`. One-way: doesn't toggle back off via tapping,
   * only a reload (or App.tsx's own manual override flag) resets it. */
  devMode: boolean
  onUnlockDevMode: () => void
}

const SIZE = 60
const TAP_COUNT_REQUIRED = 7
const TAP_WINDOW_MS = 2000
const TOAST_DURATION_MS = 4000
const TOAST_MESSAGES = ['NERD!', 'Lucky Number 7!']

/**
 * Always-visible 60x60 PFP preview, top-right of the header. Mirrors the
 * live pipeline canvas via a cheap 2D drawImage (cover-fit) each frame
 * rather than a second WebGL render target — good enough for a live
 * approximation; revisit for pixel-exact export matching in the backend
 * sweep if "original crop" framing needs its own fill-width/fill-height
 * logic independent of the main crop rect (see plan notes).
 *
 * Deliberately follows the Original/Result A/B toggle (App.tsx's
 * previewMode) exactly like the main canvas does, rather than freezing on
 * "Result" — a prior round paused this mirror during 'original' preview on
 * the assumption this corner preview should always show the true final
 * result, but the user explicitly wants the toggle to drive this preview
 * too (useful for seeing how a before/after actually reads in the real PFP
 * frame's cover-fit crop, which differs from the main square viewport's).
 */
export default function AvatarCornerPreview({
  sourceCanvasRef,
  hasImage,
  circle,
  dualPaneActive,
  dualPanePriorityIndex,
  devMode,
  onUnlockDevMode,
}: AvatarCornerPreviewProps) {
  const previewRef = useRef<HTMLCanvasElement | null>(null)
  const tapTimestampsRef = useRef<number[]>([])
  const [toastText, setToastText] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleTap = () => {
    if (hasImage || devMode) return
    const now = Date.now()
    const recent = tapTimestampsRef.current.filter((t) => now - t < TAP_WINDOW_MS)
    recent.push(now)
    tapTimestampsRef.current = recent
    if (recent.length < TAP_COUNT_REQUIRED) return

    tapTimestampsRef.current = []
    onUnlockDevMode()
    setToastText(TOAST_MESSAGES[Math.floor(Math.random() * TOAST_MESSAGES.length)])
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastText(null), TOAST_DURATION_MS)
  }

  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }, [])

  useEffect(() => {
    if (!hasImage) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const backingSize = Math.round(SIZE * dpr)
    let raf = 0
    const draw = () => {
      const src = sourceCanvasRef.current
      const dst = previewRef.current
      if (src && dst && src.width > 0 && src.height > 0) {
        if (dst.width !== backingSize || dst.height !== backingSize) {
          dst.width = backingSize
          dst.height = backingSize
        }
        const ctx = dst.getContext('2d')
        if (ctx) {
          // Dual Pane's on-screen canvas is two equal-width panes side by side (pipeline.ts's
          // splitCanvasWidth) — treat only the priority half as the source image, not the whole
          // doubled canvas, or this preview shows a squished two-up split instead of one PFP.
          const paneWidth = dualPaneActive ? src.width / 2 : src.width
          const paneOffsetX = dualPaneActive ? dualPanePriorityIndex * paneWidth : 0
          const srcAspect = paneWidth / src.height
          let sw = paneWidth
          let sh = src.height
          let sx = paneOffsetX
          let sy = 0
          if (srcAspect > 1) {
            sw = src.height
            sx = paneOffsetX + (paneWidth - sw) / 2
          } else {
            sh = paneWidth
            sy = (src.height - sh) / 2
          }
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.clearRect(0, 0, backingSize, backingSize)
          ctx.drawImage(src, sx, sy, sw, sh, 0, 0, backingSize, backingSize)
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [hasImage, sourceCanvasRef, dualPaneActive, dualPanePriorityIndex])

  return (
    <div style={{ position: 'relative' }}>
      {/* Secret dev-mode toast (v0.3 polish pass) — white bubble, black bold text, left of the
          preview box. No hover/pointer cursor on the box below is intentional: a visible "this is
          clickable" affordance would defeat the point of a hidden entrance. */}
      {toastText && (
        <div className="avatar-corner-devmode-toast font-button-label">{toastText}</div>
      )}
      <div
        className="avatar-corner-preview"
        style={{ borderRadius: circle ? '50%' : 5, cursor: 'default' }}
        onClick={handleTap}
      >
        {hasImage ? (
          <canvas ref={previewRef} style={{ width: SIZE, height: SIZE, display: 'block' }} />
        ) : (
          <Icon name={devMode ? 'nerd' : 'smiley'} size={47} color="var(--accent-title)" />
        )}
      </div>
    </div>
  )
}
