/**
 * Path F (Fumiko) "Saturation" — applied once to the fully-resolved ink
 * layer (post erosion/dilate, post tint-or-vivid recolor) right before
 * compositing, so it reads as one master saturation knob across all 3
 * color modes (Find Edge, Tint, Vivid) instead of only affecting Find
 * Edge's raw Sobel fringing the way it used to inside findEdges.frag.ts.
 * Standard luma-mix saturation on .rgb only — .a (how much ink is here,
 * see composite.frag.ts) passes through untouched, so this never changes
 * *where* ink shows up, only how colorful it is once it does.
 */
export const saturationAdjustFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uSaturation;
out vec4 outColor;

void main() {
  vec4 c = texture(uSource, vUV);
  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 value = clamp(mix(vec3(luma), c.rgb, uSaturation), 0.0, 1.0);
  outColor = vec4(value, c.a);
}
`
