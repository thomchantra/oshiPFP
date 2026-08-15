/**
 * Photoshop-style Gradient Map: every pixel's luminance is looked up continuously against a
 * 3-stop gradient (shadow -> mid -> highlight) and recolored directly — no binary decision
 * anywhere in this shader, so the output is a full continuous-tone recolorization of the source,
 * not an isolated band that gets grown/composited back on.
 *
 * uGradientPivot/uGradientDuoTone: same stop-remapping math as fillTypeColor.frag.ts's
 * resolveFillTypeColor — kept in sync there since both duplicate this exact 3-stop ramp (see
 * that file's doc comment for the pivot/duo-tone rule).
 */
export const gradientMapFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec3 uShadowColor;
uniform vec3 uMidColor;
uniform vec3 uHighlightColor;
uniform float uGradientPivot;
uniform int uGradientDuoTone;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // Negated to match fillTypeColor.frag.ts's polarity fix — see that file's doc comment.
  float pivot = clamp(-uGradientPivot, -1.0, 1.0);
  float posShadow = pivot > 0.0 ? pivot : 0.0;
  float posHighlight = pivot < 0.0 ? 1.0 + pivot : 1.0;

  vec3 mapped;
  if (uGradientDuoTone == 1) {
    float t = clamp((luminance - posShadow) / max(posHighlight - posShadow, 1.0e-4), 0.0, 1.0);
    mapped = mix(uShadowColor, uHighlightColor, t);
  } else {
    float posMid = 0.5 + 0.5 * pivot;
    if (luminance <= posMid) {
      float t = clamp((luminance - posShadow) / max(posMid - posShadow, 1.0e-4), 0.0, 1.0);
      mapped = mix(uShadowColor, uMidColor, t);
    } else {
      float t = clamp((luminance - posMid) / max(posHighlight - posMid, 1.0e-4), 0.0, 1.0);
      mapped = mix(uMidColor, uHighlightColor, t);
    }
  }
  outColor = vec4(mapped, 1.0);
}
`
