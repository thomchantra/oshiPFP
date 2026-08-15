/**
 * Flattens a straight-alpha ink texture (see composite.frag.ts's doc
 * comment for the .rgb=color/.a=how-much-ink convention every line-art
 * algorithm now emits) onto a solid matte color, for the Line Art tab's
 * "Overlay" display mode — a raw, blend-mode-independent preview of what
 * the algorithm drew, on a neutral backdrop instead of the actual base
 * image — and LineArtParams.overlayPassthrough, which reuses this same pass for the Composite
 * display mode so it flows downstream through Color/Export too. Needed because the WebGL canvas
 * itself is alpha-enabled; blitting an ink texture's partial alpha straight to the canvas would
 * let the page background show through instead of a clean preview. uMatteColor defaults to white
 * but is user-configurable — see LineArtParams.matteColor.
 */
export const alphaOverWhiteFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec3 uMatteColor;
out vec4 outColor;

void main() {
  vec4 s = texture(uSource, vUV);
  outColor = vec4(mix(uMatteColor, s.rgb, s.a), 1.0);
}
`
