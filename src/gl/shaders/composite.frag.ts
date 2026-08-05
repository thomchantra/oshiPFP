/**
 * Stage 3d: composite. Stacks uLayerCount (2-4) copies of the grown line
 * mask onto the color-corrected base, per-layer opacity given by
 * uOpacities[i], same blend mode across all layers (blend mode stays a
 * shared-controls knob — only opacity varies per layer). Each iteration
 * blends against the *previous* iteration's result, so repeated
 * multiply/screen passes compound.
 *
 * uOpacities is an array (not a scalar) so the lab's "alpha overdrive"
 * macro (one 0-3 slider mapped to 3 descending per-layer opacities, see
 * labPipeline.ts's isMaskMode composite branch) can drive genuinely
 * different opacity per stacked layer. First tried on Path B and reverted
 * (see changelog/oshipfp-v0.2-lineart-saga.md) — Path B's mask is a solid
 * binary blob (0 or 1), so there was nothing for a fractional inter-layer
 * opacity to visibly express. Re-tried on Path F, whose antialiased Sobel
 * edge mask (findEdges.frag.ts) has genuine soft/graduated alpha along
 * every line, which is exactly what this macro needs to read as anything
 * beyond a single opacity slider. The main product pipeline (pipeline.ts)
 * still fills every used slot with the same this.maximizer.layerOpacity
 * scalar, so its output is unchanged — only the lab exploits per-index
 * variation, and only for Path F specifically.
 *
 * uMask is sampled as full RGB, not just .r replicated to gray — every
 * mask the main pipeline ever feeds this (threshold+grow's grayscale
 * output) already has R=G=B, so this is a no-op for existing callers, but
 * it lets the v0.2 lab's colored edge-detection candidates (Path F) keep
 * their per-channel hue information through the multiply instead of being
 * silently flattened to grayscale.
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
  return layer;
}

void main() {
  vec3 base = texture(uBase, vUV).rgb;
  vec3 layerColor = texture(uMask, vUV).rgb;

  vec3 result = base;
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= uLayerCount) break;
    vec3 blended = blendLayer(result, layerColor, uBlendMode);
    result = mix(result, blended, uOpacities[i]);
  }

  outColor = vec4(result, 1.0);
}
`
