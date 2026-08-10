/**
 * Path H (High Pass) litmus test for dual-polarity line art — real art
 * where linework is black-on-white in some regions and white-on-black in
 * others *within the same image*, which a single fixed ink-color/blend-
 * mode choice can't serve everywhere at once.
 *
 * The core premise (per user direction): don't mix multiple blend modes
 * spatially (too complex, likely jarring) — instead make the ink *color*
 * itself locally adaptive, the same spirit as Path B/Botan's color-
 * expansion (sample real nearby color instead of a flat swatch), just
 * keyed off local background lightness instead of "nearest line's own
 * color". A "rough area check" for a first pass: reuse the same blurred
 * local-neighborhood average High Pass already computes (uBlurred) as a
 * per-pixel read of "is the area around this edge dark or light overall,
 * ignoring the edge itself" — a locally dark area gets white ink, a
 * locally light area gets black ink. `uCrossover` is where that flips
 * (default 0.5); a future "adventurous" version could soften this into a
 * lighten/darken threshold ramp instead of a hard switch, deliberately
 * not built yet — this is only testing whether the core premise holds.
 *
 * Output follows the same rgb=ink-color/alpha=ink-amount convention as
 * distanceToEdge.frag.ts/tintMask.frag.ts (Pattern B in this codebase),
 * NOT the 0=ink/1=background grayscale convention (Pattern A) — the ink
 * color varies per-pixel here, so it can't be baked into a single-channel
 * multiply factor.
 *
 * Important pairing note: Multiply's identity is 1 (white), so it can
 * never render white ink at all — multiplying by white is a no-op.
 * Screen's identity is 0 (black), so it can never render black ink for
 * the same reason. Only Overlay (identity 0.5, but weak at extremes) or
 * the composite shader's unexposed "Replace" mode (0 — literal
 * alpha-composite, not a multiply/screen blend) can show ink in *both*
 * directions, which is the entire point of this mode. "Replace" is the
 * mode to reach for first when testing this.
 *
 * Zero-crossing edge detection (v2): the first version thresholded
 * |sharp - blurred| directly, which is nonzero across a whole *band*
 * spanning roughly the blur radius on either side of a real edge — and
 * since ink color re-evaluates the local-area check at every pixel in
 * that band, real art showed the polarity flipping partway across a
 * single edge, producing two parallel strokes (one white, one black)
 * instead of one clean line. Classic double-lobe/ringing behavior for
 * any difference-of-Gaussians-style operator, not specific to this mode
 * — using it to pick a *color* just made it far more visible than it
 * would be as a single flat-color mask.
 *
 * Fix, in the spirit of Marr-Hildreth/Laplacian-of-Gaussian zero-crossing
 * edge detection: compute the *signed* diff (not its magnitude) at this
 * pixel and its right/down neighbors. The true edge center is where that
 * signed value crosses zero — by construction a thin, single-pixel-wide
 * locus, not a band. Ink is only drawn exactly there; edgeStrength comes
 * from how large the jump across the crossing is (a steep, high-contrast
 * edge vs. a barely-there one), uStrength-scaled same as before. Because
 * ink now only gets drawn once per crossing instead of across a whole
 * band, the local-area color check that caused the double-stroke no
 * longer has room to flip mid-edge.
 */
export const responsiveEdgeColorFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform sampler2D uBlurred;
uniform vec2 uTexelSize;
uniform float uStrength;
uniform float uCrossover;
out vec4 outColor;

float signedDiff(vec2 uv) {
  vec3 sharp = texture(uSource, uv).rgb;
  vec3 blurred = texture(uBlurred, uv).rgb;
  float sharpLum = dot(sharp, vec3(0.2126, 0.7152, 0.0722));
  float blurredLum = dot(blurred, vec3(0.2126, 0.7152, 0.0722));
  return sharpLum - blurredLum;
}

void main() {
  float center = signedDiff(vUV);
  float right = signedDiff(vUV + vec2(uTexelSize.x, 0.0));
  float down = signedDiff(vUV + vec2(0.0, uTexelSize.y));

  float jump = 0.0;
  if (sign(center) != sign(right)) jump = max(jump, abs(center - right));
  if (sign(center) != sign(down)) jump = max(jump, abs(center - down));
  float edgeStrength = clamp(jump * uStrength, 0.0, 1.0);

  float blurredLum = dot(texture(uBlurred, vUV).rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 inkColor = blurredLum < uCrossover ? vec3(1.0) : vec3(0.0);

  outColor = vec4(inkColor, edgeStrength);
}
`
