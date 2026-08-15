/**
 * Path F (Fumiko) "Saturation" — applied once to the fully-resolved ink
 * layer (post erosion/dilate, post tint-or-vivid recolor) right before
 * compositing, so it reads as one master saturation knob across all 3
 * color modes (Find Edge, Tint, Vivid) instead of only affecting Find
 * Edge's raw Sobel fringing the way it used to inside findEdges.frag.ts.
 * Standard luma-mix saturation on .rgb only — .a (how much ink is here,
 * see composite.frag.ts) passes through untouched, so this never changes
 * *where* ink shows up, only how colorful it is once it does.
 *
 * uHueInvert (added for Path H Tone mode's chromatic-fringing artifacts — see
 * highPassDiff.frag.ts/toneRemap.frag.ts's own doc comments on why real per-channel color
 * survives into their output): rotates hue 180° via an RGB->HSV->RGB round trip while leaving
 * saturation/value untouched, applied *before* the saturation mix above so the two knobs compose
 * predictably. Off (0, default) is a no-op — every call site must set this explicitly, see
 * CLAUDE.md's "Known Recurring Gotchas" on shared GL program uniforms.
 */
export const saturationAdjustFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uSaturation;
uniform int uHueInvert;
out vec4 outColor;

vec3 rgb2hsvSat(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgbSat(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 c = texture(uSource, vUV);
  vec3 rgb = c.rgb;
  if (uHueInvert == 1) {
    vec3 hsv = rgb2hsvSat(rgb);
    hsv.x = fract(hsv.x + 0.5);
    rgb = hsv2rgbSat(hsv);
  }
  float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 value = clamp(mix(vec3(luma), rgb, uSaturation), 0.0, 1.0);
  outColor = vec4(value, c.a);
}
`
