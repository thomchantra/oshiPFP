/**
 * Two-texture "top-hat" combine for Gumi's Top-Hat cleanup mode (see pipeline.ts's pathG branch
 * and types.ts's gumiTopHatMode doc comment). Outputs 1 (background) where the two masks agree, 0
 * (ink) where they disagree — matching the pipeline's 0=ink/1=background mask convention directly,
 * no separate invert pass needed. uBefore is the raw (deliberately overshot) threshold mask,
 * uAfter is that same mask eroded by a small radius: a stroke thinner than the erosion radius
 * vanishes entirely in uAfter (the whole stroke disagrees with uBefore, so it survives as ink
 * here); a blob wider than the erosion radius keeps an eroded interior core that still agrees with
 * uBefore there (the interior drops out, only its boundary ring — where the two disagree —
 * survives as ink).
 */
export const topHatDifferenceFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uBefore;
uniform sampler2D uAfter;
out vec4 outColor;

void main() {
  float before = texture(uBefore, vUV).r;
  float after = texture(uAfter, vUV).r;
  float agree = 1.0 - abs(before - after);
  outColor = vec4(agree, agree, agree, 1.0);
}
`
