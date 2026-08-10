/**
 * Gumi (Path G) taper/antialiasing fix: a soft alternative to
 * threshold.frag.ts's hard step. The band-weight coming out of
 * plateauRamp.frag.ts is already continuous (that's the whole point of
 * "feather"), but the hard threshold immediately collapses it to binary
 * 0/1 — which is why a tapering stroke's faint tip (weak but real signal)
 * reads as flatly *absent* rather than fading out, and why edges look
 * stair-stepped: a step function has no antialiasing by construction.
 *
 * This replaces the hard comparison with `smoothstep(threshold-softness,
 * threshold+softness, luminance)` — same polarity/uInvert convention as
 * threshold.frag.ts, but the output is a genuine gradient across the
 * transition band instead of a cliff. Downstream stages don't need to
 * know or care: minFilter1D's min/max already operates correctly on
 * continuous values (it was never binary-only), and blobMask.frag.ts's
 * uSoftOutput mode was added specifically to stop flattening this back to
 * binary at the blob-suppression step.
 */
export const softThresholdFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uThreshold;
uniform float uSoftness;
uniform int uInvert;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // max(..., 1e-4) guards smoothstep's edge0==edge1 case (undefined per the
  // GLSL spec, divides by edge1-edge0) when uSoftness is exactly 0.
  float halfWidth = max(uSoftness, 1e-4);
  float lo = uThreshold - halfWidth;
  float hi = uThreshold + halfWidth;
  float mask = smoothstep(lo, hi, luminance);
  if (uInvert == 1) mask = 1.0 - mask;
  outColor = vec4(mask, mask, mask, 1.0);
}
`
