/**
 * Stage 3d: composite. Stacks uLayerCount (2-4) copies of the algorithm's
 * resolved ink layer onto the color-corrected base, per-layer opacity
 * given by uOpacities[i], same blend mode across all layers (blend mode
 * is a shared-controls knob, user-selectable per algorithm — see
 * LineArtPanel.tsx's blend mode row — not per-layer). Each iteration
 * blends against the *previous* iteration's result, so repeated
 * multiply/screen/overlay passes compound.
 *
 * uMask is read as full RGBA, not just RGB: .rgb is the algorithm's
 * straight (non-premultiplied) ink color, .a is how much ink is at this
 * pixel (0 = none, 1 = full — see distanceToEdge.frag.ts/erosionGate.frag.ts/
 * tintMask.frag.ts, which all now emit this convention). Blend mode only
 * describes how ink *combines* with base at full strength; alpha is what
 * lets a pixel fall all the way back to the untouched base regardless of
 * which blend mode is picked — baking that fade into the ink color itself
 * (the old convention, before alpha carried it) breaks down for Multiply
 * specifically: a bright ink color faded toward black before multiplying
 * would darken the *whole* faded region rather than leaving it untouched.
 *
 * uOpacities is an array (not a scalar) so the lab's "alpha overdrive"
 * macro (one 0-3 slider mapped to 3 descending per-layer opacities, see
 * labPipeline.ts's isMaskMode composite branch) can drive genuinely
 * different opacity per stacked layer. First tried on Path B and reverted
 * (see changelog/oshipfp-v0.2-lineart-saga.md) — Path B's mask used to be
 * a solid binary blob (0 or 1), so there was nothing for a fractional
 * inter-layer opacity to visibly express. Re-tried on Path F, whose
 * antialiased Sobel edge mask (findEdges.frag.ts) has genuine soft/
 * graduated alpha along every line, which is exactly what this macro
 * needs to read as anything beyond a single opacity slider. pipeline.ts
 * still fills every used slot with the same opacity-derived scalar for
 * every mode except Path F, so its output is otherwise unaffected — only
 * Path F exploits per-index variation.
 */
export const compositeFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uBase;
uniform sampler2D uMask;
uniform int uBlendMode;
uniform int uLayerCount;
out vec4 outColor;

const int MAX_LAYERS = 4;
uniform float uOpacities[MAX_LAYERS];

vec3 blendLayer(vec3 base, vec3 layer, int mode) {
  if (mode == 1) return base * layer;
  if (mode == 2) return 1.0 - (1.0 - base) * (1.0 - layer);
  if (mode == 3) {
    vec3 lo = 2.0 * base * layer;
    vec3 hi = 1.0 - 2.0 * (1.0 - base) * (1.0 - layer);
    return mix(lo, hi, step(0.5, base));
  }
  return layer;
}

void main() {
  vec3 base = texture(uBase, vUV).rgb;
  vec4 layerSample = texture(uMask, vUV);
  vec3 layerColor = layerSample.rgb;
  float layerAlpha = layerSample.a;

  vec3 result = base;
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= uLayerCount) break;
    vec3 blended = blendLayer(result, layerColor, uBlendMode);
    result = mix(result, blended, uOpacities[i] * layerAlpha);
  }

  outColor = vec4(result, 1.0);
}
`
