/**
 * Line-art expansion Path B, pass 1/3: seed initialization for a
 * jump-flooding-algorithm (JFA) Euclidean distance transform. For every
 * "line" pixel (mask < 0.5, from threshold.frag) this stores the pixel's
 * own window-space position (gl_FragCoord.xy) as its nearest known seed;
 * every other pixel gets a sentinel meaning "no seed yet". jfaStep.frag.ts
 * propagates these seeds outward. Requires a float render target (RGBA32F)
 * since positions need full pixel-coordinate precision, not the 0-255
 * range of the RGBA8 targets used everywhere else in this project.
 */
export const distanceSeedFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uMask;
out vec4 outColor;

void main() {
  float m = texture(uMask, vUV).r;
  if (m < 0.5) {
    outColor = vec4(gl_FragCoord.xy, 0.0, 1.0);
  } else {
    outColor = vec4(-1.0e6, -1.0e6, 0.0, 1.0);
  }
}
`
