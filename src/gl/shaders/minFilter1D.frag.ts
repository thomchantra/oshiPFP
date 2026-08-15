/**
 * Stages 3b/3c: separable 1D min/max filter (grayscale erosion or dilation —
 * Photoshop "Minimum"/"Maximum"-equivalent). A 2D min/max over a square
 * structuring element is separable into a horizontal then vertical 1D pass,
 * turning O(r^2) per-pixel work into O(r). uRadius is a uniform (constant
 * for the whole draw call), so the early `break` is a warp-uniform branch —
 * cheap on mobile GPUs, unlike a genuinely per-pixel-varying loop bound.
 * MAX_RADIUS is a compile-time constant so radius changes never trigger a
 * shader recompile (which would stall a live slider).
 *
 * uMode switches min (0) vs max (1, dilation/"closing" — used for the Gumi lab candidate's
 * morphological gap-closing stage).
 *
 * uOneSided — normally each direction samples both `+offset` and `-offset` (symmetric growth:
 * N directions -> a 2N-sided facet shape, since every pass contributes two opposite facets for
 * free). Setting this to 1 samples only `+offset`, so N directions instead produce a genuine
 * N-sided polygon — at low N that's an actual spike/wedge instead of a symmetric
 * diamond/hexagon (used by Daiya's Octagon mode; 0 everywhere else).
 *
 * uMode and uOneSided are both shared-program uniforms — every call site must set them
 * explicitly every call, see CLAUDE.md's "Known Recurring Gotchas".
 */
export const minFilter1DFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform vec2 uTexelSize;
uniform int uRadius;
uniform int uMode;
uniform int uOneSided;
out vec4 outColor;

const int MAX_RADIUS = 40;

void main() {
  float m = texture(uSource, vUV).r;
  for (int i = 1; i <= MAX_RADIUS; i++) {
    if (i > uRadius) break;
    vec2 offset = uDirection * uTexelSize * float(i);
    float a = texture(uSource, vUV + offset).r;
    float b = uOneSided == 1 ? a : texture(uSource, vUV - offset).r;
    if (uMode == 1) {
      m = max(m, max(a, b));
    } else {
      m = min(m, min(a, b));
    }
  }
  outColor = vec4(m, m, m, 1.0);
}
`
