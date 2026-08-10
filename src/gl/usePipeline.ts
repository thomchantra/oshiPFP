import { useCallback, useEffect, useRef, useState } from 'react'
import { Pipeline, type CropRect } from './pipeline'
import type { ColorAdjustParams, EnhanceParams, HslByBand, InvertParams, LightParams, LineArtDisplayMode, LineArtParams, ResizeParams } from '../types'

export function usePipeline() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)
  const [fileInfo, setFileInfo] = useState<{ name: string; type: string; size: number } | null>(null)
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    try {
      pipelineRef.current = new Pipeline(canvasRef.current)
      pipelineRef.current.setCropSizeListener(setCropSize)
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

  const setHsl = useCallback((hslByBand: HslByBand) => {
    pipelineRef.current?.setHsl(hslByBand)
  }, [])

  const setInvert = useCallback((invert: InvertParams) => {
    pipelineRef.current?.setInvert(invert)
  }, [])

  const setLight = useCallback((light: LightParams) => {
    pipelineRef.current?.setLight(light)
  }, [])

  const setColorAdjust = useCallback((colorAdjust: ColorAdjustParams) => {
    pipelineRef.current?.setColorAdjust(colorAdjust)
  }, [])

  const setEnhanceParams = useCallback((params: EnhanceParams) => {
    pipelineRef.current?.setEnhanceParams(params)
  }, [])

  const setResizeParams = useCallback((params: ResizeParams) => {
    pipelineRef.current?.setResizeParams(params)
  }, [])

  const setLineArtParams = useCallback((params: LineArtParams) => {
    pipelineRef.current?.setLineArtParams(params)
  }, [])

  const setLineArtActive = useCallback((active: boolean) => {
    pipelineRef.current?.setLineArtActive(active)
  }, [])

  const setPreviewMode = useCallback((mode: 'original' | 'result') => {
    pipelineRef.current?.setPreviewMode(mode)
  }, [])

  const setDualPane = useCallback((enabled: boolean, modes: [LineArtDisplayMode, LineArtDisplayMode]) => {
    pipelineRef.current?.setDualPane(enabled, modes)
  }, [])

  const readFinalPixels = useCallback(() => {
    return pipelineRef.current?.readFinalPixels() ?? null
  }, [])

  return {
    canvasRef,
    error,
    sourceSize,
    cropSize,
    fileInfo,
    loadFile,
    setCropRect,
    setCurveLut,
    setHsl,
    setInvert,
    setLight,
    setColorAdjust,
    setEnhanceParams,
    setResizeParams,
    setLineArtParams,
    setLineArtActive,
    setPreviewMode,
    setDualPane,
    readFinalPixels,
  }
}
