/**
 * Stage 1: crop. Remaps the fullscreen quad's UV into a sub-rect of the
 * persistent source texture. uCropRect is (sx, sy, sw, sh) in normalized
 * [0,1] source-texture UV space, using the standard "sy=0 is image top"
 * convention (see cropMath.ts). The source texture itself is the one
 * anomaly in the pipeline (its v=0 is the image's top row — see
 * shaderUtils.ts), so the V flip to reconcile that lives right here,
 * local to the only place uSource is ever sampled.
 */
export const cropFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec4 uCropRect;
out vec4 outColor;

void main() {
  vec2 flippedUV = vec2(vUV.x, 1.0 - vUV.y);
  vec2 uv = uCropRect.xy + flippedUV * uCropRect.zw;
  outColor = texture(uSource, uv);
}
`
