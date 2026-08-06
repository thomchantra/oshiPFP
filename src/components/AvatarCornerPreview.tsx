import { useEffect, useRef, type RefObject } from 'react'
import Icon from './Icon'

interface AvatarCornerPreviewProps {
  sourceCanvasRef: RefObject<HTMLCanvasElement | null>
  hasImage: boolean
  circle: boolean
}

const SIZE = 60

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
export default function AvatarCornerPreview({ sourceCanvasRef, hasImage, circle }: AvatarCornerPreviewProps) {
  const previewRef = useRef<HTMLCanvasElement | null>(null)

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
          const srcAspect = src.width / src.height
          let sw = src.width
          let sh = src.height
          let sx = 0
          let sy = 0
          if (srcAspect > 1) {
            sw = src.height
            sx = (src.width - sw) / 2
          } else {
            sh = src.width
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
  }, [hasImage, sourceCanvasRef])

  return (
    <div className="avatar-corner-preview" style={{ borderRadius: circle ? '50%' : 5 }}>
      {hasImage ? (
        <canvas ref={previewRef} style={{ width: SIZE, height: SIZE, display: 'block' }} />
      ) : (
        <Icon name="smiley" size={47} color="var(--accent-title)" />
      )}
    </div>
  )
}
