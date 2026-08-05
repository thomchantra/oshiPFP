/**
 * Line-art expansion lab: edge-aware (range-filter) denoise, ported from
 * the user's prior `denoise` Core Image kernel in referencecode/Shaders2.metal
 * — a first pass to test whether pre-cleaning noise/JPEG artifacts ahead
 * of the threshold/edge-detection stage (see colorCorrect.frag.ts, which
 * this chains after — see labPipeline.ts's runDenoise) helps the line-art
 * paths specifically, not a general-purpose filter being added for its
 * own sake.
 *
 * Same algorithm as the Metal source, ported term-for-term rather than
 * "fixed": for every neighbor within a uKernelSize-texel square, weight it
 * by exp(-colorDistanceSquared / threshold^2) — similar-colored neighbors
 * (flat regions, noise) get near-full weight and blur together; neighbors
 * across a real color edge get an exponentially small weight, so edges
 * survive. This is a *range* filter only (no spatial/Gaussian falloff
 * term the way a full bilateral filter has one) — every in-kernel
 * neighbor's spatial weight is uniform 1, exactly matching the ported
 * source. uKernelSize is computed on the CPU side from an `intensity`
 * param exactly as the Metal source did (`min(5, max(1, intensity*5))`),
 * not left as a free-form radius, to stay a faithful port for this first
 * pass. Also ported as-is: the (0,0) center tap is included in the loop
 * *in addition to* the pre-seeded `sum = centerColor, weightSum = 1`, so
 * the center is effectively double-weighted relative to an identical
 * neighbor — this looked like it could be an oversight in the original,
 * but the point of a first pass is testing the algorithm actually shipped
 * before, not a corrected version of it.
 */
export const denoiseFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform int uKernelSize;
uniform float uThreshold;
out vec4 outColor;

const int MAX_KERNEL = 5;

void main() {
  vec3 centerColor = texture(uSource, vUV).rgb;
  vec3 sum = centerColor;
  float weightSum = 1.0;
  float invThresholdSq = 1.0 / (uThreshold * uThreshold + 0.0001);

  for (int i = -MAX_KERNEL; i <= MAX_KERNEL; i++) {
    if (i < -uKernelSize || i > uKernelSize) continue;
    for (int j = -MAX_KERNEL; j <= MAX_KERNEL; j++) {
      if (j < -uKernelSize || j > uKernelSize) continue;
      vec2 offset = vec2(float(i), float(j)) * uTexelSize;
      vec3 sampleColor = texture(uSource, vUV + offset).rgb;
      vec3 diff = sampleColor - centerColor;
      float distanceSq = dot(diff, diff);
      float weight = exp(-distanceSq * invThresholdSq);
      sum += sampleColor * weight;
      weightSum += weight;
    }
  }

  outColor = vec4(sum / weightSum, 1.0);
}
`
