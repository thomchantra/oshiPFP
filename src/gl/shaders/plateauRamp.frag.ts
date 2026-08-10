/**
 * Preprocessing lab candidate: 4-point plateau/feather luminance-band
 * isolation, an alternative to colorCorrect.frag.ts's 2-point black/white
 * clip. Instead of stretching the whole tonal range, this carves out a
 * band — `uInnerLow`..`uInnerHigh` reads as fully "selected" (weight=1),
 * `uFloor`/`uCeiling` are where selection has fully faded to 0, and
 * `uFeather` (0-1) controls how much of the floor->innerLow (and
 * innerHigh->ceiling) span the fade actually uses:
 *   uFeather=0 -> rampStart snaps to uInnerLow itself (zero-width ramp,
 *                 i.e. a hard step right at the inner point)
 *   uFeather=1 -> rampStart snaps to uFloor (fade spans the full
 *                 floor->innerLow span, the softest option)
 * Same idea mirrored on the ceiling side via rampEnd. Output is a
 * grayscale band-weight replicated across RGB — same shape as
 * colorCorrect.frag.ts's output — so it drops into the same detection-input
 * slot downstream (threshold/edge-detection paths sample it exactly as
 * they'd sample the color-corrected source).
 *
 * The `- 1e-4` nudges guard smoothstep's edge0==edge1 case (undefined per
 * the GLSL spec, since it divides by edge1-edge0), which would otherwise
 * fire whenever uFeather=0 or uFloor==uInnerLow.
 */
export const plateauRampFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uFloor;
uniform float uInnerLow;
uniform float uInnerHigh;
uniform float uCeiling;
uniform float uFeather;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;
  float luminance = dot(c, vec3(0.2126, 0.7152, 0.0722));

  float rampStart = min(mix(uInnerLow, uFloor, uFeather), uInnerLow - 1e-4);
  float rampEnd = max(mix(uInnerHigh, uCeiling, uFeather), uInnerHigh + 1e-4);

  float rising = smoothstep(rampStart, uInnerLow, luminance);
  float falling = 1.0 - smoothstep(uInnerHigh, rampEnd, luminance);
  float weight = min(rising, falling);

  outColor = vec4(weight, weight, weight, 1.0);
}
`
