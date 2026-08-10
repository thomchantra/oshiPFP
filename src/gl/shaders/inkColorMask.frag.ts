/**
 * Responsive edge color grow, pass 1/3: splits the resolved ink mask
 * (rgb=color, alpha=strength — Pattern B, see responsiveEdgeColor.frag.ts)
 * into a single-channel "how much white ink here" or "how much black ink
 * here" mask, picked by uTargetWhite. Ink color is always exactly white or
 * black (never in between) at this point, so `.r > 0.5` is a reliable
 * color test.
 *
 * The reason to split before growing rather than growing the RGBA texture
 * directly: minFilter1D's max mode picks the numerically largest neighbor
 * *per channel independently* — grown naively on raw RGB, that biases
 * every growth step toward whichever color has the higher channel value
 * (white always wins, since 1 > 0 in every channel), silently erasing
 * black ink wherever a white and black stroke pass near each other. Two
 * independent single-channel masks each grow via ordinary minFilter1D
 * max-mode (already built, no new grow logic needed), and
 * inkColorRecombine.frag.ts picks the winner per pixel afterward — so
 * growth never mixes or overwrites the two colors mid-process.
 */
export const inkColorMaskFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uInk;
uniform int uTargetWhite;
out vec4 outColor;

void main() {
  vec4 ink = texture(uInk, vUV);
  bool isWhite = ink.r > 0.5;
  bool wantsWhite = uTargetWhite == 1;
  float m = (isWhite == wantsWhite) ? ink.a : 0.0;
  outColor = vec4(m, m, m, 1.0);
}
`
