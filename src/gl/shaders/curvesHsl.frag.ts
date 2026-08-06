/**
 * Stage 2: color correction. Invert Colors runs FIRST, before the curve —
 * not last — so the curve and HSL controls grade the already-inverted
 * image rather than the original. This matters specifically because a
 * curve's "white clip"/highlight end is meant to brighten what's already
 * light; if invert ran last, pushing that curve control up would brighten
 * what were originally *shadows* right before they got flipped to
 * highlights, which reads backwards. Running invert first means "push the
 * white point" genuinely enriches the inverted image's blacks (what was
 * originally near-white, now near-black) the way a user grading a negative
 * expects.
 *
 * After that: the curve LUT per-channel, then targeted HSL (8 hue bands,
 * each independently hue/sat/lightness-shiftable — a first real port of
 * the Metal reference's 12-band `hsl` kernel, scoped to 8 bands to match
 * this app's existing HSL-module palette, see src/color/hslPalette.ts),
 * then the master/global HSL shift (the original simple hue/sat/lightness
 * knob — now selected via the HSL panel's leftmost "master" swatch rather
 * than always-on).
 *
 * uBandShift[i] is (hueShiftDegrees, satShift, lightShift) for band i, in
 * the same order as BAND_HUES — computed the same weighted-blend way as
 * colorLift.frag.ts's Color Lift (band membership by hue distance,
 * normalized so overlapping bands blend, achromatic pixels gated out via
 * satGate). Targeted band membership is decided by the pixel's hue
 * *before* the master hue shift below — otherwise shifting master hue
 * would unpredictably move pixels into/out of their original bands.
 *
 * uInvertMask is (invertR, invertG, invertB) as 0/1 floats — a full RGB
 * invert and a per-channel invert are the same operation to this shader,
 * just a different mask (see ColorPanel.tsx's collapse-to-rgb rule).
 */
export const curvesHslFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform sampler2D uLut;
uniform vec3 uBandShift[8];
uniform float uHue;
uniform float uSaturation;
uniform float uLightness;
uniform vec3 uInvertMask;
out vec4 outColor;

const int BAND_COUNT = 8;
const float BAND_HUES[8] = float[8](0.0, 0.0752, 0.1667, 0.3948, 0.4895, 0.5948, 0.7653, 0.8894);
const float BAND_WIDTH = 0.14;

vec3 rgb2hsl(vec3 c) {
  float maxc = max(max(c.r, c.g), c.b);
  float minc = min(min(c.r, c.g), c.b);
  float l = (maxc + minc) * 0.5;
  float h = 0.0;
  float s = 0.0;
  float d = maxc - minc;
  if (d > 0.00001) {
    s = l < 0.5 ? d / (maxc + minc) : d / (2.0 - maxc - minc);
    if (maxc == c.r) {
      h = mod((c.g - c.b) / d, 6.0);
    } else if (maxc == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
    if (h < 0.0) h += 1.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  if (s <= 0.00001) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(
    hue2rgb(p, q, h + 1.0 / 3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0 / 3.0)
  );
}

void main() {
  vec4 base = texture(uSource, vUV);
  vec3 inverted = mix(base.rgb, 1.0 - base.rgb, uInvertMask);
  vec3 curved = vec3(
    texture(uLut, vec2(inverted.r, 0.5)).r,
    texture(uLut, vec2(inverted.g, 0.5)).g,
    texture(uLut, vec2(inverted.b, 0.5)).b
  );

  vec3 hsl = rgb2hsl(curved);

  float hueShiftSum = 0.0;
  float satShiftSum = 0.0;
  float lightShiftSum = 0.0;
  float weightSum = 0.0;
  for (int i = 0; i < BAND_COUNT; i++) {
    float d = abs(hsl.x - BAND_HUES[i]);
    d = min(d, 1.0 - d);
    float w = max(0.0, 1.0 - d / BAND_WIDTH);
    hueShiftSum += w * uBandShift[i].x;
    satShiftSum += w * uBandShift[i].y;
    lightShiftSum += w * uBandShift[i].z;
    weightSum += w;
  }
  if (weightSum > 0.0001) {
    float satGate = smoothstep(0.0, 0.12, hsl.y);
    hsl.x = fract(hsl.x + (hueShiftSum / weightSum / 360.0) * satGate);
    hsl.y = clamp(hsl.y + (satShiftSum / weightSum) * satGate, 0.0, 1.0);
    hsl.z = clamp(hsl.z + (lightShiftSum / weightSum) * satGate, 0.0, 1.0);
  }

  hsl.x = fract(hsl.x + uHue / 360.0);
  hsl.y = clamp(hsl.y + uSaturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + uLightness, 0.0, 1.0);

  outColor = vec4(hsl2rgb(hsl), base.a);
}
`
