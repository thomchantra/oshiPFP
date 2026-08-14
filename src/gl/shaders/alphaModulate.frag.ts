/**
 * Multiplies one channel of `uBase` — whichever carries that pass's ink-weight, `uBaseChannel`
 * picks red or alpha, same convention maskFillColor.frag.ts's uMaskChannel already uses — by a
 * second grayscale mask's own red channel, leaving every other channel of `uBase` untouched.
 *
 * Built for Daiya's soft-threshold feature (session 17, pipeline.ts's pathD branch): JFA's
 * distance transform needs a strictly binary seed mask, so a soft/antialiased threshold can't
 * replace it directly — but multiplying a separately-computed soft threshold weight into the
 * *already-grown* mask's alpha achieves a similar "smooth the boundary transition, don't flatten
 * a gradient source into a hard step" effect without touching JFA's seeding at all.
 *
 * uMaskGain (session 17 follow-up) — the raw smoothstep mask reads as faint/washed-out at any
 * real softness width (most of the transition band sits well under full alpha), so this boosts it
 * (`clamp(maskVal * uMaskGain, 0, 1)`) back toward solid before it's multiplied in, while the
 * smoothstep shape itself still keeps the very edge genuinely soft. 1 = identity/no boost.
 */
export const alphaModulateFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uBase;
uniform sampler2D uMask;
uniform int uBaseChannel;
uniform float uMaskGain;
out vec4 outColor;

void main() {
  vec4 base = texture(uBase, vUV);
  float maskVal = clamp(texture(uMask, vUV).r * uMaskGain, 0.0, 1.0);
  if (uBaseChannel == 0) {
    outColor = vec4(base.r * maskVal, base.g, base.b, base.a);
  } else {
    outColor = vec4(base.rgb, base.a * maskVal);
  }
}
`
