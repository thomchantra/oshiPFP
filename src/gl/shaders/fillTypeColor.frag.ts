/**
 * Shared GLSL for the "what color goes here" decision Gumi's Fill Layer (fillMask.frag.ts)
 * and Line mode (blobMask.frag.ts, via lineFillColor.frag.ts) both need, factored out once
 * both wanted the identical Image/Solid/Gradient choice (v0.3 tuning) — this was a real
 * duplication risk (gradientMapFrag's own 3-stop math already got copied once into
 * fillMaskFrag; a second copy for blob mode would be the third).
 *
 * v0.3 Service Update (Post-Gumi Saga, Phase 1): promoted from a Gumi-only component to the
 * actual shared fill-type mechanism reused by Botan/Chie/Daiya/Fumiko too (see pipeline.ts's
 * per-algo wiring). Every call site that binds this program must set every uniform below
 * explicitly on every call — GL uniforms persist on a shared program object across draw calls
 * within the same render() pass, and this program is now touched by up to 5 different
 * algorithm branches in one frame (see the shared-uniform-leak lesson in
 * docs/oshiPFP-v0.3-tuningspecs.md's Gumi footnote — hit twice already with thresholdProgram/
 * minFilterProgram before this file even existed).
 *
 * uFillType: 0 = 'image' (pass the original source color through, optionally vivid-boosted —
 * see uVividBoost/uVividDeadzone below), 1 = 'solid' (flat uSolidColor), 2 = 'gradient' (3-stop
 * luminance recolor, with uGradientPivot/uGradientDuoTone reshaping the stops — see
 * resolveFillTypeColor below for the exact math).
 *
 * uVividBoost/uVividDeadzone (v0.3 Service Update): "vivid mode absorbed into image subtab" —
 * previously a separate colorMode value (tintMask.frag.ts's own copy of this exact saturation-
 * boost formula), now an optional modulation of the 'image' branch's passthrough color. Neutral
 * at uVividBoost=1 (any uVividDeadzone) — the HSV round-trip is a no-op there, so callers that
 * don't use vivid boost can just set uVividBoost=1 rather than branching around it.
 *
 * uColorContrast (v0.3 Service Update follow-up): folded in as a *global* Image-subtab
 * parameter per explicit direction, rather than resolving the Color Contrast/Vivid Boost
 * overlap this MVP — same pivoted-at-0.5 contrast curve distanceToEdge.frag.ts already applies
 * to Botan's fused image path, now also available to every algorithm that goes through this
 * shared shader (Chie/Daiya/Fumiko). Neutral at uColorContrast=1 (identity multiplier, matching
 * every other "1 = no-op" contrast convention in this codebase).
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
uniform float uGradientPivot;
uniform int uGradientDuoTone;
uniform float uVividBoost;
uniform float uVividDeadzone;
uniform float uColorContrast;
`

export const resolveFillTypeColorFn = `
vec3 rgb2hsvFillType(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgbFillType(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Gradient stop positions from uGradientPivot. uGradientPivot is negated before use (v0.3
// Service Update follow-up: the un-negated mapping had its polarity backwards — -1 visually
// read as "leans highlight," +1 as "leans shadow," the opposite of the slider's promise) so
// that -1 visually leans the image toward shadow, +1 toward highlight. Internally, at
// pivot=0 stops sit at luminance 0 (shadow) / 0.5 (mid) / 1 (highlight); internal pivot<0
// compresses the mid+highlight stops toward 0 (shadow stays pinned) — which is what a
// slider value of +1 (negated to internal -1) now visually produces (image reads
// highlight-dominated); slider -1 (internal +1) compresses shadow+mid toward 1, reading
// shadow-dominated. Duo Tone drops the mid stop, leaving only shadow/highlight — pivot
// then only compresses whichever end it leans toward.
vec3 resolveFillTypeColor(vec2 uv) {
  if (uFillType == 1) {
    return uSolidColor;
  } else if (uFillType == 2) {
    vec3 c = texture(uDetectionSource, uv).rgb;
    float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float pivot = clamp(-uGradientPivot, -1.0, 1.0);
    float posShadow = pivot > 0.0 ? pivot : 0.0;
    float posHighlight = pivot < 0.0 ? 1.0 + pivot : 1.0;

    if (uGradientDuoTone == 1) {
      float t = clamp((luminance - posShadow) / max(posHighlight - posShadow, 1.0e-4), 0.0, 1.0);
      return mix(uShadowColor, uHighlightColor, t);
    }

    float posMid = 0.5 + 0.5 * pivot;
    if (luminance <= posMid) {
      float t = clamp((luminance - posShadow) / max(posMid - posShadow, 1.0e-4), 0.0, 1.0);
      return mix(uShadowColor, uMidColor, t);
    } else {
      float t = clamp((luminance - posMid) / max(posHighlight - posMid, 1.0e-4), 0.0, 1.0);
      return mix(uMidColor, uHighlightColor, t);
    }
  }

  vec3 img = texture(uOriginal, uv).rgb;
  vec3 hsv = rgb2hsvFillType(img);
  float boostedSat = hsv.y < uVividDeadzone ? hsv.y : clamp(hsv.y * uVividBoost, 0.0, 1.0);
  vec3 vivid = hsv2rgbFillType(vec3(hsv.x, boostedSat, hsv.z));
  return clamp((vivid - 0.5) * uColorContrast + 0.5, 0.0, 1.0);
}
`
