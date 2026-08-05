/**
 * Crop-tab "Sharpen" enhancement: classic unsharp mask. uBlurred is a
 * separable box blur of the same source (see boxBlur.frag.ts, reused
 * as-is — pipeline.ts runs it as two passes before this one); this pass
 * just does source + amount * (source - blurred), i.e. boosts local
 * contrast wherever the source deviates from its own blurred version
 * (edges/detail), leaving flat regions (source ≈ blurred) unchanged.
 */
export const unsharpMaskFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform sampler2D uBlurred;
uniform float uAmount;
out vec4 outColor;

void main() {
  vec3 source = texture(uSource, vUV).rgb;
  vec3 blurred = texture(uBlurred, vUV).rgb;
  outColor = vec4(clamp(source + uAmount * (source - blurred), 0.0, 1.0), 1.0);
}
`
