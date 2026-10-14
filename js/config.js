/* ═══ Configuración: marco galáctico, datos, chips ═══════════
 *  Marco de three.js: X → centro galáctico (l=0), Y → polo norte
 *  galáctico, Z = −y_gal. El Sol está en el origen (0,0,0).
 */

/** Distancia Sol → Sgr A* en pc (GRAVITY Collaboration, 2019). */
export const R_SUN_PC = 8178;

/** Rotación ecuatorial → galáctica (J2000). */
const M_EQ2GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [0.4941094279, -0.4448296300, 0.7469822445],
  [-0.8676661490, -0.1980763734, 0.4559837762]
];

/** (ra°, dec°, distancia pc) → vector three.js en pc. */
export function eqDegToThree(raDeg, decDeg, distPc) {
  const ra = (raDeg * Math.PI) / 180;
  const de = (decDeg * Math.PI) / 180;
  const x = distPc * Math.cos(de) * Math.cos(ra);
  const y = distPc * Math.cos(de) * Math.sin(ra);
  const z = distPc * Math.sin(de);
  const xg = M_EQ2GAL[0][0] * x + M_EQ2GAL[0][1] * y + M_EQ2GAL[0][2] * z;
  const yg = M_EQ2GAL[1][0] * x + M_EQ2GAL[1][1] * y + M_EQ2GAL[1][2] * z;
  const zg = M_EQ2GAL[2][0] * x + M_EQ2GAL[2][1] * y + M_EQ2GAL[2][2] * z;
  return [xg, zg, -yg];
}

/** Posición three → coordenadas galácticas (l, b) en grados. */
export function threeToLB(x, y, z) {
  const xg = x;
  const yg = -z;
  const zg = y;
  const r = Math.hypot(xg, yg, zg) || 1e-9;
  const l = (Math.atan2(yg, xg) * 180) / Math.PI;
  const b = (Math.asin(Math.max(-1, Math.min(1, zg / r))) * 180) / Math.PI;
  return [(l + 360) % 360, b];
}

/* ── Disco galáctico procedural (galaxy.js) ──────────────── */
export const GALAXY = {
  seed: 20261014,
  diskRExp: 2600,      // longitud de escala radial (pc)
  diskRMin: 130,
  diskRMax: 16500,
  armCount: 4,
  armPitchDeg: 13,
  armR0: 650,          // radio de referencia de la espiral
  armTheta0: 0.4,
  armSigma: 0.3,       // anchura angular de los brazos (rad)
  armRMin: 550,
  armRMax: 11500,
  bulgeRe: 700,
  bulgeRMax: 980,
  bulgeElong: 1.35,    // alargamiento del bulbo/barra hacia X
  globs: 16,           // cúmulos globulares del halo
  globPts: 500,
  globRMin: 3000,
  globRMax: 14000,
  globMinLatDeg: 15,   // se evita el plano para el halo
  deepMin: 110,        // campo profundo (complementa el catálogo)
  deepMax: 4200,
  counts: { disk: 155000, arms: 92000, bulge: 46000, deep: 60000 }
};

/* ── Nebulosas procedurales en posiciones reales ─────────── */
export const NEBULAS = [
  { name: 'Nebulosa de Orión', id: 'M42', ra: 83.822, dec: -5.391, d: 386, size: 15, rgb: [1.0, 0.55, 0.62] },
  { name: 'Nebulosa de la Laguna', id: 'M8', ra: 266.68, dec: -24.33, d: 1250, size: 58, rgb: [1.0, 0.45, 0.58] },
  { name: 'Nebulosa del Trífido', id: 'M20', ra: 256.0, dec: -23.03, d: 1150, size: 40, rgb: [0.85, 0.55, 0.95] },
  { name: 'Nebulosa Omega', id: 'M17', ra: 275.2, dec: -16.17, d: 1700, size: 46, rgb: [1.0, 0.4, 0.5] }
];

/* ── Estrellas destacadas (nombre propio del catálogo) ───── */
export const CHIPS = [
  { name: 'Sol', label: 'Sol', slug: 'sol' },
  { name: 'Sirius', label: 'Sirio', slug: 'sirio' },
  { name: 'Canopus', label: 'Canopus', slug: 'canopus' },
  { name: 'Rigil Kentaurus', label: 'α Centauri', slug: 'alfa-centauri' },
  { name: 'Vega', label: 'Vega', slug: 'vega' },
  { name: 'Arcturus', label: 'Arturo', slug: 'arturo' },
  { name: 'Capella', label: 'Capella', slug: 'capella' },
  { name: 'Rigel', label: 'Rigel', slug: 'rigel' },
  { name: 'Procyon', label: 'Proción', slug: 'procion' },
  { name: 'Achernar', label: 'Achernar', slug: 'achernar' },
  { name: 'Betelgeuse', label: 'Betelgeuse', slug: 'betelgeuse' },
  { name: 'Altair', label: 'Altair', slug: 'altair' },
  { name: 'Aldebaran', label: 'Aldebarán', slug: 'aldebaran' },
  { name: 'Antares', label: 'Antares', slug: 'antares' },
  { name: 'Spica', label: 'Spica', slug: 'spica' },
  { name: 'Deneb', label: 'Deneb', slug: 'deneb' }
];

/* ── Nombres españoles de las 88 constelaciones ──────────── */
export const CON_ES = {
  And: 'Andrómeda', Ant: 'Antlia', Aps: 'Apus', Aql: 'Águila', Aqr: 'Acuario',
  Ara: 'Altar', Ari: 'Aries', Aur: 'Auriga', Boo: 'Boyero', Cae: 'Caelum',
  Cam: 'Camelopardalis', Cap: 'Capricornio', Car: 'Quilla', Cas: 'Casiopea',
  Cen: 'Centuro', Cep: 'Cefeo', Cet: 'Ballena', Cha: 'Camaleón', Cir: 'Círculo',
  Cnc: 'Cáncer', Col: 'Paloma', Com: 'Cabellera de Berenice', CrA: 'Corona Austral',
  CrB: 'Corona Boreal', Crv: 'Cuervo', Crt: 'Copa', Cru: 'Cruz', Cyg: 'Cisne',
  Del: 'Delfín', Dor: 'Dorado', Dra: 'Dragón', Equ: 'Caballito', Eri: 'Erídano',
  For: 'Horno', Gem: 'Géminis', Gru: 'Grulla', Her: 'Hércules', Hor: 'Reloj',
  Hya: 'Hidra', Hyi: 'Hidra Austral', Ind: 'Indio', Lac: 'Lagarto', Leo: 'León',
  Lep: 'Liebre', Lib: 'Libra', LMi: 'León Menor', Lup: 'Lobo', Lyn: 'Lince',
  Lyr: 'Lira', Men: 'Mesa', Mic: 'Microscopio', Mon: 'Unicornio', Mus: 'Mosca',
  Nor: 'Escuadra', Oct: 'Octante', Oph: 'Ofiuco', Ori: 'Orión', Pav: 'Pavo',
  Peg: 'Pegaso', Per: 'Perseo', Phe: 'Fénix', Pic: 'Pintor', PsA: 'Piscis Austral',
  Psc: 'Piscis', Pup: 'Popa', Pyx: 'Brújula', Ret: 'Retícula', Scl: 'Escultor',
  Sco: 'Escorpio', Sct: 'Escudo', Ser: 'Serpiente', Sex: 'Sextante', Sge: 'Flecha',
  Sgr: 'Sagitario', Tau: 'Tauro', Tel: 'Telescopio', TrA: 'Triángulo Austral',
  Tri: 'Triángulo', Tuc: 'Tucán', UMa: 'Osa Mayor', UMi: 'Osa Menor', Vel: 'Vela',
  Vir: 'Virgen', Vol: 'Pez volador', Vul: 'Zorra'
};

/* ── Arranque y límites ──────────────────────────────────── */
export const START = {
  camPos: [-34, 8, 44],   // pc respecto al Sol
  target: [9, 0, 0],
  camMin: 0.02,           // pc (distancia mínima de órbita)
  camMax: 65000,          // pc
  flySlider: 40           // velocidad inicial en el slider [0..100]
};

export const LABELS = {
  appMagMax: 3.6,         // magnitud aparente máxima para etiquetar
  updateMs: 220,
  minGapPx: 66            // separación mínima entre etiquetas en pantalla
};

/** 1 año-luz en pc. */
export const LY_PER_PC = 3.261564;
