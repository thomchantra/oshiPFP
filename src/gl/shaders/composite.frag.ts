/**
 * Stage 3d: composite. Stacks uLayerCount (2-4) copies of the grown line
 * mask onto the color-corrected base, all copies sharing the same opacity
 * and blend mode (per the shared-controls design — not independent
 * per-layer controls). Each iteration blends against the *previous*
 * iteration's result, so repeated multiply/screen passes compound.
 */
export const compositeFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uBase;
uniform sampler2D uMask;
uniform float uOpacity;
uniform int uBlendMode;
uniform int uLayerCount;
out vec4 outColor;

const int MAX_LAYERS = 4;

vec3 blendLayer(vec3 base, vec3 layer, int mode) {
  if (mode == 1) return base * layer;
  if (mode == 2) return 1.0 - (1.0 - base) * (1.0 - layer);
  return layer;
}

void main() {
  vec3 base = texture(uBase, vUV).rgb;
  float m = texture(uMask, vUV).r;
  vec3 layerColor = vec3(m);

  vec3 result = base;
  for (int i = 0; i < MAX_LAYERS; i++) {
    if (i >= uLayerCount) break;
    vec3 blended = blendLayer(result, layerColor, uBlendMode);
    result = mix(result, blended, uOpacity);
  }

  outColor = vec4(result, 1.0);
}
`
