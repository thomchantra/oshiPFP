/**
 * Generic "overlay intensity" polish for the lab harness: mixes a
 * processed-mode result back over the untouched original by uOpacity, so
 * the strength of whatever candidate algorithm is active can be dialed
 * down for comparison, independent of the algorithm's own radius/threshold
 * parameters.
 */
export const mixBlendFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uBase;
uniform sampler2D uOverlay;
uniform float uOpacity;
out vec4 outColor;

void main() {
  vec3 base = texture(uBase, vUV).rgb;
  vec3 overlay = texture(uOverlay, vUV).rgb;
  outColor = vec4(mix(base, overlay, uOpacity), 1.0);
}
`
