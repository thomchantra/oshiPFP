/**
 * Hinata Tuning Saga Phase 2 — Edge (Responsive Edge Color)'s independent per-polarity fill-type
 * resolution, a separate final pass after responsiveEdgeColor.frag.ts's (and, if Grow is active,
 * inkColorMask/minFilter1D/inkColorRecombine's) shape decision — same "resolve color after shape"
 * pattern as maskFillColor.frag.ts, but Edge needs two independent fill-type configs (one per
 * polarity) instead of one, so it gets its own dedicated shader rather than reusing
 * fillTypeColor.frag.ts's single-config machinery.
 *
 * Zero upstream changes needed to make this work: responsiveEdgeColor.frag.ts/inkColorMask.frag.
 * ts/inkColorRecombine.frag.ts already emit exactly what this pass needs — .rgb is a pure white/
 * black polarity marker (1=ink drawn over a locally-dark area, 0=ink drawn over a locally-light
 * area; see their own doc comments), .a is ink strength. This pass just reinterprets that
 * existing marker as a polarity selector instead of a literal final color, and resolves the real
 * output color from it — solid or sampled straight from the original image, independently for
 * each side. Defaults (dark-side solid white, light-side solid black) reproduce today's hardcoded
 * output exactly, so switching either side to 'image' is the only way this changes existing looks.
 */
export const edgeFillColorFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uInk;
uniform sampler2D uOriginal;
uniform int uDarkFillType;
uniform vec3 uDarkSolidColor;
uniform int uLightFillType;
uniform vec3 uLightSolidColor;
out vec4 outColor;

void main() {
  vec4 ink = texture(uInk, vUV);
  bool isDarkRegion = ink.r > 0.5;
  vec3 imageColor = texture(uOriginal, vUV).rgb;
  vec3 darkColor = uDarkFillType == 1 ? uDarkSolidColor : imageColor;
  vec3 lightColor = uLightFillType == 1 ? uLightSolidColor : imageColor;
  vec3 color = isDarkRegion ? darkColor : lightColor;
  outColor = vec4(color, ink.a);
}
`
