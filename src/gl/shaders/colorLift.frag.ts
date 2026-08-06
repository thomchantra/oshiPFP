/**
 * Line Art pre-processing "Color Lift" — first pass of the 12-band targeted
 * HSL grading kernel forked from referencecode/Shaders2.metal's `hsl`
 * (#14 in shaders2-inventory.md), scoped down to just the lightness/
 * brightness axis (no hue or saturation shift yet — see LineArtPanel.tsx)
 * across the app's existing 8-swatch HSL palette (Red/Orange/Yellow/Green/
 * Teal/Blue/Purple/Magenta, per docs/oshiPFP-v0.2.1-UIspecs.md's "HSL
 * Module" color list) rather than the Metal source's 12. A precursor to
 * the eventual full hue/sat/lightness Color-tab HSL panel — this only
 * feeds the line-art detection input (see pipeline.ts: runs on
 * correctedTarget, upstream of denoise/threshold), it never touches the
 * base image Color/Export sees.
 *
 * BAND_HUES are the actual hues (0-1) of the 8 palette swatches, not
 * evenly-spaced wheel positions — matches what the picker swatches in the
 * UI actually look like rather than an idealized wheel.
 *
 * Each pixel's lift is a weighted blend of every band whose hue falls
 * within BAND_WIDTH of it (weight falls off linearly with hue distance,
 * normalized so overlapping bands blend rather than double-count) — this
 * is the same "no hard seam at a band boundary" idea as the Metal source's
 * smoothTreatment helper, just linear instead of smoothstep for a first
 * pass. satGate fades the whole effect out on near-gray pixels, which
 * don't have a well-defined hue to belong to a band in the first place.
 */
export const colorLiftFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uLift[8];
out vec4 outColor;

const int BAND_COUNT = 8;
const float BAND_HUES[8] = float[8](0.0, 0.0752, 0.1667, 0.3948, 0.4895, 0.5948, 0.7653, 0.8894);
const float BAND_WIDTH = 0.14;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  vec3 hsv = rgb2hsv(c);

  float liftSum = 0.0;
  float weightSum = 0.0;
  for (int i = 0; i < BAND_COUNT; i++) {
    float d = abs(hsv.x - BAND_HUES[i]);
    d = min(d, 1.0 - d);
    float w = max(0.0, 1.0 - d / BAND_WIDTH);
    liftSum += w * uLift[i];
    weightSum += w;
  }
  float lift = weightSum > 0.0001 ? liftSum / weightSum : 0.0;
  float satGate = smoothstep(0.0, 0.12, hsv.y);

  hsv.z = clamp(hsv.z + lift * 0.6 * satGate, 0.0, 1.0);
  outColor = vec4(hsv2rgb(hsv), 1.0);
}
`
