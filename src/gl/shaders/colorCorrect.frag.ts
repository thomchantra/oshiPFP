/**
 * Line-art expansion lab: global color-correction stage, applied once
 * right after the source is normalized (see labPipeline.ts's
 * `correctedTarget`), feeding the *detection* input of the binary/threshold
 * line-art paths (v1-reference, Path B, Path D, Path F) — never the base
 * image the composite darkens (`uBase`/`uOverlay` always stay bound to the
 * uncorrected `normalizedTarget`) and never Path B's color-expansion "real
 * line color" sample (`uOriginal` on distanceToEdge.frag.ts). The point is
 * purely to tune what luminance/gradient the detection step sees — a scan
 * with crushed shadows or blown highlights can hide or over-trigger real
 * line strokes — without changing what the final image looks like.
 *
 * Path A/C are deliberately NOT wired to this target: their erosion IS the
 * output color (continuous per-channel min, no separate binary mask), so
 * correcting their input would recolor the final composited result, which
 * contradicts "leaving original image untouched." They stay on the
 * uncorrected source until/unless a dual-track (corrected-for-detection,
 * original-for-color) split is worth the added complexity.
 *
 * Order: exposure (EV-style multiplicative stop) -> black/white clip (a
 * standard Levels remap — pushes the shadow floor up / highlight ceiling
 * down, then rescales the surviving range back to [0,1]) -> contrast (the
 * same pivot-at-0.5 curve used elsewhere in this project, e.g. Path B's
 * uColorContrast). This is the conventional exposure-then-levels-then-
 * contrast order most photo tools use.
 */
export const colorCorrectFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSource;
uniform float uExposure;
uniform float uContrast;
uniform float uBlackClip;
uniform float uWhiteClip;
out vec4 outColor;

void main() {
  vec3 c = texture(uSource, vUV).rgb;

  c *= pow(2.0, uExposure);

  float range = max(uWhiteClip - uBlackClip, 0.001);
  c = clamp((c - uBlackClip) / range, 0.0, 1.0);

  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);

  outColor = vec4(c, 1.0);
}
`
