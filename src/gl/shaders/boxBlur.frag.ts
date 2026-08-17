/**
 * Separable box blur, same continuous-radius sampling pattern as
 * erosionRgb.frag.ts (fixed sample count subdividing [0, uRadius] rather
 * than stepping by whole texels) but averaging instead of taking a min.
 *
 * Used as a fixed, small denoise pre-pass ahead of Path F's Sobel edge
 * detection (findEdges.frag.ts) — real photos/scans/exports carry
 * per-pixel JPEG-blocking and fine brush-texture noise that a raw,
 * unblurred gradient operator picks up as spurious per-channel edges,
 * producing scattered colored speckle artifacts in flat/shaded regions
 * (skin tone, cel-shading) instead of clean shape boundaries. Blurring the
 * edge-detection input (not the final composited color — the multiply
 * base stays the sharp original) trades a little edge sharpness for a lot
 * less noise, the same tradeoff a Canny-style detector makes by design.
 * This is the spec's "Tier 1 denoise" pulled forward because Path F needed
 * it, not a general-purpose denoise feature yet.
 *
 * Blurs alpha alongside RGB (full vec4 average) so a real per-pixel coverage alpha (see
 * findEdges.frag.ts) survives this pass instead of being clobbered to 1.0 — relevant when
 * this program runs inside runSoftHardness on Fumiko's eroded edge map (negative hardness).
 * Safe no-op for every other caller (this pass's own pre-detection blur, sharpen pre-blur,
 * Gumi/Hinata/Tsukiko blurs) whose source is always opaque (alpha=1) going in.
 */
export const boxBlurFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform vec2 uTexelSize;
uniform float uRadius;
out vec4 outColor;

const int SAMPLES = 8;

void main() {
  vec4 sum = texture(uSource, vUV);
  float weight = 1.0;
  for (int i = 1; i <= SAMPLES; i++) {
    float t = uRadius * float(i) / float(SAMPLES);
    vec2 offset = uDirection * uTexelSize * t;
    sum += texture(uSource, vUV + offset);
    sum += texture(uSource, vUV - offset);
    weight += 2.0;
  }
  outColor = sum / weight;
}
`
