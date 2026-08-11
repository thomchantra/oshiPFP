/**
 * Gumi (Path G) Line mode's fill-type color resolution (v0.3 tuning) — a final pass after
 * blobMask.frag.ts's boundary decision (and Overdrive/Hardness's optical post-process, if
 * any), giving Line mode the same Image/Solid/Gradient/Invert choice Fill mode already has
 * (fillMask.frag.ts), reusing the identical color logic (fillTypeColor.frag.ts).
 *
 * Deliberately its own separate pass rather than folding straight into blobMask.frag.ts:
 * Overdrive (minFilter1D.frag.ts) and Hardness (boxBlur.frag.ts + mixBlend.frag.ts) both only
 * read/write a single grayscale channel and hardcode alpha=1 — they're shared with many other
 * call sites across the codebase, so widening their data contract to carry real RGBA wasn't
 * an option. Keeping blobMask's own output as the plain grayscale shape decision it already
 * was means Overdrive/Hardness keep working exactly as built; this pass only runs *after*
 * them, converting the (possibly reshaped) grayscale mask into real color + alpha.
 *
 * uMask is blobMask.frag.ts's own 0=ink/1=background grayscale convention (post
 * Overdrive/Hardness) — alpha here is derived as 1-mask (or mask itself when uInvert=1, to
 * color the background side instead of the detected strokes).
 */
import { fillTypeColorUniforms, resolveFillTypeColorFn } from './fillTypeColor.frag'

export const lineFillColorFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uMask;
uniform int uInvert;
${fillTypeColorUniforms}
out vec4 outColor;

${resolveFillTypeColorFn}

void main() {
  float m = texture(uMask, vUV).r;
  float alpha = uInvert == 1 ? m : (1.0 - m);
  vec3 color = resolveFillTypeColor(vUV);
  outColor = vec4(color, alpha);
}
`
