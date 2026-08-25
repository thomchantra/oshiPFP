/**
 * Pure, GPU-free image statistics for auto-detecting a starting threshold value per uploaded
 * photo — the v0.5 "Instagram mode" auto-detection work (see
 * changelog/oshipfp-v0.5-instagram-mode-saga.md). Operates on plain RGBA pixel buffers (whatever
 * a canvas/WebGL readback hands back), so it has no dependency on any lab or production pipeline
 * — a lab harness and, eventually, the real upload flow can both call these same functions
 * without risking the kind of lab/production drift that caused the pathA/pathB Botan bug.
 *
 * Luminance uses the same BT.709 weights as threshold.frag.ts/plateauRamp.frag.ts
 * (0.2126/0.7152/0.0722) so a histogram bin index maps 1:1 onto the same [0,255] scale those
 * shaders compare against (divide by 255 to get the [0,1] range Botan's `threshold` param uses).
 */

export interface LuminanceHistogram {
  /** 256 bins, index = luminance 0-255, value = pixel count. */
  bins: number[]
  totalPixels: number
}

export function computeLuminanceHistogram(data: Uint8ClampedArray | Uint8Array): LuminanceHistogram {
  const bins = new Array(256).fill(0)
  let totalPixels = 0
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    bins[Math.min(255, Math.max(0, Math.round(luminance)))]++
    totalPixels++
  }
  return { bins, totalPixels }
}

/**
 * Standard Otsu's method: the threshold (0-255) that maximizes between-class variance of the
 * two populations it splits the histogram into. Included alongside valley-emphasis (below) as a
 * baseline for comparison — Otsu alone is known to overshoot into a "shade" band on exactly the
 * kind of image this tool targets (small minority ink-line class against a much larger
 * background+shading class), which is why valley-emphasis is the one actually meant to drive an
 * auto-detected threshold. See docs/0.5-lab-throwaway.md and the session 6 changelog entry for
 * the reasoning.
 */
export function otsuThreshold(histogram: LuminanceHistogram): number {
  const { bins, totalPixels } = histogram
  if (totalPixels === 0) return 128

  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * bins[t]

  let sumBackground = 0
  let weightBackground = 0
  let bestVariance = -1
  let bestThreshold = 128

  for (let t = 0; t < 256; t++) {
    weightBackground += bins[t]
    if (weightBackground === 0) continue
    const weightForeground = totalPixels - weightBackground
    if (weightForeground === 0) break

    sumBackground += t * bins[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sumAll - sumBackground) / weightForeground

    const betweenVariance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    if (betweenVariance > bestVariance) {
      bestVariance = betweenVariance
      bestThreshold = t
    }
  }
  return bestThreshold
}

/**
 * Valley-emphasis thresholding (Ng, "Automatic thresholding for defect detection", 2006) — same
 * between-class-variance objective as Otsu, but weighted by (1 - p(t)) so it actively prefers a
 * threshold sitting in a low-population region of the histogram (a true valley between two
 * modes) instead of just wherever variance is maximized. This is the direct analogue of "drag
 * the Photoshop Threshold slider to just before the shade areas start getting picked up" — the
 * valley IS that point, and this is the standard, named algorithm for finding it automatically
 * instead of by eye. Matches multi-modal/spiky histograms (flat cel-shaded art, not smooth
 * photographic gradients) better than plain Otsu specifically because those spikes create
 * several local variance-maximizing candidates, and only the population weighting reliably picks
 * the one that's actually a valley rather than a spike's own edge.
 */
export function valleyEmphasisThreshold(histogram: LuminanceHistogram): number {
  const { bins, totalPixels } = histogram
  if (totalPixels === 0) return 128

  let sumAll = 0
  for (let t = 0; t < 256; t++) sumAll += t * bins[t]

  let sumBackground = 0
  let weightBackground = 0
  let bestScore = -Infinity
  let bestThreshold = 128

  for (let t = 0; t < 256; t++) {
    weightBackground += bins[t]
    if (weightBackground === 0) continue
    const weightForeground = totalPixels - weightBackground
    if (weightForeground === 0) break

    sumBackground += t * bins[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sumAll - sumBackground) / weightForeground

    const betweenVariance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    const populationAtT = bins[t] / totalPixels
    const score = (1 - populationAtT) * betweenVariance
    if (score > bestScore) {
      bestScore = score
      bestThreshold = t
    }
  }
  return bestThreshold
}

export interface ConnectedComponentStats {
  componentCount: number
  /** Fraction of all "ink" pixels belonging to the single largest component — high (close to 1)
   * means the ink mostly collapses into one connected shape (already-linework regime); low means
   * it's fragmented into many small pieces (blobby/grainy, painted-shading regime). This is the
   * direct measurement of the "connected lines vs. grainy blob" heuristic. */
  largestComponentFraction: number
  meanComponentSize: number
  totalInkPixels: number
}

/**
 * Flood-fills (8-connectivity, iterative stack — not recursive, to avoid call-stack limits on a
 * large connected region) the binary mask "luminance < thresholdBin" and reports component-size
 * statistics. `data`/`width`/`height` should already be downsampled by the caller before calling
 * this (connected-component analysis is O(pixels); this function does no resizing itself, kept
 * as a pure, resolution-agnostic operation — see downsampleForAnalysis below for the intended
 * caller-side prep step).
 */
export function connectedComponentStats(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  thresholdBin: number,
): ConnectedComponentStats {
  const size = width * height
  const isInk = new Uint8Array(size)
  let totalInkPixels = 0
  for (let p = 0; p < size; p++) {
    const i = p * 4
    const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (luminance < thresholdBin) {
      isInk[p] = 1
      totalInkPixels++
    }
  }

  const visited = new Uint8Array(size)
  const stack: number[] = []
  let componentCount = 0
  let largestSize = 0
  let totalComponentSize = 0

  for (let start = 0; start < size; start++) {
    if (!isInk[start] || visited[start]) continue
    componentCount++
    let componentSize = 0
    stack.push(start)
    visited[start] = 1
    while (stack.length > 0) {
      const p = stack.pop()!
      componentSize++
      const x = p % width
      const y = (p - x) / width
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const np = ny * width + nx
          if (isInk[np] && !visited[np]) {
            visited[np] = 1
            stack.push(np)
          }
        }
      }
    }
    totalComponentSize += componentSize
    if (componentSize > largestSize) largestSize = componentSize
  }

  return {
    componentCount,
    largestComponentFraction: totalInkPixels > 0 ? largestSize / totalInkPixels : 0,
    meanComponentSize: componentCount > 0 ? totalComponentSize / componentCount : 0,
    totalInkPixels,
  }
}

/**
 * Nearest-neighbor downsample to cap connected-component analysis cost — component analysis is
 * O(pixels), so a native-resolution photo (multi-megapixel) would be needlessly slow for a
 * diagnostic tool. No smoothing/averaging on purpose: this feeds a binary threshold comparison,
 * and blurring first would soften exactly the fine linework detail the stat is trying to
 * measure.
 */
export function downsampleForAnalysis(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxDimension: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  if (scale === 1) return { data, width, height }
  const outWidth = Math.max(1, Math.round(width * scale))
  const outHeight = Math.max(1, Math.round(height * scale))
  const out = new Uint8ClampedArray(outWidth * outHeight * 4)
  for (let oy = 0; oy < outHeight; oy++) {
    const sy = Math.min(height - 1, Math.floor(oy / scale))
    for (let ox = 0; ox < outWidth; ox++) {
      const sx = Math.min(width - 1, Math.floor(ox / scale))
      const srcIdx = (sy * width + sx) * 4
      const dstIdx = (oy * outWidth + ox) * 4
      out[dstIdx] = data[srcIdx]
      out[dstIdx + 1] = data[srcIdx + 1]
      out[dstIdx + 2] = data[srcIdx + 2]
      out[dstIdx + 3] = data[srcIdx + 3]
    }
  }
  return { data: out, width: outWidth, height: outHeight }
}
