import { useCallback, useEffect, useRef, useState } from 'react'
import { Pipeline, type CropRect } from './pipeline'
import type { ColorAdjustParams, EnhanceParams, ExportDisplayMode, GradeGradientMapParams, HslByBand, InvertParams, LightParams, LineArtDisplayMode, LineArtParams, ResizeParams } from '../types'

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

  // Unloads the source image and every downstream render target without a page reload; see
  // Pipeline.clearSource()'s own doc comment.
  const clearSource = useCallback(() => {
    pipelineRef.current?.clearSource()
    setSourceSize(null)
    setFileInfo(null)
    setCropSize(null)
    setError(null)
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

  const setGradeGradientMap = useCallback((gradeGradientMap: GradeGradientMapParams) => {
    pipelineRef.current?.setGradeGradientMap(gradeGradientMap)
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

  const setTabPreviewBypass = useCallback((bypass: 'none' | 'enhance' | 'lineArtComposite' | 'exportPreview' | 'lineArtOverlay') => {
    pipelineRef.current?.setTabPreviewBypass(bypass)
  }, [])

  const setExportPreviewParams = useCallback((mode: ExportDisplayMode, colorGrade: boolean, colorGradeIntensity: number) => {
    pipelineRef.current?.setExportPreviewParams(mode, colorGrade, colorGradeIntensity)
  }, [])

  const setDualPane = useCallback((enabled: boolean, modes: [LineArtDisplayMode, LineArtDisplayMode]) => {
    pipelineRef.current?.setDualPane(enabled, modes)
  }, [])

  const setGradeDualPane = useCallback((enabled: boolean) => {
    pipelineRef.current?.setGradeDualPane(enabled)
  }, [])

  const readFinalPixels = useCallback(() => {
    return pipelineRef.current?.readFinalPixels() ?? null
  }, [])

  const readExportPixels = useCallback((exportMode: ExportDisplayMode, colorGrade: boolean, colorGradeIntensity: number) => {
    return pipelineRef.current?.readExportPixels(exportMode, colorGrade, colorGradeIntensity) ?? null
  }, [])

  const sampleEnhancePixel = useCallback((u: number, v: number) => {
    return pipelineRef.current?.sampleEnhancePixel(u, v) ?? null
  }, [])

  const renderThumbnail = useCallback((params: LineArtParams, width: number, height: number) => {
    return pipelineRef.current?.renderThumbnail(params, width, height) ?? null
  }, [])

  const renderNoneThumbnail = useCallback((width: number, height: number) => {
    return pipelineRef.current?.renderNoneThumbnail(width, height) ?? null
  }, [])

  return {
    canvasRef,
    error,
    sourceSize,
    cropSize,
    fileInfo,
    loadFile,
    clearSource,
    setCropRect,
    setCurveLut,
    setHsl,
    setInvert,
    setLight,
    setColorAdjust,
    setGradeGradientMap,
    setEnhanceParams,
    setResizeParams,
    setLineArtParams,
    setLineArtActive,
    setPreviewMode,
    setTabPreviewBypass,
    setExportPreviewParams,
    setDualPane,
    setGradeDualPane,
    readFinalPixels,
    readExportPixels,
    sampleEnhancePixel,
    renderThumbnail,
    renderNoneThumbnail,
  }
}
