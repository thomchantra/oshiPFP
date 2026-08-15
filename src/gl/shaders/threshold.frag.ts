/**
 * Stage 3a: luminance threshold (BT.709). Outputs a grayscale mask where
 * 0.0 = "line" (luminance below cutoff) and 1.0 = "fill" — i.e. a plain
 * black/white image with black lines, matching what a grayscale-erosion
 * ("Minimum" filter) grow pass expects: picking the darkest neighbor
 * naturally spreads (thickens) the black line regions.
 *
 * uInvert flips that polarity. This is a shared-program uniform — every call site must set it
 * explicitly every call, see CLAUDE.md's "Known Recurring Gotchas". Added for Path G/Gumi: its
 * detection input isn't "luminance below cutoff" but "band-weight above cutoff" (from
 * plateauRamp.frag.ts — a high band-weight means the pixel IS the selected line/stroke), so
 * without inversion the naive comparison would emit 1 for a detected stroke and 0 for
 * background — backwards from every other mask-mode path in this codebase (0 = line/ink,
 * 1 = fill/background). uInvert=1 flips it back at the source, so everything downstream (grow
 * direction, distance-transform seeding) can stay in the one shared convention instead of
 * needing per-path polarity patches later in the chain.
 */
export const thresholdFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uThreshold;
uniform int uInvert;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float mask = luminance < uThreshold ? 0.0 : 1.0;
  if (uInvert == 1) mask = 1.0 - mask;
  outColor = vec4(mask, mask, mask, 1.0);
}
`
