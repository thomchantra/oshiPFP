import { useCallback, useEffect, useRef, useState } from 'react'
import { Pipeline, type CropRect } from './pipeline'
import type { EnhanceParams, HslParams, LineArtParams } from '../types'

export function usePipeline() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)
  const [fileInfo, setFileInfo] = useState<{ name: string; type: string; size: number } | null>(null)

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
      setFileInfo({ name: file.name, type: file.type, size: file.size })
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

  const setEnhanceParams = useCallback((params: EnhanceParams) => {
    pipelineRef.current?.setEnhanceParams(params)
  }, [])

  const setLineArtParams = useCallback((params: LineArtParams) => {
    pipelineRef.current?.setLineArtParams(params)
  }, [])

  const setLineArtActive = useCallback((active: boolean) => {
    pipelineRef.current?.setLineArtActive(active)
  }, [])

  const readFinalPixels = useCallback(() => {
    return pipelineRef.current?.readFinalPixels() ?? null
  }, [])

  return {
    canvasRef,
    error,
    sourceSize,
    fileInfo,
    loadFile,
    setCropRect,
    setCurveLut,
    setHsl,
    setEnhanceParams,
    setLineArtParams,
    setLineArtActive,
    readFinalPixels,
  }
}
