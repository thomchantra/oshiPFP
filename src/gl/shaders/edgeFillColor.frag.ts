/**
 * Edge (Responsive Edge Color)'s independent per-polarity fill-type resolution, a separate final
 * pass after responsiveEdgeColor.frag.ts's (and, if Grow is active, inkColorMask/minFilter1D/
 * inkColorRecombine's) shape decision — same "resolve color after shape" pattern as
 * maskFillColor.frag.ts, but Edge needs two independent fill-type configs (one per polarity)
 * instead of one, so it gets its own dedicated shader rather than reusing fillTypeColor.frag.ts's
 * single-config machinery.
 *
 * responsiveEdgeColor.frag.ts/inkColorMask.frag.ts/inkColorRecombine.frag.ts emit exactly what
 * this pass needs — .rgb is a pure white/black polarity marker (1=ink drawn over a locally-dark
 * area, 0=ink drawn over a locally-light area; see their own doc comments), .a is ink strength.
 * This pass reinterprets that marker as a polarity selector instead of a literal final color, and
 * resolves the real output color from it — solid or sampled straight from the original image,
 * independently for each side.
 */
export const edgeFillColorFrag = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uInk;
uniform sampler2D uOriginal;
uniform int uDarkFillType;
uniform vec3 uDarkSolidColor;
uniform float uDarkColorContrast;
uniform float uDarkExposure;
uniform int uLightFillType;
uniform vec3 uLightSolidColor;
uniform float uLightColorContrast;
uniform float uLightExposure;
uniform int uInvertFill;
out vec4 outColor;

vec3 adjustImage(vec3 c, float contrast, float exposure) {
  return clamp((c - 0.5) * contrast + 0.5 + exposure, 0.0, 1.0);
}

void main() {
  vec4 ink = texture(uInk, vUV);
  bool isDarkRegion = ink.r > 0.5;
  vec3 imageColor = texture(uOriginal, vUV).rgb;
  vec3 darkColor = uDarkFillType == 1 ? uDarkSolidColor : adjustImage(imageColor, uDarkColorContrast, uDarkExposure);
  vec3 lightColor = uLightFillType == 1 ? uLightSolidColor : adjustImage(imageColor, uLightColorContrast, uLightExposure);
  vec3 color = isDarkRegion ? darkColor : lightColor;
  float coverage = uInvertFill == 1 ? 1.0 - ink.a : ink.a;
  outColor = vec4(color, coverage);
}
`
