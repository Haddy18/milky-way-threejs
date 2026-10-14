/* ═══ Shaders de estrellas (catálogo real + campo galáctico)
 * Un único shader para los dos mundos:
 *  · aMag < 50  → estrella real del catálogo: brillo físico
 *                 (flujo ∝ 10^(−0,4·M) / d², comprimido a gamma
 *                 0,4 para que las débiles sigan viéndose).
 *  · aMag ≥ 50  → punto del campo procedural: intensidad fija
 *                 (son millones de estrellas resueltas en cada píxel).
 */

export const STAR_VERT = /* glsl */ `
  attribute vec4 aColor;   // rgb + intensidad (solo campo procedural)
  attribute float aMag;    // magnitud absoluta (99 = campo)
  attribute float aSize;   // px de base (a 10 pc si es real)

  uniform float uPixel;    // ratio de píxeles del dispositivo
  uniform float uBoost;    // multiplicador del campo procedural

  varying vec3 vCol;
  varying float vI;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float d = max(length(mv.xyz), 1e-4);

    float px, inten;
    if (aMag > 50.0) {
      inten = aColor.a * uBoost;
      px = aSize;
    } else {
      float flux = pow(10.0, -0.4 * aMag + 2.0) / (d * d);
      inten = min(pow(flux, 0.4) * 1.7, 14.0);
      px = clamp(aSize * 30.0 / d, 1.0, 64.0);
    }

    vCol = aColor.rgb;
    vI = inten;
    gl_PointSize = px * uPixel;
    gl_Position = projectionMatrix * mv;
  }
`;

export const STAR_FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vI;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r2 = dot(p, p);
    if (r2 > 0.25) discard;
    // halo suave + núcleo compacto
    float a = exp(-r2 * 16.0) * 0.8 + exp(-r2 * 70.0) * 0.8;
    gl_FragColor = vec4(vCol * vI * a, 1.0);
  }
`;
