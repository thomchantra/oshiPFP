import ImageTracer from 'imagetracerjs'
import { inflatePathsD, JoinType, EndType, type PathD, type PathsD } from 'clipper2-ts'

/**
 * Line-art expansion Path E: vectorize -> offset path -> rasterize. Only
 * this module owns the CPU/vector-geometry side (tracing, flattening,
 * offsetting, rasterizing); labPipeline.ts's runPathE() just does the GL
 * readback in and the texture upload out, so this stays framework-free
 * and testable on its own.
 *
 * Not live-reactive to slider drags like every other path (see
 * labPipeline.ts's runPathE doc comment) — tracing + offsetting a real
 * image is multi-second CPU work, triggered by an explicit "Trace" button.
 */

const BLACK = { r: 0, g: 0, b: 0, a: 255 }
const WHITE = { r: 255, g: 255, b: 255, a: 255 }

/**
 * Flattens a traced path's segments (imagetracerjs emits 'L' line and 'Q'
 * quadratic-bezier segments) into a plain point list. Quadratic segments
 * are subdivided into straight sub-segments — Path E's first pass doesn't
 * need bezier-aware offsetting, and Clipper2 only operates on polygons
 * anyway, so flattening once here is simpler than threading curve data
 * through the offset step.
 */
function flattenPath(path: import('imagetracerjs').TracePath): PathD {
  const points: PathD = []
  const first = path.segments[0]
  if (!first) return points
  points.push({ x: first.x1, y: first.y1 })

  let prevX = first.x1
  let prevY = first.y1
  for (const seg of path.segments) {
    if (seg.type === 'Q' && seg.x3 !== undefined && seg.y3 !== undefined) {
      const STEPS = 6
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS
        const mt = 1 - t
        const x = mt * mt * prevX + 2 * mt * t * seg.x2 + t * t * seg.x3
        const y = mt * mt * prevY + 2 * mt * t * seg.y2 + t * t * seg.y3
        points.push({ x, y })
      }
      prevX = seg.x3
      prevY = seg.y3
    } else {
      points.push({ x: seg.x2, y: seg.y2 })
      prevX = seg.x2
      prevY = seg.y2
    }
  }
  return points
}

export interface PathEResult {
  canvas: HTMLCanvasElement
  contourCount: number
}

/**
 * mask: binary threshold ImageData (0=line/black, 255=fill/white — same
 * convention as threshold.frag.ts, just read back to the CPU). radiusPx:
 * offset distance in source pixels, matching Path B's "radius (px)"
 * convention (the offset step operates directly in the mask's native
 * pixel space, no texel/UV normalization involved).
 */
export function runPathEVectorize(mask: ImageData, radiusPx: number): PathEResult {
  const tracedata = ImageTracer.imagedataToTracedata(mask, {
    pal: [BLACK, WHITE],
    numberofcolors: 2,
    pathomit: 0,
  })

  const blackLayerIndex = tracedata.palette.findIndex((c) => c.r < 128)
  const layer = blackLayerIndex >= 0 ? tracedata.layers[blackLayerIndex] : []

  // Both outer and hole contours are included in one combined offset call —
  // Clipper2's offset determines solid-vs-hole from each path's winding
  // direction and offsets/unions them together correctly as a group, which
  // is also what makes adjacent strokes merge cleanly instead of needing a
  // separate union pass. Hole paths need their point order reversed first:
  // imagetracerjs's own SVG renderer (svgpathstring in the source) walks a
  // hole's segments in reverse specifically to invert its winding relative
  // to its parent outer path — skipping that (as an earlier version of this
  // function did) makes Clipper2 read every contour as "outer," and an
  // offset that round-joins a hole's boundary the same direction as the
  // solid it's cut from erases the hole entirely, confirmed on a real
  // ring/donut test image (see the saga changelog for the empirical check).
  const paths: PathsD = layer
    .map((path) => {
      const points = flattenPath(path)
      return path.isholepath ? points.reverse() : points
    })
    .filter((p) => p.length >= 3)

  const offsetPaths =
    radiusPx > 0 && paths.length > 0 ? inflatePathsD(paths, radiusPx, JoinType.Round, EndType.Polygon) : paths

  const canvas = document.createElement('canvas')
  canvas.width = tracedata.width
  canvas.height = tracedata.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const path2d = new Path2D()
  for (const p of offsetPaths) {
    if (p.length === 0) continue
    path2d.moveTo(p[0].x, p[0].y)
    for (let i = 1; i < p.length; i++) path2d.lineTo(p[i].x, p[i].y)
    path2d.closePath()
  }
  ctx.fillStyle = '#000000'
  ctx.fill(path2d, 'evenodd')

  return { canvas, contourCount: offsetPaths.length }
}
