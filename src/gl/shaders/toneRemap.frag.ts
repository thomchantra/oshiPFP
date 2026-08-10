/**
 * Composite-readiness remap for Path H/I's raw, neutral-gray-centered
 * output (High Pass / Laplacian — flat regions sit at ~0.5, edges deviate
 * up/down from it). Blending that directly is awkward: every blend mode
 * has a different "no-op" identity value (multiply's is 1, screen's is 0,
 * overlay's is the 0.5 these paths already sit at for free — which is why
 * routing raw output straight to overlay works without any remap at all).
 *
 * This computes a deviation-from-neutral magnitude (0 at flat regions,
 * rising toward 1 at strong edges, `uGain`-amplified) and maps it onto
 * whichever blend mode's identity element the caller is targeting:
 * uTarget=0 ("multiply-ready"): background -> 1 (multiply no-op),
 *   edges -> low (darken) — matches every other mask-mode path's
 *   0=ink/1=background convention.
 * uTarget=1 ("screen/additive-ready"): background -> 0 (screen no-op),
 *   edges -> high (brighten) — screen's identity is the opposite of
 *   multiply's, so this is deliberately NOT the same polarity as above.
 *
 * uGain and uContrast are deliberately separate knobs, not one overloaded
 * slider: uGain is a linear multiplier on the raw deviation *before* it
 * clamps to 0-1 — how much signal gets through at all. uContrast reshapes
 * the surviving 0-1 range via a power curve (pow(x, 1/uContrast)) — how
 * weak-vs-strong edges sit *relative to each other* once gain has already
 * decided they're present. High gain with low contrast can still read as
 * flat/washed-out (everything saturates together); high contrast is what
 * separates a subtle painting-gradient edge from a strong one.
 */
export const toneRemapFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform int uTarget;
uniform float uGain;
uniform float uContrast;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  vec3 deviation = clamp(abs(c - 0.5) * 2.0 * uGain, 0.0, 1.0);
  deviation = pow(deviation, vec3(1.0 / uContrast));
  vec3 result = uTarget == 1 ? deviation : (1.0 - deviation);
  outColor = vec4(result, 1.0);
}
`
