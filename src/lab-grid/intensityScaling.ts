import type { LabParams } from '../lab/labPipeline'
import type { AlgoId } from './labGridTypes'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Scales a baseline's Tier-1 knobs by an intensity factor (0.5 = softer,
 * 2.0 = more aggressive), per algorithm. Only fields that plausibly read as
 * an "aggression"/magnitude knob scale; fields that are shape/noise
 * controls rather than magnitude (feather, laplacianPreBlur) are held
 * fixed at the baseline value — matches the project's own framing that
 * feather et al aren't "how much", they're "how soft the edge is".
 */
export function scaleParams(algo: AlgoId, baseline: Partial<LabParams>, factor: number): Partial<LabParams> {
  switch (algo) {
    case 'pathA':
      return {
        radius: scaleField(baseline.radius, factor, 0.1, 40),
      }
    case 'pathC':
      return {
        radius: scaleField(baseline.radius, factor, 0.1, 40),
        gateThreshold: scaleField(baseline.gateThreshold, factor, 0, 1),
      }
    case 'pathD':
      return {
        threshold: scaleField(baseline.threshold, factor, 0, 1),
        radius: scaleField(baseline.radius, factor, 0.1, 40),
      }
    case 'pathF':
      return {
        // sensitivity is an inverse magnitude threshold (findEdges.frag.ts
        // uses 1/uSensitivity) — higher sensitivity already means "more
        // edges detected", so it scales the same direction as intensity.
        sensitivity: scaleField(baseline.sensitivity, factor, 0.1, 30),
        radius: scaleField(baseline.radius, factor, 0, 3),
      }
    case 'pathG':
      return {
        ...scaleRampBand(baseline, factor),
        threshold: scaleField(baseline.threshold, factor, 0, 1),
        radius: scaleField(baseline.radius, factor, 0.1, 40),
        blobMaxDt: scaleField(baseline.blobMaxDt, factor, 0, 40),
      }
    case 'pathH':
      return {
        radius: scaleField(baseline.radius, factor, 0.1, 40),
        highPassStrength: scaleField(baseline.highPassStrength, factor, 0, 10),
        ...(baseline.thresholdEnabled ? { threshold: scaleField(baseline.threshold, factor, 0, 1) } : {}),
      }
    case 'pathI':
      return {
        laplacianStrength: scaleField(baseline.laplacianStrength, factor, 0, 20),
        laplacianGrow: scaleField(baseline.laplacianGrow, factor, 0, 40),
      }
  }
}

function scaleField(value: number | undefined, factor: number, min: number, max: number): number {
  return clamp((value ?? 0) * factor, min, max)
}

// Gumi's ramp is a band, not a single magnitude — scaling it means
// widening/narrowing the innerLow..innerHigh band and its floor/ceiling
// margins around a fixed center, rather than multiplying each bound
// directly (which would just shift the whole band toward 0).
function scaleRampBand(
  baseline: Partial<LabParams>,
  factor: number,
): Pick<LabParams, 'rampFloor' | 'rampInnerLow' | 'rampInnerHigh' | 'rampCeiling'> {
  const floor = baseline.rampFloor ?? 0
  const innerLow = baseline.rampInnerLow ?? 0.3
  const innerHigh = baseline.rampInnerHigh ?? 0.7
  const ceiling = baseline.rampCeiling ?? 1

  const center = (innerLow + innerHigh) / 2
  const halfSpread = ((innerHigh - innerLow) / 2) * factor
  const newInnerLow = clamp(center - halfSpread, 0, 1)
  const newInnerHigh = clamp(center + halfSpread, 0, 1)

  const floorMargin = (innerLow - floor) * factor
  const ceilingMargin = (ceiling - innerHigh) * factor

  return {
    rampFloor: clamp(newInnerLow - floorMargin, 0, 1),
    rampInnerLow: newInnerLow,
    rampInnerHigh: newInnerHigh,
    rampCeiling: clamp(newInnerHigh + ceilingMargin, 0, 1),
  }
}
