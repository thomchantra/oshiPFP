/**
 * Line-art expansion Path C, first pass: hybrid of A (continuous
 * per-channel erosion as a color-aware "edge response") and a single soft
 * threshold gate, unifying detection and antialiased grow into one pass
 * instead of two — see docs/oshipfp-v0.2-lineart-expansion-spec.md Path C.
 *
 * Compares luminance before/after erosion; where erosion darkened a pixel
 * meaningfully (a real stroke edge), the gate opens. Where erosion barely
 * changed luminance (flat shading, gentle gradients), the gate stays near
 * 0 — directly targeting Path A's known risk of over-thickening shading
 * fills that aren't line strokes.
 *
 * Outputs straight ink color (.rgb = eroded) and how much ink is here
 * (.a = gate) rather than pre-mixing toward the original at low gate —
 * composite.frag.ts does that mixing now (blend mode + opacity), so
 * gate=0 pixels resolve back to the untouched base regardless of which
 * blend mode is selected.
 *
 * uFeather-vs-domain clamp: erosionRgb.frag.ts's componentwise min() guarantees
 * erodedLum <= origLum, so edgeStrength is always in [0, 1] — but the raw
 * smoothstep(uGateThreshold - uFeather, uGateThreshold + uFeather, edgeStrength) lets both edges
 * wander outside that range once uFeather (from Hardness) grows large: a negative lower edge
 * would let perfectly flat pixels (edgeStrength == 0) leak a nonzero gate instead of staying
 * pinned at 0, and an upper edge above 1 would mean even the strongest genuine edge pixels
 * (edgeStrength near its 1.0 ceiling) couldn't reach gate == 1. Both edges are clamped to
 * edgeStrength's known [0, 1] domain to prevent this.
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
  float edge0 = clamp(uGateThreshold - uFeather, 0.0, 1.0);
  float edge1 = clamp(uGateThreshold + uFeather, 0.0, 1.0);
  float gate = smoothstep(edge0, edge1, edgeStrength);
  outColor = vec4(eroded, gate);
}
`
