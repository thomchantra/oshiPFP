/**
 * Stage 2: color correction. Applies the curve LUT per-channel (master
 * curve for MVP — same curve values in all 3 LUT channels), then an
 * HSL transform (hue rotate, saturation offset, lightness offset), in
 * that order per the spec.
 */
export const curvesHslFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform sampler2D uLut;
uniform float uHue;
uniform float uSaturation;
uniform float uLightness;
out vec4 outColor;

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
  vec3 curved = vec3(
    texture(uLut, vec2(base.r, 0.5)).r,
    texture(uLut, vec2(base.g, 0.5)).g,
    texture(uLut, vec2(base.b, 0.5)).b
  );

  vec3 hsl = rgb2hsl(curved);
  hsl.x = fract(hsl.x + uHue / 360.0);
  hsl.y = clamp(hsl.y + uSaturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + uLightness, 0.0, 1.0);

  outColor = vec4(hsl2rgb(hsl), base.a);
}
`
