import { useCallback, useState } from 'react'
import type { LabParams } from '../lab/labPipeline'
import type { useLabPipeline } from '../lab/useLabPipeline'
import { DEFAULT_LAB_PARAMS, toLabMode } from './labGridTypes'
import type { AlgoId, Intensity } from './labGridTypes'
import { scaleParams } from './intensityScaling'
import { fetchTestImageFile } from './testImages'
import type { TestImage } from './testImages'
import type { Baselines } from './labGridStorage'

export interface GridCell {
  algo: AlgoId
  intensity: Intensity
  url: string
}

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
 * Drives the batch grid render: for one test image, sequentially renders
 * every (algo, intensity) combination on the single shared LabPipeline
 * canvas and captures each as a static PNG blob URL — avoids needing
 * multiple live WebGL contexts (browsers cap concurrent contexts well
 * below a 7-algo x 4-intensity grid's 28 cells).
 */
export function useBatchRender(pipeline: ReturnType<typeof useLabPipeline>) {
  const [cells, setCells] = useState<GridCell[]>([])
  const [isRendering, setIsRendering] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const renderGrid = useCallback(
    async (image: TestImage, algos: AlgoId[], intensities: readonly Intensity[], baselines: Baselines) => {
      setIsRendering(true)
      const total = algos.length * intensities.length
      setProgress({ done: 0, total })

      setCells((prev) => {
        prev.forEach((c) => URL.revokeObjectURL(c.url))
        return []
      })

      const file = await fetchTestImageFile(image)
      await pipeline.loadFile(file)

      const next: GridCell[] = []
      let done = 0
      for (const algo of algos) {
        const baseline = baselines[image.id]?.[algo] ?? {}
        for (const intensity of intensities) {
          const scaled = scaleParams(algo, baseline, intensity)
          const fullParams: LabParams = { ...DEFAULT_LAB_PARAMS, ...baseline, ...scaled }

          // setModeParamsSync, not setMode+setParams+render — the plain
          // combo leaves a stray scheduled render pending (from setMode/
          // setParams's own scheduleRender) that can fire during this
          // iteration's toBlob() await below and repaint the canvas with a
          // later cell's state before this cell's capture actually reads
          // pixels. See LabPipeline.setModeParamsSync's doc comment.
          pipeline.setModeParamsSync(toLabMode(algo), fullParams)

          const url = await captureCanvasBlob(pipeline.canvasRef.current)
          if (url) next.push({ algo, intensity, url })
          done += 1
          setProgress({ done, total })
        }
      }
      setCells(next)
      setIsRendering(false)
    },
    [pipeline],
  )

  return { cells, isRendering, progress, renderGrid }
}
