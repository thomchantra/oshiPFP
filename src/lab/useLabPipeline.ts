import { useCallback, useEffect, useRef, useState } from 'react'
import { LabPipeline, type LabMode, type LabParams, type ViewMode } from './labPipeline'

export function useLabPipeline() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pipelineRef = useRef<LabPipeline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    try {
      pipelineRef.current = new LabPipeline(canvasRef.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    return () => {
      pipelineRef.current?.destroy()
      pipelineRef.current = null
    }
  }, [])

  const loadFile = useCallback(async (file: File) => {
    if (!pipelineRef.current) return
    try {
      const size = await pipelineRef.current.loadFile(file)
      setSourceSize(size)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const setMode = useCallback((mode: LabMode) => {
    pipelineRef.current?.setMode(mode)
  }, [])

  const setParams = useCallback((params: LabParams) => {
    pipelineRef.current?.setParams(params)
  }, [])

  const setViewMode = useCallback((viewMode: ViewMode) => {
    pipelineRef.current?.setViewMode(viewMode)
  }, [])

  const setSplitMode = useCallback((splitMode: boolean) => {
    pipelineRef.current?.setSplitMode(splitMode)
  }, [])

  const pickPixel = useCallback((nativeX: number, nativeY: number) => {
    return pipelineRef.current?.pickPixel(nativeX, nativeY) ?? null
  }, [])

  const runPathE = useCallback(async (radius: number, threshold: number) => {
    if (!pipelineRef.current) return null
    try {
      const result = await pipelineRef.current.runPathE(radius, threshold)
      setError(null)
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    }
  }, [])

  // Direct, synchronous render — bypasses scheduleRender's rAF debounce.
  // Needed by callers (e.g. the grid batch-render loop) that must capture
  // the canvas immediately after a param change, not on the next frame.
  const render = useCallback(() => {
    pipelineRef.current?.render()
  }, [])

  // See LabPipeline.renderViewModeSync/setModeParamsSync's doc comments —
  // the plain setX()+render() combo still leaves a stale scheduled rAF
  // render pending that can fire between multiple back-to-back captures
  // (each with an await gap for toBlob) and clobber an earlier one.
  const renderViewModeSync = useCallback((viewMode: ViewMode) => {
    pipelineRef.current?.renderViewModeSync(viewMode)
  }, [])

  const setModeParamsSync = useCallback((mode: LabMode, params: LabParams) => {
    pipelineRef.current?.setModeParamsSync(mode, params)
  }, [])

  return {
    canvasRef,
    error,
    sourceSize,
    loadFile,
    setMode,
    setParams,
    setViewMode,
    setSplitMode,
    pickPixel,
    runPathE,
    render,
    renderViewModeSync,
    setModeParamsSync,
  }
}
