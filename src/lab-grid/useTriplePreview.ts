import { useCallback, useRef, useState } from 'react'
import type { useLabPipeline } from '../lab/useLabPipeline'
import type { ViewMode } from '../lab/labPipeline'

export interface TriplePreviewUrls {
  original: string | null
  raw: string | null
  composited: string | null
}

const VIEW_MODES: ViewMode[] = ['original', 'raw', 'composited']

function captureCanvasBlob(canvas: HTMLCanvasElement | null): Promise<string | null> {
  return new Promise((resolve) => {
    if (!canvas) {
      resolve(null)
      return
    }
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png')
  })
}

/**
 * Captures all three of LabPipeline's view modes (original source /
 * algorithm's raw mask output / final composited-onto-source) as static
 * snapshots so they can be shown side by side — the single shared canvas
 * can only display one viewMode at a time, so this renders it three times
 * in a row (setViewMode -> synchronous render() -> toBlob) rather than
 * needing 3 live GL contexts.
 */
export function useTriplePreview(pipeline: ReturnType<typeof useLabPipeline>) {
  const [preview, setPreview] = useState<TriplePreviewUrls>({ original: null, raw: null, composited: null })
  const prevUrlsRef = useRef<TriplePreviewUrls>({ original: null, raw: null, composited: null })

  const refresh = useCallback(async () => {
    const next: TriplePreviewUrls = { original: null, raw: null, composited: null }
    for (const mode of VIEW_MODES) {
      // renderViewModeSync, not setViewMode+render — setViewMode's own
      // scheduleRender() leaves a stale rAF callback pending that can fire
      // between iterations (we're awaiting toBlob() below) and silently
      // repaint the canvas with a later mode's output before an earlier
      // capture actually reads pixels. See its doc comment.
      pipeline.renderViewModeSync(mode)
      next[mode] = await captureCanvasBlob(pipeline.canvasRef.current)
    }
    Object.values(prevUrlsRef.current).forEach((u) => u && URL.revokeObjectURL(u))
    prevUrlsRef.current = next
    setPreview(next)
    // Leave the pipeline on 'composited' — the meaningful default if
    // anything else reads the live canvas directly.
    pipeline.renderViewModeSync('composited')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline])

  return { preview, refresh }
}
