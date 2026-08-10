/**
 * Crude first-pass prototype for what Gumi was originally meant to be, per
 * user direction: a true Photoshop-style Gradient Map, not the
 * threshold-then-morphology ("dot stamping") pipeline the rest of Path G
 * is built from. No binary decision anywhere in this shader — every pixel's
 * luminance is looked up continuously against a 3-stop gradient
 * (shadow -> mid -> highlight) and recolored directly, so the output is a
 * full continuous-tone recolorization of the source, not an isolated band
 * that gets grown/composited back on. This is deliberately the simplest
 * version that can prove or disprove the idea (a real one would likely
 * want an arbitrary multi-stop ramp, closer to curvesHsl.frag.ts's LUT
 * texture than 3 hardcoded uniform colors) — evaluate qualitatively before
 * investing in that.
 */
export const gradientMapFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec3 uShadowColor;
uniform vec3 uMidColor;
uniform vec3 uHighlightColor;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 mapped = luminance < 0.5
    ? mix(uShadowColor, uMidColor, luminance * 2.0)
    : mix(uMidColor, uHighlightColor, (luminance - 0.5) * 2.0);
  outColor = vec4(mapped, 1.0);
}
`
