/**
 * Line-art lab Path I (Laplacian): single-pass 4-neighbor second-order
 * kernel ([0,-1,0 / -1,4,-1 / 0,-1,0]) — lighter than Path H's two-pass
 * separable blur, and emphasizes curvature/sharp transitions rather than a
 * chosen blur scale. uStrength amplifies the response before re-centering
 * at 0.5 and clamping; an optional downstream threshold pass (reusing
 * threshold.frag.ts) binarizes it when the lab's threshold toggle is
 * enabled, same as Path H.
 */
export const laplacianFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uStrength;
out vec4 outColor;

void main() {
  vec3 center = texture(uSource, vUV).rgb;
  vec3 up = texture(uSource, vUV + vec2(0.0, uTexelSize.y)).rgb;
  vec3 down = texture(uSource, vUV - vec2(0.0, uTexelSize.y)).rgb;
  vec3 left = texture(uSource, vUV - vec2(uTexelSize.x, 0.0)).rgb;
  vec3 right = texture(uSource, vUV + vec2(uTexelSize.x, 0.0)).rgb;
  vec3 laplacian = 4.0 * center - up - down - left - right;
  vec3 c = clamp(laplacian * uStrength + 0.5, 0.0, 1.0);
  outColor = vec4(c, 1.0);
}
`
