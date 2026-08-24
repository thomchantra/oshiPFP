import { useCallback, useState } from 'react'
import type { LabParams } from '../lab/labPipeline'
import type { useLabPipeline } from '../lab/useLabPipeline'
import { DEFAULT_LAB_PARAMS, VALUE_GRID_SIZE, primaryKnobSweeps, toLabMode } from './labGridTypes'
import type { AlgoId, NumericLabParamKey } from './labGridTypes'
import { captureCanvasBlob } from './useBatchRender'
import { fetchTestImageFile } from './testImages'
import type { TestImage } from './testImages'

export interface ValueGridCell {
  algo: AlgoId
  stepIndex: number
  values: Partial<Record<NumericLabParamKey, number>>
  url: string
}

/**
 * Drives the absolute-value grid: for one test image, sweeps each checked
 * algorithm's primary knob(s) (PRIMARY_KNOB_FIELDS, usually one field, a
 * couple of algos co-vary two) across VALUE_GRID_SIZE fixed values spanning
 * their working range, with every other field held at DEFAULT_LAB_PARAMS —
 * deliberately not the per-image manual baseline, so this isolates the
 * primary knob(s)' own response to image content instead of conflating it
 * with already-hand-tuned secondary knobs. Mirrors useBatchRender's
 * sequential-render-on-one-canvas approach for the same WebGL-context-count
 * reason.
 */
export function useValueGridRender(pipeline: ReturnType<typeof useLabPipeline>) {
  const [cells, setCells] = useState<ValueGridCell[]>([])
  const [isRendering, setIsRendering] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const renderGrid = useCallback(
    async (image: TestImage, algos: AlgoId[]) => {
      setIsRendering(true)
      const total = algos.length * VALUE_GRID_SIZE
      setProgress({ done: 0, total })

      setCells((prev) => {
        prev.forEach((c) => URL.revokeObjectURL(c.url))
        return []
      })

      const file = await fetchTestImageFile(image)
      await pipeline.loadFile(file)

      const next: ValueGridCell[] = []
      let done = 0
      for (const algo of algos) {
        const sweeps = primaryKnobSweeps(algo)
        for (let stepIndex = 0; stepIndex < VALUE_GRID_SIZE; stepIndex++) {
          const values: Partial<Record<NumericLabParamKey, number>> = {}
          for (const sweep of sweeps) values[sweep.field] = sweep.values[stepIndex]

          const fullParams: LabParams = {
            ...DEFAULT_LAB_PARAMS,
            ...values,
            // Hinata/Tsukiko's raw output is a neutral-gray-centered diff
            // (see toneRemap.frag.ts) — DEFAULT_LAB_PARAMS's hiToneTarget
            // 'off' leaves it unresolved, so at the default Multiply blend
            // mode a near-0.5 gray is nearly a no-op and the sweep barely
            // shows any visible change step to step. Force it toned here so
            // the grid is actually legible; the baseline-tuning pane still
            // lets tone target be set/changed independently per image.
            ...((algo === 'pathH' || algo === 'pathI') ? { hiToneTarget: 'multiply' as const } : {}),
            // Gumi's ramp floor/inner-low are pinned to 0, not swept — see
            // PRIMARY_KNOB_FIELDS.pathG's doc comment.
            ...(algo === 'pathG' ? { rampFloor: 0, rampInnerLow: 0 } : {}),
          }

          // setModeParamsSync — see useBatchRender.ts's identical comment on
          // why the plain setMode+setParams+render combo races with
          // toBlob() captures mid-loop.
          pipeline.setModeParamsSync(toLabMode(algo), fullParams)

          const url = await captureCanvasBlob(pipeline.canvasRef.current)
          if (url) next.push({ algo, stepIndex, values, url })
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
