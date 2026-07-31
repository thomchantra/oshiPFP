export type PipelineStage = 'crop' | 'color' | 'maximizer'

export interface CropTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export interface CurvePoint {
  x: number
  y: number
}

export interface HslParams {
  hue: number
  saturation: number
  lightness: number
}

export type BlendMode = 'normal' | 'multiply' | 'screen'

export interface MaximizerParams {
  threshold: number
  growRadius: number
  layerCount: number
  layerOpacity: number
  blendMode: BlendMode
}

export type ResampleMode = 'lanczos3' | 'bilinear' | 'nearest'

export interface ExportParams {
  targetSize: number
  resampleMode: ResampleMode
}

export interface TabDef {
  id: string
  label: string
}
