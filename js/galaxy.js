/* ═══ Campo galáctico procedural ═══════════════════════════
 *  Nube de puntos determinista (mulberry32) que da la estructura
 *  a gran escala: disco fino, cuatro brazos espirales, bulbo,
 *  cúmulos globulares del halo y un campo profundo de fondo.
 *  El centro galáctico queda en (+R_SUN_PC, 0, 0): el Sol, en 0.
 */

import { mulberry32 } from './noise.js';
import { GALAXY, R_SUN_PC } from './config.js';

export function buildField() {
  const g = GALAXY;
  const rnd = mulberry32(g.seed);
  const gauss = () => {
    const u1 = Math.max(rnd(), 1e-9);
    const u2 = rnd();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const total = g.counts.disk + g.counts.arms + g.counts.bulge +
    g.counts.deep + g.globs * g.globPts;
  const pos = new Float32Array(total * 3);
  const col = new Uint8Array(total * 4);
  const size = new Float32Array(total);
  const mag = new Float32Array(total);
  mag.fill(99); // marca de "campo procedural" para el shader

  let k = 0;
  const put = (x, y, z, r, gr, b, inten, px) => {
    pos[k * 3] = x + R_SUN_PC;
    pos[k * 3 + 1] = y;
    pos[k * 3 + 2] = z;
    col[k * 4] = r;
    col[k * 4 + 1] = gr;
    col[k * 4 + 2] = b;
    col[k * 4 + 3] = Math.max(1, Math.min(255, Math.round(inten * 255)));
    size[k] = px;
    k++;
  };
  const jit = (v) => Math.max(0, Math.min(255, Math.round(v * (0.9 + rnd() * 0.2))));
  const expR = () => -g.diskRExp * Math.log(1 - rnd());
  const tanPitch = Math.tan((g.armPitchDeg * Math.PI) / 180);

  /* ── disco fino: población mixta ── */
  for (let i = 0; i < g.counts.disk; i++) {
    let R = expR();
    if (R < g.diskRMin || R > g.diskRMax) { i--; continue; }
    const th = rnd() * Math.PI * 2;
    const z = (80 + R * 0.015) * gauss();
    const u = rnd();
    let r, gr, b;
    if (u < 0.65) { r = 250; gr = 236; b = 214; }        // blanco cálido
    else if (u < 0.9) { r = 215; gr = 226; b = 255; }    // azul-blanca
    else { r = 255; gr = 196; b = 148; }                 // naranja
    put(R * Math.cos(th), z, R * Math.sin(th),
      jit(r), jit(gr), jit(b),
      0.05 + 0.22 * rnd() * rnd(), 0.75 + 0.55 * rnd());
  }

  /* ── brazos espirales: población joven (azules y HII rosas) ── */
  const pitchOff = Math.log(g.armR0) / tanPitch;
  for (let i = 0; i < g.counts.arms; i++) {
    let R = expR();
    if (R < g.armRMin || R > g.armRMax) { i--; continue; }
    const arm = (rnd() * g.armCount) | 0;
    const th = g.armTheta0 + (arm * 2 * Math.PI) / g.armCount +
      Math.log(R) / tanPitch - pitchOff + gauss() * g.armSigma;
    const z = (55 + R * 0.008) * gauss();
    const u = rnd();
    let r, gr, b, inten;
    if (u < 0.55) { r = 190; gr = 215; b = 255; inten = 0.08 + 0.25 * rnd() * rnd(); }
    else if (u < 0.85) { r = 235; gr = 240; b = 255; inten = 0.08 + 0.25 * rnd() * rnd(); }
    else { r = 255; gr = 130; b = 160; inten = 0.25 + 0.4 * rnd(); } // regiones HII
    put(R * Math.cos(th), z, R * Math.sin(th),
      jit(r), jit(gr), jit(b), inten, 0.8 + 0.6 * rnd());
  }

  /* ── bulbo/barra: población vieja, cálida y densa ── */
  for (let i = 0; i < g.counts.bulge; i++) {
    const r = g.bulgeRe * Math.pow(rnd(), 1.8);
    const c = 2 * rnd() - 1;                     // cos(θ polar)
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    const phi = rnd() * Math.PI * 2;
    const x = r * s * Math.cos(phi) * g.bulgeElong;
    const y = r * c * 0.5;
    const z = r * s * Math.sin(phi);
    const warm = rnd() < 0.6;
    put(x, y, z,
      warm ? jit(255) : jit(255), jit(warm ? 226 : 205), jit(warm ? 178 : 150),
      (0.18 + 0.45 * rnd()) * (0.55 + 0.65 * Math.exp(-r / 450)),
      0.9 + 0.6 * rnd());
  }

  /* ── cúmulos globulares del halo ── */
  const minLat = (g.globMinLatDeg * Math.PI) / 180;
  for (let c = 0; c < g.globs; c++) {
    const lat = (minLat + (Math.PI / 2 - minLat) * rnd()) * (rnd() < 0.5 ? -1 : 1);
    const lon = rnd() * Math.PI * 2;
    const rad = g.globRMin + (g.globRMax - g.globRMin) * rnd();
    const cx = rad * Math.cos(lat) * Math.cos(lon);
    const cy = rad * Math.sin(lat);
    const cz = rad * Math.cos(lat) * Math.sin(lon);
    const sig = 25 + 35 * rnd();
    for (let i = 0; i < g.globPts; i++) {
      const gx = cx + gauss() * sig;
      const gy = cy + gauss() * sig;
      const gz = cz + gauss() * sig;
      const rr = Math.hypot(gx - cx, gy - cy, gz - cz);
      put(gx, gy, gz, jit(255), jit(236), jit(196),
        (0.1 + 0.45 * Math.max(0, 1 - rr / (3 * sig))) * (0.6 + 0.4 * rnd()),
        0.8 + 0.5 * rnd());
    }
  }

  /* ── campo profundo: estrellas de fondo en todas las direcciones ── */
  for (let i = 0; i < g.counts.deep; i++) {
    const d = g.deepMin + (g.deepMax - g.deepMin) * Math.pow(rnd(), 2);
    const c = 2 * rnd() - 1;
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    const phi = rnd() * Math.PI * 2;
    const u = rnd();
    let r, gr, b;
    if (u < 0.4) { r = 255; gr = 232; b = 205; }
    else if (u < 0.7) { r = 235; gr = 240; b = 255; }
    else if (u < 0.9) { r = 255; gr = 200; b = 155; }
    else { r = 255; gr = 165; b = 135; }
    const atten = Math.max(0.3, Math.min(1, Math.sqrt(700 / d)));
    put(d * s * Math.cos(phi), d * c, d * s * Math.sin(phi),
      jit(r), jit(gr), jit(b),
      0.16 * atten * (0.45 + rnd()), 0.7 + 0.4 * rnd());
  }

  return { count: k, pos, col, size, mag };
}
