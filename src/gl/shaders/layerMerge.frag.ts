/**
 * Standard (non-premultiplied-source) Porter-Duff "over" — merges two independently
 * rendered RGBA layers into one. Built for Gumi's Dual Line mode (v0.3 tuning saga,
 * session 14), which runs two independent band-detection+fill chains (Black Line /
 * White Line) that need to be combined into a single result. Neither existing shared
 * program fits: composite.frag.ts's blendLayer()/compositeFrag loop samples one single
 * uMask texture repeatedly (built for stacking N copies of the *same* result, not
 * merging two different ones), and mixBlend.frag.ts's mixBlendProgram hardcodes output
 * alpha to 1.0 (discards alpha entirely, not alpha-aware).
 */
export const layerMergeFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTop;
uniform sampler2D uBottom;
out vec4 outColor;

void main() {
  vec4 top = texture(uTop, vUV);
  vec4 bottom = texture(uBottom, vUV);
  float outA = top.a + bottom.a * (1.0 - top.a);
  vec3 outRGB = outA > 0.0
    ? (top.rgb * top.a + bottom.rgb * bottom.a * (1.0 - top.a)) / outA
    : vec3(0.0);
  outColor = vec4(outRGB, outA);
}
`
