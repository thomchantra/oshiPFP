/**
 * Line-art expansion Path A: continuous per-channel erosion, no
 * pre-binarization. Same separable-pass spirit as minFilter1D.frag.ts
 * (grayscale "Minimum" grow used by the v1 threshold pipeline), but takes
 * the componentwise min of .rgb directly instead of eroding a single
 * pre-thresholded channel. Run on the raw continuous color image, this
 * gets floor and antialiasing for free (erosion can only output a value
 * already present in the sampled neighborhood) and is color-aware at
 * edges (per-channel, not luminance-only) — see
 * docs/oshipfp-v0.2-lineart-expansion-spec.md Path A.
 *
 * uRadius is a float (sane range ~0-3 texels for line art). Rather than an
 * integer texel loop (which can only change radius in whole-texel jumps —
 * useless for sub-texel control at these small radii), this subdivides
 * [0, uRadius] into a fixed number of samples, so the slider is smooth
 * from 0 up.
 */
export const erosionRgbFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform vec2 uTexelSize;
uniform float uRadius;
out vec4 outColor;

const int SAMPLES = 32;

void main() {
  vec3 m = texture(uSource, vUV).rgb;
  for (int i = 1; i <= SAMPLES; i++) {
    float t = uRadius * float(i) / float(SAMPLES);
    vec2 offset = uDirection * uTexelSize * t;
    m = min(m, texture(uSource, vUV + offset).rgb);
    m = min(m, texture(uSource, vUV - offset).rgb);
  }
  outColor = vec4(m, 1.0);
}
`
