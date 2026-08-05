/**
 * Line-art expansion Path F: "Find Edges"-style gradient detector. Sobel
 * gradient magnitude computed per-channel (R/G/B independently) and left
 * as a *colored* result (not collapsed to a single grayscale scalar via
 * max/luminance) — near-white where a channel's local gradient is small,
 * darkening in just that channel where it's large. This is what gives real
 * Photoshop "Find Edges" its traced-in-color look (a red/blue boundary
 * produces a magenta-ish edge, not a flat black/gray line) and is what
 * makes the multiply composite darken selectively by hue at genuine
 * boundaries instead of applying a uniform gray darkening everywhere —
 * see docs/oshipfp-v0.2-lineart-expansion-spec.md Path F.
 *
 * uSensitivity acts as an inverse magnitude threshold (1/uSensitivity),
 * gated with smoothstep rather than a raw linear ramp from zero — a soft
 * knee suppresses small, high-frequency gradients (JPEG blocking, brush
 * texture, hair strands) that aren't genuine shape edges, while still
 * antialiasing real boundaries. Composited via the same multiply path as
 * v1/Path B (see labPipeline.ts's MASK_MODES). uSource is expected to be
 * pre-blurred (see boxBlur.frag.ts) — this shader has no denoise of its
 * own, it just detects gradients in whatever it's given.
 *
 * uGamma reshapes the per-channel result via pow(value, gamma) — same
 * contrast knob as Path B's distanceToEdge.frag.ts, applied here so
 * cel-shaded/skin-tone regions that still show faint edge noise after
 * blurring can be pushed back toward white (gamma < 1) without touching
 * uSensitivity's edge-detection threshold itself.
 *
 * uSaturation is Path F's analogue of Path B's uColorContrast — a
 * color-quality knob on the output layer, but saturation rather than
 * contrast: this shader's output is inherently colored (the per-channel
 * Sobel magenta/cyan fringing described above), so the more useful lever
 * on it is how vivid vs. desaturated-toward-grayscale that fringing reads,
 * not a brightness-contrast curve. Standard luma-mix saturation: 0 flattens
 * to grayscale (desaturated Find Edges, closer to a traditional flat black
 * line), 1 is a no-op (the original per-channel color), values above 1
 * push the color fringing more vivid.
 */
export const findEdgesFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uSensitivity;
uniform float uGamma;
uniform float uSaturation;
out vec4 outColor;

void main() {
  vec3 tl = texture(uSource, vUV + uTexelSize * vec2(-1.0,  1.0)).rgb;
  vec3 tm = texture(uSource, vUV + uTexelSize * vec2( 0.0,  1.0)).rgb;
  vec3 tr = texture(uSource, vUV + uTexelSize * vec2( 1.0,  1.0)).rgb;
  vec3 ml = texture(uSource, vUV + uTexelSize * vec2(-1.0,  0.0)).rgb;
  vec3 mr = texture(uSource, vUV + uTexelSize * vec2( 1.0,  0.0)).rgb;
  vec3 bl = texture(uSource, vUV + uTexelSize * vec2(-1.0, -1.0)).rgb;
  vec3 bm = texture(uSource, vUV + uTexelSize * vec2( 0.0, -1.0)).rgb;
  vec3 br = texture(uSource, vUV + uTexelSize * vec2( 1.0, -1.0)).rgb;

  vec3 gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  vec3 gy = -tl - 2.0 * tm - tr + bl + 2.0 * bm + br;
  vec3 mag = sqrt(gx * gx + gy * gy);

  vec3 knee = vec3(1.0 / uSensitivity);
  vec3 feather = knee * 0.5;
  vec3 value = vec3(1.0) - smoothstep(knee - feather, knee + feather, mag);
  value = pow(clamp(value, 0.0, 1.0), vec3(uGamma));

  float luma = dot(value, vec3(0.2126, 0.7152, 0.0722));
  value = clamp(mix(vec3(luma), value, uSaturation), 0.0, 1.0);

  outColor = vec4(value, 1.0);
}
`
