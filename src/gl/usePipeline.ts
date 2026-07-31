import { useCallback, useEffect, useRef, useState } from 'react'
import { Pipeline, type CropRect } from './pipeline'
import type { HslParams, MaximizerParams } from '../types'

export function usePipeline() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    try {
      pipelineRef.current = new Pipeline(canvasRef.current)
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

  const setCropRect = useCallback((rect: CropRect) => {
    pipelineRef.current?.setCropRect(rect)
  }, [])

  const setCurveLut = useCallback((lut: Uint8Array) => {
    pipelineRef.current?.setCurveLut(lut)
  }, [])

  const setHsl = useCallback((hsl: HslParams) => {
    pipelineRef.current?.setHsl(hsl)
  }, [])

  const setMaximizerParams = useCallback((params: MaximizerParams) => {
    pipelineRef.current?.setMaximizerParams(params)
  }, [])

  const readFinalPixels = useCallback(() => {
    return pipelineRef.current?.readFinalPixels() ?? null
  }, [])

  return {
    canvasRef,
    error,
    sourceSize,
    loadFile,
    setCropRect,
    setCurveLut,
    setHsl,
    setMaximizerParams,
    readFinalPixels,
  }
}
