/**
 * Pre-Blend Correction ("Color Correct") — applied to the resolved ink layer right before it
 * composites onto the base, gated by LineArtParams.colorCorrectEnabled (skipped entirely, zero
 * cost, when off). Distinct from colorCorrect.frag.ts (pre-detection input, hardcodes alpha to 1,
 * would destroy the real per-pixel coverage alpha every algorithm now emits) and from
 * saturationAdjust.frag.ts (Fumiko-only, no exposure/contrast/invert) — this is the one place all
 * 4 controls apply together, to any algorithm's output, alpha-safe throughout.
 *
 * Order: Exposure (EV-style multiplicative stop) -> Contrast (pivot-at-0.5) -> Saturation
 * (standard luma-mix, uSaturation as a 0..2 multiplier — 1 = identity, 0 = grayscale, 2 = doubled)
 * -> Invert Matte (RGB invert then a 180deg hue rotation via an RGB->HSV->RGB round trip, so the
 * inverted result keeps its original hue-wheel *position* rather than flipping to its literal
 * complementary hue — handy for prepping output to either lighten or darken blend mode). Invert
 * runs last since it's meant to prep the already-corrected result for compositing, not get
 * corrected itself. Alpha passes through untouched throughout.
 */
export const inkCorrectFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform int uInvertMatte;
out vec4 outColor;

vec3 rgb2hsvInk(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgbInk(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 c = texture(uSource, vUV);
  vec3 rgb = c.rgb;

  rgb *= pow(2.0, uExposure);
  rgb = clamp((rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);

  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = clamp(mix(vec3(luma), rgb, uSaturation), 0.0, 1.0);

  if (uInvertMatte == 1) {
    vec3 inv = 1.0 - rgb;
    vec3 hsv = rgb2hsvInk(inv);
    hsv.x = fract(hsv.x + 0.5);
    rgb = hsv2rgbInk(hsv);
  }

  outColor = vec4(rgb, c.a);
}
`
