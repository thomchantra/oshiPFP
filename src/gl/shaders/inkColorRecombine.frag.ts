/**
 * Responsive edge color grow, pass 3/3: recombines the independently-grown
 * white-ink and black-ink masks (see inkColorMask.frag.ts) back into one
 * Pattern-B ink texture (rgb=color, alpha=strength). At each pixel, the
 * stronger of the two grown masks wins outright — not a blend of the two
 * colors, which would produce muddy gray at any point the two grown
 * regions overlap (a real possibility right at a polarity transition,
 * where a white-favoring and black-favoring region are now dilated toward
 * each other).
 *
 * uBias (-1..1, 0=neutral) lets white or black win competitions it
 * wouldn't otherwise — scales one side up before the comparison, not
 * after, so it also affects which color reaches further at an ambiguous
 * boundary, not just which one looks stronger once both are already
 * there.
 */
export const inkColorRecombineFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uGrownWhite;
uniform sampler2D uGrownBlack;
uniform float uBias;
out vec4 outColor;

void main() {
  float white = texture(uGrownWhite, vUV).r * (1.0 + max(uBias, 0.0));
  float black = texture(uGrownBlack, vUV).r * (1.0 - min(uBias, 0.0));
  float alpha = clamp(max(white, black), 0.0, 1.0);
  vec3 color = white >= black ? vec3(1.0) : vec3(0.0);
  outColor = vec4(color, alpha);
}
`
