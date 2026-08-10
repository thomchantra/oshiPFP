/**
 * Gumi (Path G) blob suppression: given a converged JFA distance field
 * (uSeed — see distanceSeed.frag.ts's uInvert=1, jfaStep.frag.ts) seeded
 * from the *background* of the closed line-band mask (uMask, in the
 * project-standard 0=line/1=background polarity — see threshold.frag.ts's
 * uInvert), this measures how deep each line-candidate pixel sits inside
 * its own region. A genuine stroke is thin, so every interior pixel stays
 * close to the region's own boundary (small distance); a filled
 * blob/shading region is wide, so its interior pixels sit far from any
 * boundary (large distance). Thresholding on that distance rejects blob
 * interiors while keeping strokes intact — the "erosion-by-blobMaxDt via
 * distance transform" trick from the Gumi spec, done in one pass instead
 * of an actual iterative erosion.
 *
 * Output stays in the same 0=ink/1=background polarity as the input mask
 * — a rejected blob-interior pixel resolves to 1 (falls back to
 * untouched base through composite.frag.ts's multiply, same as if it had
 * never been detected), not to some separate "reject" signal.
 *
 * uSoftOutput (default 0, every existing call site unaffected) is the
 * other half of the taper/antialiasing fix started in softThreshold.
 * frag.ts: the default (0) collapses a kept pixel flatly to 0 — correct
 * for the hard-threshold path, but it would re-flatten the continuous
 * gradient softThreshold produces right back to binary at this stage. At
 * 1, a kept pixel keeps whatever continuous value `uMask` already had
 * instead of flattening it — since composite.frag.ts's multiply blend
 * already treats intermediate values as partial ink (partial darkening),
 * this is enough on its own to make faint taper tips fade out instead of
 * being cut off, no separate alpha channel needed.
 *
 * uSoftOutput also loosens the line-candidate gate itself, not just the
 * output value — `mask < 0.5` is the right split for a binary mask (a
 * pixel is either clearly ink or clearly background, nothing between),
 * but a soft mask has real values all the way from 0 to 1, and the
 * fading tail of a taper is specifically the part sitting *above* 0.5
 * (weak-but-real signal). Gating on 0.5 in soft mode would silently
 * reject exactly the pixels this fix exists to preserve, before
 * uSoftOutput ever got a chance to keep them.
 */
export const blobMaskFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSeed;
uniform sampler2D uMask;
uniform float uBlobMaxDt;
uniform int uSoftOutput;
out vec4 outColor;

void main() {
  vec4 seed = texture(uSeed, vUV);
  float mask = texture(uMask, vUV).r;
  bool isLineCandidate = uSoftOutput == 1 ? mask < 0.999 : mask < 0.5;
  bool hasSeed = seed.x > -1.0e5;
  float dist = hasSeed ? distance(gl_FragCoord.xy, seed.xy) : 1.0e10;
  bool keepAsInk = isLineCandidate && dist <= uBlobMaxDt;
  float kept = uSoftOutput == 1 ? mask : 0.0;
  float result = keepAsInk ? kept : 1.0;
  outColor = vec4(result, result, result, 1.0);
}
`
