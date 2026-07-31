/**
 * Stage 3a: luminance threshold (BT.709). Outputs a grayscale mask where
 * 0.0 = "line" (luminance below cutoff) and 1.0 = "fill" — i.e. a plain
 * black/white image with black lines, matching what a grayscale-erosion
 * ("Minimum" filter) grow pass expects: picking the darkest neighbor
 * naturally spreads (thickens) the black line regions.
 */
export const thresholdFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uThreshold;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mask = luminance < uThreshold ? 0.0 : 1.0;
  outColor = vec4(mask, mask, mask, 1.0);
}
`
