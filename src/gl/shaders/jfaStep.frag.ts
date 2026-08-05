/**
 * Line-art expansion Path B, pass 2/3: one jump-flooding propagation step.
 * Each pixel checks its current best seed plus 8 neighbors offset by
 * uStep texels, keeping whichever is closest. Run repeatedly with uStep
 * halving each pass (starting near max(width,height)/2, ending at 1) —
 * the standard JFA schedule — the seed texture converges to each pixel's
 * true nearest-line-pixel position after ceil(log2(max(width,height)))
 * passes. Ping-ponged between two float targets by labPipeline.ts.
 */
export const jfaStepFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uSeed;
uniform vec2 uTexelSize;
uniform float uStep;
out vec4 outColor;

void main() {
  vec2 offsets[8] = vec2[8](
    vec2(-1.0, -1.0), vec2(0.0, -1.0), vec2(1.0, -1.0),
    vec2(-1.0,  0.0),                  vec2(1.0,  0.0),
    vec2(-1.0,  1.0), vec2(0.0,  1.0), vec2(1.0,  1.0)
  );

  vec4 best = texture(uSeed, vUV);
  float bestDist = best.x < -1.0e5 ? 1.0e10 : distance(gl_FragCoord.xy, best.xy);

  for (int i = 0; i < 8; i++) {
    vec2 sampleUV = vUV + offsets[i] * uStep * uTexelSize;
    vec4 cand = texture(uSeed, sampleUV);
    if (cand.x > -1.0e5) {
      float d = distance(gl_FragCoord.xy, cand.xy);
      if (d < bestDist) {
        bestDist = d;
        best = cand;
      }
    }
  }

  outColor = best;
}
`
