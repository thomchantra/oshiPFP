/**
 * Trivial copy pass used only to present an internal (standard-convention)
 * target texture onto the on-screen canvas at display resolution. No flip
 * needed here — only the raw ImageBitmap source texture has the anomalous
 * v=0=image-top convention (see crop.frag.ts); every texture this shader
 * ever samples is one we rendered ourselves via the standard quad mapping.
 */
export const blitFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
out vec4 outColor;

void main() {
  outColor = texture(uSource, vUV);
}
`
