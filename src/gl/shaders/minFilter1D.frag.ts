/**
 * Stages 3b/3c: separable 1D min-filter (grayscale erosion / Photoshop
 * "Minimum"-equivalent). A 2D min over a square structuring element is
 * separable into a horizontal then vertical 1D pass, turning O(r^2)
 * per-pixel work into O(r). uRadius is a uniform (constant for the whole
 * draw call), so the early `break` is a warp-uniform branch — cheap on
 * mobile GPUs, unlike a genuinely per-pixel-varying loop bound. MAX_RADIUS
 * is a compile-time constant so radius changes never trigger a shader
 * recompile (which would stall a live slider).
 */
export const minFilter1DFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform vec2 uTexelSize;
uniform int uRadius;
out vec4 outColor;

const int MAX_RADIUS = 40;

void main() {
  float m = texture(uSource, vUV).r;
  for (int i = 1; i <= MAX_RADIUS; i++) {
    if (i > uRadius) break;
    vec2 offset = uDirection * uTexelSize * float(i);
    m = min(m, texture(uSource, vUV + offset).r);
    m = min(m, texture(uSource, vUV - offset).r);
  }
  outColor = vec4(m, m, m, 1.0);
}
`
