/**
 * Generic "overlay intensity" polish for the lab harness: mixes a
 * processed-mode result back over the untouched original by uOpacity, so
 * the strength of whatever candidate algorithm is active can be dialed
 * down for comparison, independent of the algorithm's own radius/threshold
 * parameters.
 *
 * Mixes alpha alongside RGB (full vec4) so a real per-pixel coverage alpha (see
 * findEdges.frag.ts) survives this pass instead of being clobbered to 1.0. Safe no-op for
 * every other caller (Gumi hardness mix, export grade-intensity blend) whose base/overlay
 * are always opaque (alpha=1) going in.
 */
export const mixBlendFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uBase;
uniform sampler2D uOverlay;
uniform float uOpacity;
out vec4 outColor;

void main() {
  vec4 base = texture(uBase, vUV);
  vec4 overlay = texture(uOverlay, vUV);
  outColor = mix(base, overlay, uOpacity);
}
`
