/**
 * Stage 1: crop. Remaps the fullscreen quad's UV into a sub-rect of the
 * persistent source texture. uCropRect is (sx, sy, sw, sh) in normalized
 * [0,1] source-texture UV space.
 */
export const cropFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec4 uCropRect;
out vec4 outColor;

void main() {
  vec2 uv = uCropRect.xy + vUV * uCropRect.zw;
  outColor = texture(uSource, uv);
}
`
