/**
 * Line-art expansion Path B, pass 3/3: threshold the converged JFA
 * distance field with a smoothstep to get the final grown edge — a true
 * circular structuring element (exact roundness, unlike the two-pass
 * separable min filter's square/Chebyshev shape), with antialiasing and a
 * floor falling out of the smoothstep for free.
 *
 * Two output modes, switched by uColorExpansion:
 * - Off (default): grayscale grow-mask convention (0=line/black,
 *   1=fill/white), matching v1, for multiply compositing (see
 *   labPipeline.ts's MASK_MODES) — validated as viable as-is; the solid
 *   black patches read as an intentional "textured" look on real art.
 * - On: instead of driving toward flat black, resolves each grown pixel
 *   toward the *actual source color* of the nearest line pixel (sampled
 *   from uOriginal at the seed's stored position) — Path A's "floor at a
 *   real neighborhood value instead of synthetic black" idea, applied to
 *   Path B's true-circular grow instead of separable erosion. Output is
 *   then a complete replacement color image, not a mask, so it's
 *   crossfade- (not multiply-) composited by labPipeline.ts.
 *
 * uGamma reshapes the same falloff (t) that drives both branches via
 * pow(t, gamma) — gamma > 1 pushes t down (more of the grown region stays
 * close to the seed/line color, blobs read darker/larger); gamma < 1
 * pushes it up (blobs read lighter/smaller). One contrast knob for the
 * grown regions' *spatial extent* (how far the effect reaches), independent
 * of radius/feather.
 *
 * uColorContrast is a separate knob, only meaningful in color-expansion
 * mode: a standard contrast curve (pivoted at 0.5) applied to the sampled
 * seedColor *itself* before mixing — makes dark/saturated seed colors
 * (e.g. deep shadow line work) darker or lighter, independent of gamma's
 * spatial falloff shape. Two different things both called "contrast" by
 * feel, so they get two separate uniforms rather than overloading uGamma.
 *
 * The lab's "hardness" macro (LabApp.tsx/labPipeline.ts) maps entirely
 * onto uFeather — no separate sharpen uniform. Two earlier sharpen
 * attempts (an unsharp-mask ring, then a radius-tightening trick) were
 * both dropped after real-art review; see
 * changelog/oshipfp-v0.2-lineart-saga.md for why.
 */
export const distanceToEdgeFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSeed;
uniform sampler2D uOriginal;
uniform vec2 uTexSize;
uniform float uRadius;
uniform float uFeather;
uniform float uGamma;
uniform float uColorContrast;
uniform int uColorExpansion;
out vec4 outColor;

void main() {
  vec4 seed = texture(uSeed, vUV);
  bool hasSeed = seed.x > -1.0e5;
  float dist = hasSeed ? distance(gl_FragCoord.xy, seed.xy) : 1.0e10;
  float t = pow(clamp(smoothstep(uRadius - uFeather, uRadius + uFeather, dist), 0.0, 1.0), uGamma);

  if (uColorExpansion == 1) {
    vec3 base = texture(uOriginal, vUV).rgb;
    vec3 seedColor = hasSeed ? texture(uOriginal, seed.xy / uTexSize).rgb : base;
    seedColor = clamp((seedColor - 0.5) * uColorContrast + 0.5, 0.0, 1.0);
    outColor = vec4(mix(seedColor, base, t), 1.0);
  } else {
    outColor = vec4(t, t, t, 1.0);
  }
}
`
