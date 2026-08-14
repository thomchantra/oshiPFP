/**
 * Line-art expansion Path B, pass 3/3: threshold the converged JFA
 * distance field with a smoothstep to get the final grown edge — a true
 * circular structuring element (exact roundness, unlike the two-pass
 * separable min filter's square/Chebyshev shape), with antialiasing and a
 * floor falling out of the smoothstep for free.
 *
 * Outputs straight (non-premultiplied) ink color in .rgb and how much ink
 * is here in .a (1.0 at the seed/line core, 0.0 once past uRadius+uFeather)
 * — composite.frag.ts is what actually combines this with the base image
 * (blend mode + opacity), so this pass doesn't need to know or care what
 * blend mode is selected; alpha=0 pixels always resolve back to the
 * untouched base regardless of blend mode, since compositing is a
 * `mix(base, blendLayer(base, ink, mode), alpha * opacity)`, not a
 * pre-baked fade into any particular "no-op" color here.
 *
 * Two ways to resolve the ink color, switched by uColorExpansion:
 * - Off (default): a flat, user-picked uLineColor (defaults to black — the
 *   original solid-black look).
 * - On: instead of flat black, resolves each grown pixel toward the
 *   *actual source color* of the nearest line pixel (sampled from
 *   uOriginal at the seed's stored position) — Path A's "floor at a real
 *   neighborhood value instead of synthetic black" idea, applied to Path
 *   B's true-circular grow instead of separable erosion.
 *
 * uGamma reshapes the same falloff (t) that drives alpha via
 * pow(t, gamma) — gamma > 1 pushes t down (more of the grown region stays
 * close to full ink, blobs read darker/larger); gamma < 1 pushes it up
 * (blobs read lighter/smaller). One contrast knob for the grown regions'
 * *spatial extent* (how far the effect reaches), independent of
 * radius/feather.
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
 *
 * uFeather-vs-uRadius clamp (v0.3, session 17 bug fix): the lower smoothstep edge is
 * `max(uRadius - uFeather, 0.0)`, not the raw `uRadius - uFeather`. `dist` (from `distance()`)
 * is never negative, so once uFeather exceeds uRadius the raw lower edge goes negative and
 * `dist == 0` (the true core/seed pixel) stops landing before that edge — smoothstep no longer
 * guarantees `t == 0` there, so even the solid interior of a shape loses opacity at strongly
 * negative Hardness. Confirmed on Daiya (HARDNESS_BASE_MAX_FEATHER lets feather run well past
 * typical radius values there), but this shader is shared with Botan too, same latent bug.
 *
 * uInvert (v0.3 Service Update) — only meaningful for Botan's `fillType === 'image'` case, where
 * shape and color stay fused in this one pass (see pipeline.ts's pathB branch) instead of running
 * through the shared maskFillColor.frag.ts final pass every other fillType/algorithm uses; this
 * flips the resolved alpha itself (t instead of 1-t) so "background instead of near-line glow"
 * means the same thing here as maskFillColor.frag.ts's uInvert does everywhere else.
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
uniform vec3 uLineColor;
uniform int uInvert;
out vec4 outColor;

void main() {
  vec4 seed = texture(uSeed, vUV);
  bool hasSeed = seed.x > -1.0e5;
  float dist = hasSeed ? distance(gl_FragCoord.xy, seed.xy) : 1.0e10;
  float edge0 = max(uRadius - uFeather, 0.0);
  float edge1 = uRadius + uFeather;
  float t = pow(clamp(smoothstep(edge0, edge1, dist), 0.0, 1.0), uGamma);

  vec3 seedColor;
  if (uColorExpansion == 1) {
    vec3 base = texture(uOriginal, vUV).rgb;
    seedColor = hasSeed ? texture(uOriginal, seed.xy / uTexSize).rgb : base;
    seedColor = clamp((seedColor - 0.5) * uColorContrast + 0.5, 0.0, 1.0);
  } else {
    seedColor = uLineColor;
  }
  float alpha = uInvert == 1 ? t : 1.0 - t;
  outColor = vec4(seedColor, alpha);
}
`
