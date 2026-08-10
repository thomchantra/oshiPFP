/**
 * Gumi (Path G) fill-layer MVP — cheap version of an Illustrator Live
 * Trace-style Fill/Stroke split. Reuses the exact same JFA distance field
 * blobMask.frag.ts uses for blob suppression (uSeed, seeded from
 * background — see distanceSeed.frag.ts's uInvert=1) but flips which side
 * of uBlobMaxDt is kept: blobMask keeps the near-boundary stroke pixels
 * and rejects deep interiors; this keeps the deep interiors (the
 * "fill/shading" regions the stroke layer explicitly excludes) and
 * rejects everything near a line.
 *
 * Deliberately not a real flood-fill/posterize — a kept pixel just passes
 * the *original* source color through unmodified (rgb=uOriginal sample,
 * alpha=1), the same "second source of truth" idea discussed with the
 * user: the line trace's own distance field is what validates a pixel as
 * genuinely deep inside a region, not the color classification alone.
 * Composited with Replace blend, a pass-through pixel is indistinguishable
 * from the untouched base by design — this is meant to be inspected via
 * the lab's "Raw output" view (which shows this layer in isolation), not
 * judged from the composited view, to gauge whether the concept is worth
 * building into real flattened-region fills later.
 */
export const fillMaskFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSeed;
uniform sampler2D uMask;
uniform sampler2D uOriginal;
uniform float uBlobMaxDt;
out vec4 outColor;

void main() {
  vec4 seed = texture(uSeed, vUV);
  float mask = texture(uMask, vUV).r;
  bool isLineCandidate = mask < 0.5;
  bool hasSeed = seed.x > -1.0e5;
  float dist = hasSeed ? distance(gl_FragCoord.xy, seed.xy) : 1.0e10;
  bool isFillInterior = isLineCandidate && dist > uBlobMaxDt;
  vec3 color = texture(uOriginal, vUV).rgb;
  float alpha = isFillInterior ? 1.0 : 0.0;
  outColor = vec4(color, alpha);
}
`
