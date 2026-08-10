/**
 * Crop tab's Resize stage — cropTarget -> resizeTarget at the user-chosen
 * working resolution. Plain bilinear sample (relies on target textures'
 * LINEAR min/mag filtering, see framebufferPool.ts's createTargetTexture) —
 * this needs to run every interactive frame while the user drags the
 * custom-size fields, so it stays cheap rather than reaching for pica's
 * Lanczos3 (that's reserved for the CPU-side Export pass, which still runs
 * on top of whatever resolution this stage lands on for the final
 * downloaded file). No orientation flip needed — cropTarget already follows
 * the standard render-to-texture convention every other pipeline stage
 * uses (see crop.frag.ts's header for the one place the source-texture
 * anomaly is actually corrected).
 */
export const resizeFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
out vec4 outColor;

void main() {
  outColor = texture(uSource, vUV);
}
`
