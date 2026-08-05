/**
 * imagetracerjs (v1.2.6, npm) ships no types. Shape confirmed by reading
 * node_modules/imagetracerjs/imagetracer_v1.2.6.js directly (imagedataToTracedata,
 * svgpathstring) — only the subset Path E actually uses is declared here.
 */
declare module 'imagetracerjs' {
  export interface TraceSegment {
    type: 'L' | 'Q'
    x1: number
    y1: number
    x2: number
    y2: number
    x3?: number
    y3?: number
  }

  export interface TracePath {
    segments: TraceSegment[]
    holechildren: number[]
    isholepath: boolean
  }

  export interface TracePaletteColor {
    r: number
    g: number
    b: number
    a: number
  }

  export interface TraceData {
    layers: TracePath[][]
    palette: TracePaletteColor[]
    width: number
    height: number
  }

  export interface TraceOptions {
    pathomit?: number
    ltres?: number
    qtres?: number
    numberofcolors?: number
    colorsampling?: number
    pal?: TracePaletteColor[]
    rightangleenhance?: boolean
  }

  const ImageTracer: {
    imagedataToTracedata(imageData: ImageData, options?: TraceOptions): TraceData
  }
  export default ImageTracer
}
