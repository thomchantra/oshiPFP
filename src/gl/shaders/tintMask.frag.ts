/**
 * Line-art expansion lab, Path D and Path F: recolors a grow mask so the
 * multiply composite darkens toward a chosen color instead of always
 * toward black (or, for Path F, instead of its own per-channel Sobel
 * coloring). `m` is luminance (BT.709) of the mask, not just `.r` — Path
 * D's mask is true grayscale (R=G=B) so this is a no-op there, but Path
 * F's findEdges.frag.ts mask is genuinely colored per-channel, so `.r`
 * alone would read the wrong "how much ink here" signal.
 *
 * Outputs straight ink color (.rgb = tint) and how much ink is here
 * (.a = 1.0 - m) rather than pre-mixing the tint toward white at low mask
 * strength — composite.frag.ts does that mixing now (blend mode +
 * opacity), so low-mask pixels resolve back to the untouched base
 * regardless of which blend mode is selected.
 *
 * Two tint sources, picked by uVividMode:
 * - Off: a single flat uTintColor everywhere.
 * - On ("vivid mode"): per-pixel, not a single global swatch — sample the
 *   real source color at uOriginal, and if its saturation clears
 *   uDeadzone (grayish pixels are left alone, not forced colorful),
 *   multiply that saturation by uVividBoost before converting back to
 *   RGB. This preserves the source's actual multiple color clusters
 *   (skin tones stay skin tones, blue hair stays blue) instead of
 *   flattening the whole tint to one extracted swatch, which is what an
 *   earlier CPU-readback single-color-extraction version did before the
 *   user asked for "several color clusters instead of monochrome."
 *
 * rgb2hsv/hsv2rgb are the standard branchless GLSL formulas (Sam
 * Hocevar's), not anything project-specific.
 */
export const tintMaskFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform sampler2D uOriginal;
uniform vec3 uTintColor;
uniform int uVividMode;
uniform float uDeadzone;
uniform float uVividBoost;
out vec4 outColor;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  float m = dot(c, vec3(0.2126, 0.7152, 0.0722));

  vec3 tint = uTintColor;
  if (uVividMode == 1) {
    vec3 orig = texture(uOriginal, vUV).rgb;
    vec3 hsv = rgb2hsv(orig);
    float boostedSat = hsv.y < uDeadzone ? hsv.y : clamp(hsv.y * uVividBoost, 0.0, 1.0);
    tint = hsv2rgb(vec3(hsv.x, boostedSat, hsv.z));
  }

  outColor = vec4(tint, 1.0 - m);
}
`
