/**
 * Light + Color sub-tabs' basic correction — runs first in the color
 * pipeline chain (before Invert/Curve/HSL, see curvesHsl.frag.ts), since a
 * photo's exposure/white-balance correction is meant to apply to the
 * source image, not to a creative grade already stacked on top of it.
 *
 * Order (matches Lightroom's Basic panel top-to-bottom): white balance
 * (Temperature/Tint) -> Exposure -> Contrast -> Highlights/Shadows/
 * Whites/Blacks -> Brilliance -> Vibrance.
 *
 * This is a first pass, not a colorimetrically exact implementation —
 * Temperature/Tint is a simple channel-shift approximation (not a real
 * Kelvin-based white-point transform), and Whites/Highlights/Blacks/
 * Shadows are 4 differently-shaped luminance-weighted brightness lifts
 * rather than a true zone-system/histogram remap. Good enough for real
 * dial-in work; can be revisited for precision later.
 *
 * Highlights/Shadows use a broad smoothstep weight (affects a wide upper/
 * lower tonal range); Whites/Blacks use a narrower, steeper (squared)
 * weight concentrated at the extremes, approximating a "clip point" feel
 * without literal histogram clipping — this is what keeps the 4 controls
 * from all doing the same thing.
 *
 * Brilliance: Metal reference's "luminance-adaptive brightness + mild
 * saturation nudge" (referencecode/Shaders2.metal's `brilliance`) — lifts
 * shadows more than highlights (or the reverse, by sign) plus a light
 * saturation touch. Vibrance: smart/protective saturation — boosts
 * low-saturation pixels more than already-vivid ones (skin tones,
 * already-saturated colors move less), same luma-mix technique as
 * saturationAdjust.frag.ts elsewhere in this pipeline.
 */
export const lightColorCorrectFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uTemperature;
uniform float uTint;
uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uWhites;
uniform float uBlacks;
uniform float uBrilliance;
uniform float uVibrance;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;

  // White balance: temperature shifts red/blue (warm/cool), tint shifts
  // green against magenta.
  c.r += uTemperature * 0.25;
  c.b -= uTemperature * 0.25;
  c.g += uTint * 0.25;
  c.r -= uTint * 0.125;
  c.b -= uTint * 0.125;

  c *= pow(2.0, uExposure);

  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float highlightW = smoothstep(0.25, 1.0, luma);
  float shadowW = 1.0 - smoothstep(0.0, 0.75, luma);
  float whiteW = pow(smoothstep(0.6, 1.0, luma), 2.0);
  float blackW = pow(1.0 - smoothstep(0.0, 0.4, luma), 2.0);
  c += uHighlights * 0.4 * highlightW;
  c += uShadows * 0.4 * shadowW;
  c += uWhites * 0.5 * whiteW;
  c += uBlacks * 0.5 * blackW;
  c = clamp(c, 0.0, 1.0);

  float contrastMult = clamp(1.0 + uContrast, 0.2, 3.0);
  c = clamp((c - 0.5) * contrastMult + 0.5, 0.0, 1.0);

  float lumaB = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c += vec3(uBrilliance >= 0.0 ? (1.0 - lumaB) * uBrilliance * 0.3 : lumaB * uBrilliance * 0.3);
  c = clamp(c, 0.0, 1.0);
  float lumaB2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = clamp(mix(vec3(lumaB2), c, 1.0 + uBrilliance * 0.15), 0.0, 1.0);

  float maxc = max(max(c.r, c.g), c.b);
  float minc = min(min(c.r, c.g), c.b);
  float sat = maxc - minc;
  float lumaV = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float vibranceBoost = uVibrance * (1.0 - sat) * 0.6;
  c = clamp(mix(vec3(lumaV), c, 1.0 + vibranceBoost), 0.0, 1.0);

  outColor = vec4(c, 1.0);
}
`
