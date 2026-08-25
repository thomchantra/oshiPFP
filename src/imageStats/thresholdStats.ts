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
 *
 * `LuminanceHistogram` and the threshold-finding functions below (otsuThreshold,
 * valleyEmphasisThreshold, peakBasedThreshold) only ever look at a 256-bin count array — nothing
 * in them is actually luminance-specific. computeEdgeStrengthHistogram (Chie/pathC's own detection
 * feature, a fundamentally different domain from Botan/Daiya's raw luminance — see
 * changelog/oshipfp-v0.5-instagram-mode-saga.md session 6) reuses the exact same shape and the
 * exact same three finder functions, just fed a different scalar per pixel.
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

export interface PeakThresholdResult {
  threshold255: number
  /** Merged peak bin positions actually used to derive threshold255 — kept for diagnostics/UI
   * display, not required by callers that just want the number. */
  peaks: number[]
  /** 'high' when two real peaks were found and threshold255 is the valley between them (the
   * intended case for this art style's spiky, multi-modal histograms); 'low' when fewer than two
   * peaks passed the prominence filter and threshold255 falls back to a less-motivated guess
   * (single peak's own position, or Otsu as a last resort) — a caller/UI can use this to flag
   * lower-confidence guesses rather than presenting every guess with equal certainty. */
  confidence: 'high' | 'low'
}

function smoothHistogram(bins: number[], windowRadius: number): number[] {
  const out = new Array(bins.length).fill(0)
  for (let i = 0; i < bins.length; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - windowRadius); j <= Math.min(bins.length - 1, i + windowRadius); j++) {
      sum += bins[j]
      count++
    }
    out[i] = sum / count
  }
  return out
}

function findLocalMaxima(smoothed: number[], minCount: number): number[] {
  const peaks: number[] = []
  for (let i = 1; i < smoothed.length - 1; i++) {
    if (smoothed[i] > smoothed[i - 1] && smoothed[i] >= smoothed[i + 1] && smoothed[i] > minCount) {
      peaks.push(i)
    }
  }
  return peaks
}

/** Collapses peaks sitting within `minSeparation` bins of each other into one (keeping whichever
 * has the higher smoothed count) — a spiky cel-shaded-art histogram can have 12-16 raw local
 * maxima, many of them noise rather than genuinely distinct color/shade clusters. Calibrated
 * against the session-6 20-image ground-truth set: didn't measurably change accuracy at the
 * separations tested (0-20 bins), but did cut the average candidate-peak count roughly in half at
 * minSeparation=8 without hurting it — kept for that noise reduction, not a proven accuracy win. */
function mergeClosePeaks(peaks: number[], smoothed: number[], minSeparation: number): number[] {
  if (peaks.length === 0) return []
  const sorted = [...peaks].sort((a, b) => a - b)
  const merged: number[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    if (sorted[i] - last < minSeparation) {
      if (smoothed[sorted[i]] > smoothed[last]) merged[merged.length - 1] = sorted[i]
    } else {
      merged.push(sorted[i])
    }
  }
  return merged
}

function localMinimumIndex(smoothed: number[], a: number, b: number): number {
  let minIdx = a
  let minVal = smoothed[a]
  for (let i = a; i <= b; i++) {
    if (smoothed[i] < minVal) {
      minVal = smoothed[i]
      minIdx = i
    }
  }
  return minIdx
}

/**
 * Peak-based threshold candidate for Botan/Daiya — an alternative to Otsu/valley-emphasis
 * motivated by this art style's histograms being spiky/multi-modal (flat cel-shaded color bands)
 * rather than smoothly bimodal: instead of hunting for a valley across the *whole* histogram
 * (which on a real illustration finds the split between background and midtones, not ink vs.
 * everything else), this finds the two darkest genuine peaks (smoothed local maxima with real
 * pixel count behind them, close peaks merged) and returns the valley *between just those two* —
 * the local structure right around the ink cluster, not the dominant global split. Biased toward
 * *not* undershooting (missing ink → broken/disconnected linework, worse than picking up a bit of
 * extra shading) — see changelog/oshipfp-v0.5-instagram-mode-saga.md session 6 for the calibration
 * data this was validated against.
 */
export function peakBasedThreshold(histogram: LuminanceHistogram): PeakThresholdResult {
  const { bins, totalPixels } = histogram
  const smoothed = smoothHistogram(bins, 4)
  const minCount = totalPixels * 0.002
  const rawPeaks = findLocalMaxima(smoothed, minCount)
  const peaks = mergeClosePeaks(rawPeaks, smoothed, 8)

  if (peaks.length >= 2) {
    const threshold255 = localMinimumIndex(smoothed, peaks[0], peaks[1])
    return { threshold255, peaks, confidence: 'high' }
  }
  if (peaks.length === 1) {
    return { threshold255: peaks[0], peaks, confidence: 'low' }
  }
  return { threshold255: otsuThreshold(histogram), peaks: [], confidence: 'low' }
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

export interface SweepPoint {
  threshold255: number
  largestComponentFraction: number
  componentCount: number
  /** totalInkPixels / (width*height) — fraction of the analyzed image classified as ink at this
   * threshold. A density-based signal, independent of connectivity. */
  inkPixelRatio: number
}

/**
 * Runs connectedComponentStats at every threshold in `thresholds255` and returns the curve —
 * the primitive an adaptive/walking threshold search is built on (see
 * changelog/oshipfp-v0.5-instagram-mode-saga.md session 6: single-shot Otsu/valley-emphasis was
 * found to systematically overshoot Botan's real threshold by 2-7x, but largestComponentFraction
 * at the guessed threshold correlated with how wrong the guess was — this sweep is what lets a
 * search walk the threshold down and watch that signal change, instead of computing it once).
 * `data`/`width`/`height` should already be downsampled by the caller (same reasoning as
 * connectedComponentStats itself) — this function does no resizing.
 */
export function connectedComponentSweep(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  thresholds255: number[],
): SweepPoint[] {
  const totalPixels = width * height
  return thresholds255.map((threshold255) => {
    const stats = connectedComponentStats(data, width, height, threshold255)
    return {
      threshold255,
      largestComponentFraction: stats.largestComponentFraction,
      componentCount: stats.componentCount,
      inkPixelRatio: stats.totalInkPixels / totalPixels,
    }
  })
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

/**
 * Chie (pathC)'s own detection feature — not raw luminance at all. Chie's real gate decision
 * (erosionGate.frag.ts) compares `edgeStrength = origLuminance - erodedLuminance` (how much a
 * per-channel box-min erosion darkened this pixel) against `gateThreshold`: flat/shaded regions
 * barely change under erosion (edgeStrength near 0), real ink strokes darken sharply. Returns a
 * 256-bin histogram of edgeStrength (0-255, same shape as computeLuminanceHistogram) so the same
 * otsuThreshold/valleyEmphasisThreshold/peakBasedThreshold finder functions can be tried against
 * this domain too — not yet validated which (if any) predicts a good gateThreshold; this is the
 * data-gathering step before that calibration, same pattern as the Botan/Daiya work.
 *
 * Simulates erosionRgb.frag.ts's separable per-channel box-min at *full* resolution rather than
 * downsampling first — radius is a small absolute-pixel value (that shader's own doc comment:
 * "sane range ~0-3 texels for line art"), so full-res erosion stays cheap, and downsampling first
 * would break the radius<->pixel relationship this feature depends on (see CLAUDE.md's Simplified
 * Mode Filter checklist on why detection radii must run at native resolution). Approximates the
 * shader's 32-substep float-radius sampling with a plain integer box window — a close match at
 * these small radii, not a bit-exact replica.
 */
export function computeEdgeStrengthHistogram(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  radiusTexels: number,
): LuminanceHistogram {
  const totalPixels = width * height
  const r = Math.max(0, Math.round(radiusTexels))

  if (r === 0) {
    // Erosion is identity at radius 0 -> edgeStrength is exactly 0 everywhere.
    const bins = new Array(256).fill(0)
    bins[0] = totalPixels
    return { bins, totalPixels }
  }

  const erodedH = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minR = 255
      let minG = 255
      let minB = 255
      for (let dx = -r; dx <= r; dx++) {
        const sx = Math.min(width - 1, Math.max(0, x + dx))
        const sidx = (y * width + sx) * 4
        if (data[sidx] < minR) minR = data[sidx]
        if (data[sidx + 1] < minG) minG = data[sidx + 1]
        if (data[sidx + 2] < minB) minB = data[sidx + 2]
      }
      const idx = (y * width + x) * 4
      erodedH[idx] = minR
      erodedH[idx + 1] = minG
      erodedH[idx + 2] = minB
    }
  }

  const bins = new Array(256).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minR = 255
      let minG = 255
      let minB = 255
      for (let dy = -r; dy <= r; dy++) {
        const sy = Math.min(height - 1, Math.max(0, y + dy))
        const sidx = (sy * width + x) * 4
        if (erodedH[sidx] < minR) minR = erodedH[sidx]
        if (erodedH[sidx + 1] < minG) minG = erodedH[sidx + 1]
        if (erodedH[sidx + 2] < minB) minB = erodedH[sidx + 2]
      }
      const idx = (y * width + x) * 4
      const origLum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]
      const erodedLum = 0.2126 * minR + 0.7152 * minG + 0.0722 * minB
      const edgeStrength = Math.max(0, origLum - erodedLum)
      bins[Math.min(255, Math.round(edgeStrength))]++
    }
  }
  return { bins, totalPixels }
}
