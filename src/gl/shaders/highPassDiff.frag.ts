/**
 * Line-art lab Path H (High Pass): subtracts a blurred copy of the
 * detection source from the sharp original (uSource - uBlurred, chained
 * after a separable box-blur pass reusing boxBlur.frag.ts — see
 * labPipeline.ts). Result is emboss-like: near-0.5 gray in flat regions,
 * pushed above/below 0.5 around edges/detail at the blur's scale. uStrength
 * amplifies that push before re-centering at 0.5 and clamping to display
 * range; an optional downstream threshold pass (reusing threshold.frag.ts)
 * binarizes it when the lab's threshold toggle is enabled.
 */
export const highPassDiffFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform sampler2D uBlurred;
uniform float uStrength;
out vec4 outColor;

void main() {
  vec3 sharp = texture(uSource, vUV).rgb;
  vec3 blurred = texture(uBlurred, vUV).rgb;
  vec3 diff = (sharp - blurred) * uStrength + 0.5;
  outColor = vec4(clamp(diff, 0.0, 1.0), 1.0);
}
`
