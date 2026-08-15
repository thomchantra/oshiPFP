/**
 * Gumi (Path G) fill-layer — cheap version of an Illustrator Live
 * Trace-style Fill/Stroke split. Reuses the exact same JFA distance field
 * blobMask.frag.ts uses for blob suppression but flips which side of
 * uBlobMaxDt is kept: blobMask keeps the near-boundary stroke pixels and
 * rejects deep interiors; this keeps the deep interiors (the
 * "fill/shading" regions the stroke layer explicitly excludes) and rejects
 * everything near a line.
 *
 * uInvert flips which side of the closed mask counts as the fill candidate —
 * off (default) targets the *ink* region's deep interior (e.g. large flat
 * shadow blobs); on targets the *background* region's deep interior instead
 * (e.g. skin/highlight areas). This only flips the polarity of the
 * isCandidate test here — pipeline.ts is responsible for seeding uSeed's
 * distance transform from the matching side (depth has to be measured into
 * whichever region is now the candidate one, or `dist` means nothing).
 *
 * uFillType picks what color a kept pixel resolves to: 'image' (0) passes
 * the original source color through unmodified — a kept pixel is then
 * indistinguishable from the untouched base once composited with Replace
 * blend, by design (see the lab's "Raw output" view for inspecting this
 * layer in isolation). 'solid' (1) uses a single flat uSolidColor.
 * 'gradient' (2) reuses gradientMap.frag.ts's own 3-stop luminance recolor
 * math verbatim, gated to just this fill selection instead of painted
 * across the whole image.
 *
 * uGamma/uPixelThreshold reshape the boundary decision the same way as
 * blobMask.frag.ts — see that shader's doc comment, including why the
 * falloff is confined to a thin band near uBlobMaxDt (aaWidth) rather than
 * spanning the whole radius. uPixelThreshold=1 bypasses the distance
 * falloff entirely (a raw per-pixel isCandidate test, no
 * uBlobMaxDt/uGamma involved).
 *
 * Color resolution (uFillType/uSolidColor/uShadowColor/uMidColor/uHighlightColor) factored
 * out into fillTypeColor.frag.ts — shared with Line mode's own fill-type support, see
 * lineFillColor.frag.ts.
 */
import { fillTypeColorUniforms, resolveFillTypeColorFn } from './fillTypeColor.frag'

export const fillMaskFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSeed;
uniform sampler2D uMask;
uniform float uBlobMaxDt;
uniform float uGamma;
uniform int uInvert;
uniform int uPixelThreshold;
${fillTypeColorUniforms}
out vec4 outColor;

${resolveFillTypeColorFn}

void main() {
  vec4 seed = texture(uSeed, vUV);
  float mask = texture(uMask, vUV).r;
  bool isCandidate = uInvert == 1 ? mask >= 0.5 : mask < 0.5;
  bool hasSeed = seed.x > -1.0e5;
  float dist = hasSeed ? distance(gl_FragCoord.xy, seed.xy) : 1.0e10;

  float alpha;
  if (uPixelThreshold == 1) {
    alpha = isCandidate ? 1.0 : 0.0;
  } else {
    float aaWidth = max(uBlobMaxDt * 0.15, 0.5);
    float edgeStart = max(uBlobMaxDt - aaWidth, 0.0);
    float t = clamp((dist - edgeStart) / aaWidth, 0.0, 1.0);
    float acceptWeight = pow(t, uGamma);
    alpha = isCandidate ? acceptWeight : 0.0;
  }

  vec3 color = resolveFillTypeColor(vUV);
  outColor = vec4(color, alpha);
}
`
