/**
 * Line-art expansion Path C, first pass: hybrid of A (continuous
 * per-channel erosion as a color-aware "edge response") and a single soft
 * threshold gate, unifying detection and antialiased grow into one pass
 * instead of two — see docs/oshipfp-v0.2-lineart-expansion-spec.md Path C.
 *
 * Compares luminance before/after erosion; where erosion darkened a pixel
 * meaningfully (a real stroke edge), the eroded color is let through via
 * a smoothstep gate. Where erosion barely changed luminance (flat shading,
 * gentle gradients), the gate stays near 0 and the original color passes
 * through mostly unchanged — directly targeting Path A's known risk of
 * over-thickening shading fills that aren't line strokes.
 */
export const erosionGateFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uOriginal;
uniform sampler2D uEroded;
uniform float uGateThreshold;
uniform float uFeather;
out vec4 outColor;

void main() {
  vec3 orig = texture(uOriginal, vUV).rgb;
  vec3 eroded = texture(uEroded, vUV).rgb;
  float origLum = dot(orig, vec3(0.2126, 0.7152, 0.0722));
  float erodedLum = dot(eroded, vec3(0.2126, 0.7152, 0.0722));
  float edgeStrength = origLum - erodedLum;
  float gate = smoothstep(uGateThreshold - uFeather, uGateThreshold + uFeather, edgeStrength);
  outColor = vec4(mix(orig, eroded, gate), 1.0);
}
`
