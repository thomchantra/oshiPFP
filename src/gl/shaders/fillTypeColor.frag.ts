/**
 * Shared GLSL for the "what color goes here" decision Gumi's Fill Layer (fillMask.frag.ts)
 * and Line mode (blobMask.frag.ts, via lineFillColor.frag.ts) both need, factored out once
 * both wanted the identical Image/Solid/Gradient choice (v0.3 tuning) — this was a real
 * duplication risk (gradientMapFrag's own 3-stop math already got copied once into
 * fillMaskFrag; a second copy for blob mode would be the third).
 *
 * uFillType: 0 = 'image' (pass the original source color through unmodified), 1 = 'solid'
 * (flat uSolidColor), 2 = 'gradient' (the same 3-stop luminance recolor gradientMap.frag.ts
 * uses standalone, gated here to whatever region the including shader decided to color).
 *
 * Including shader must declare `in vec2 vUV;` and provide uOriginal/uDetectionSource as
 * bound samplers even when a given fillType doesn't read them (GLSL still requires every
 * declared sampler uniform to have *something* bound).
 */
export const fillTypeColorUniforms = `
uniform sampler2D uOriginal;
uniform sampler2D uDetectionSource;
uniform int uFillType;
uniform vec3 uSolidColor;
uniform vec3 uShadowColor;
uniform vec3 uMidColor;
uniform vec3 uHighlightColor;
`

export const resolveFillTypeColorFn = `
vec3 resolveFillTypeColor(vec2 uv) {
  if (uFillType == 1) {
    return uSolidColor;
  } else if (uFillType == 2) {
    vec3 c = texture(uDetectionSource, uv).rgb;
    float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return luminance < 0.5
      ? mix(uShadowColor, uMidColor, luminance * 2.0)
      : mix(uMidColor, uHighlightColor, (luminance - 0.5) * 2.0);
  }
  return texture(uOriginal, uv).rgb;
}
`
