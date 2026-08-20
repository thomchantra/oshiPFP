/**
 * Trivial copy pass used only to present an internal (standard-convention)
 * target texture onto the on-screen canvas at display resolution. No flip
 * needed here — only the raw ImageBitmap source texture has the anomalous
 * v=0=image-top convention (see crop.frag.ts); every texture this shader
 * ever samples is one we rendered ourselves via the standard quad mapping.
 *
 * Alpha forced to 1.0 — every call site binds gl.FRAMEBUFFER null (the
 * on-screen canvas) and nothing downstream ever reads the canvas back as a
 * texture, so alpha here can only ever affect how the browser composites
 * the canvas element against whatever's behind it on the page — never
 * intentional in this app. WebGL canvases default to premultipliedAlpha,
 * and getImageData/toBlob zero out RGB entirely for any pixel read back
 * at alpha=0, so a source with real graduated alpha must have it
 * neutralized here before display.
 */
export const blitFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
out vec4 outColor;

void main() {
  outColor = vec4(texture(uSource, vUV).rgb, 1.0);
}
`
