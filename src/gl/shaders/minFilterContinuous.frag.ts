/**
 * Continuous-radius sibling of minFilter1D.frag.ts — same separable min/max
 * dilate/erode, but the integer texel-offset loop (which can only change
 * radius in whole-texel jumps) is replaced with erosionRgb.frag.ts's
 * fixed-sample-count technique: subdivide [0, uRadius] into `samples` steps
 * (`t = uRadius * i / samples`), so the slider is smooth from 0 up instead
 * of dead between integers.
 *
 * Sample count scales with radius (SAMPLES_PER_TEXEL) rather than a flat
 * constant like erosionRgb.frag.ts's 32 — that shader's usable radius tops
 * out around ~3 texels, but Gumi's Detection Radius (this shader's reason
 * for existing) ranges 0-40 and runs on every render, not gated behind
 * dirty-tracking the way Botan/Daiya's JFA seed is. A flat high sample
 * count would regress the common case (small radius, every slider drag);
 * scaling keeps small radii cheap while still sampling large ones finely.
 * `samples` is derived from the uRadius uniform, constant for the whole
 * draw call, so the early `break` stays a warp-uniform branch — same
 * efficiency reasoning as minFilter1D.frag.ts's own doc comment.
 *
 * Deliberately a separate program from minFilterProgram rather than an
 * in-place edit — minFilterProgram has 7+ other consumers (Gap Closing,
 * Chie/Fumiko's erosion, Fumiko/Tsukiko's own grow post-process) that
 * don't need this and would all need touching just to keep the shared
 * uRadius uniform's type consistent. Scoped to Gumi's Detection Radius and
 * Overdrive only.
 */
export const minFilterContinuousFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform vec2 uTexelSize;
uniform float uRadius;
uniform int uMode;
out vec4 outColor;

const int MAX_SAMPLES = 96;
const float SAMPLES_PER_TEXEL = 2.0;

void main() {
  float m = texture(uSource, vUV).r;
  int samples = min(MAX_SAMPLES, int(ceil(uRadius * SAMPLES_PER_TEXEL)));
  for (int i = 1; i <= MAX_SAMPLES; i++) {
    if (i > samples) break;
    float t = uRadius * float(i) / float(samples);
    vec2 offset = uDirection * uTexelSize * t;
    float a = texture(uSource, vUV + offset).r;
    float b = texture(uSource, vUV - offset).r;
    if (uMode == 1) {
      m = max(m, max(a, b));
    } else {
      m = min(m, min(a, b));
    }
  }
  outColor = vec4(m, m, m, 1.0);
}
`
