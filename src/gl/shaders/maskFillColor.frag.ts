/**
 * Shared "resolve a shape/edge decision into real RGBA" final pass, used by Botan/Chie/Daiya/
 * Fumiko/Gumi Line mode (see fillMask.frag.ts's inline equivalent for Gumi Fill mode), all of
 * which resolve color as a separate step after their own shape decision rather than fusing it in
 * (see each algorithm's own pipeline.ts branch for why — Botan is the one exception, still fusing
 * shape+color for its `fillType === 'image'` case to preserve its continuous falloff behavior).
 *
 * Deliberately its own separate pass rather than folding into any algorithm's own shape shader:
 * several of those shaders (blobMask.frag.ts via Overdrive/Hardness's minFilter1D.frag.ts/
 * boxBlur.frag.ts, both shared with many other call sites) only read/write a single grayscale
 * channel and hardcode alpha=1 — widening their contract to carry real RGBA wasn't an option.
 *
 * uMask convention varies by source shape shader, selected by uMaskChannel:
 * - 0 (default — blobMask.frag.ts/erosionGate.frag.ts/minFilter1D.frag.ts's binary/grayscale
 *   masks): BT.709 luminance of mask.rgb, 0 = ink/shape, 1 = background — matches tintMask.
 *   frag.ts's formula exactly (not just mask.r), since Fumiko's findEdges.frag.ts mask is
 *   genuinely colored per-channel (Sobel), not true grayscale, and .r alone would misread it.
 * - 1 (distanceToEdge.frag.ts's continuous alpha convention, Botan only): mask.a, ink weight
 *   directly (1 = full ink at the seed, fading toward 0).
 * Both are normalized internally to a single "inkWeight" (1 = full ink) before uInvert is applied,
 * so uInvert means the same thing regardless of source convention: colors the background/far side
 * instead of the detected ink.
 */
import { fillTypeColorUniforms, resolveFillTypeColorFn } from './fillTypeColor.frag'

export const maskFillColorFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uMask;
uniform int uMaskChannel;
uniform int uInvert;
${fillTypeColorUniforms}
out vec4 outColor;

${resolveFillTypeColorFn}

void main() {
  vec4 maskSample = texture(uMask, vUV);
  float luminance = dot(maskSample.rgb, vec3(0.2126, 0.7152, 0.0722));
  float inkWeight = uMaskChannel == 1 ? maskSample.a : (1.0 - luminance);
  float alpha = uInvert == 1 ? (1.0 - inkWeight) : inkWeight;
  vec3 color = resolveFillTypeColor(vUV);
  outColor = vec4(color, alpha);
}
`
