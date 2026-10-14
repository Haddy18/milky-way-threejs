/* ═══ Carga del catálogo y de las constelaciones ═══════════
 *  stars.bin → por estrella 28 B (ver scripts/build-data.py):
 *    0-11   x,y,z f32 (pc, marco galáctico; el Sol en el origen)
 *    12-14  r,g,b u8
 *    15     size u8 (base de tamaño en pantalla a 10 pc, /7*255)
 *    16     absmag u8 ((M+10)*10)
 *    17     con u8 (índice en conids.txt)
 *    18-19  spectIdx u16 · 20-21 nameIdx u16 · 22-25 hip u32 · 26-27 relleno
 */

const STRIDE = 28;

async function fetchBuf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.arrayBuffer();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.text();
}

/** Descarga y desempaqueta el catálogo. El Sol se añade aparte. */
export async function loadCatalog() {
  const [buf, namesTxt, spectTxt, conTxt] = await Promise.all([
    fetchBuf('data/stars.bin'),
    fetchText('data/names.txt'),
    fetchText('data/spect.txt'),
    fetchText('data/conids.txt')
  ]);

  const n = buf.byteLength / STRIDE;
  const words = new Uint32Array(buf);
  const bytes = new Uint8Array(buf);
  const u16 = new Uint16Array(buf);
  const dv = new DataView(buf);

  const pos = new Float32Array((n + 1) * 3);
  const posW = new Uint32Array(pos.buffer);
  const col = new Uint8Array((n + 1) * 4);
  const size = new Float32Array(n + 1);
  const mag = new Float32Array(n + 1);
  const con = new Uint8Array(n + 1);
  const nameIdx = new Uint16Array(n + 1);
  const spectIdx = new Uint16Array(n + 1);
  const hips = new Uint32Array(n + 1);

  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    const w = i * 7;
    posW[i * 3] = words[w];
    posW[i * 3 + 1] = words[w + 1];
    posW[i * 3 + 2] = words[w + 2];
    col[i * 4] = bytes[o + 12];
    col[i * 4 + 1] = bytes[o + 13];
    col[i * 4 + 2] = bytes[o + 14];
    col[i * 4 + 3] = 255;
    size[i] = (bytes[o + 15] * 7) / 255;
    mag[i] = bytes[o + 16] / 10 - 10;
    con[i] = bytes[o + 17];
    spectIdx[i] = u16[i * 14 + 9];
    nameIdx[i] = u16[i * 14 + 10];
    hips[i] = dv.getUint32(o + 22, true);
  }

  const names = namesTxt.split('\0');
  names.push('Sol');                     // el Sol no venía en el binario
  const spect = spectTxt.split('\0');
  const conIdList = conTxt.split('\0');  // byte de stars.bin → "And", "Ori"…

  // el Sol: enana amarilla G2V, en la constelación de Ofiuco
  const solIdx = n;
  posW[solIdx * 3] = 0; posW[solIdx * 3 + 1] = 0; posW[solIdx * 3 + 2] = 0;
  col[solIdx * 4] = 255; col[solIdx * 4 + 1] = 247; col[solIdx * 4 + 2] = 225; col[solIdx * 4 + 3] = 255;
  size[solIdx] = 1.0;
  mag[solIdx] = 4.85;
  con[solIdx] = Math.max(0, conIdList.indexOf('Oph'));
  nameIdx[solIdx] = names.length - 1;
  spectIdx[solIdx] = Math.max(0, spect.indexOf('G2V'));
  hips[solIdx] = 0;

  // nombre (idx) → primera estrella con ese nombre
  const nameToIdx = new Map();
  for (let i = 0; i <= n; i++) {
    const ni = nameIdx[i];
    if (ni && !nameToIdx.has(ni)) nameToIdx.set(ni, i);
  }

  return {
    count: n + 1,
    real: n,
    solIdx,
    pos, col, size, mag, con, nameIdx, spectIdx, hips,
    names, spect, conIdList, nameToIdx,
    nameOf: (i) => names[nameIdx[i]] || '',
    spectOf: (i) => spect[spectIdx[i]] || '',
    conOf: (i) => conIdList[con[i]] || '',
    hipOf: (i) => hips[i],
    posOf: (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]],
    distTo: (i, x, y, z) => {
      const dx = pos[i * 3] - x;
      const dy = pos[i * 3 + 1] - y;
      const dz = pos[i * 3 + 2] - z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  };
}

/**
 * Líneas de constelaciones (índices de estrellas) y centroides.
 * lines.bin: por segmento 12 B (u32 a, u32 b, u8 con, 3 relleno).
 */
export async function loadLines(catalog) {
  const [buf, consRes] = await Promise.all([
    fetchBuf('data/lines.bin'),
    fetch('data/cons.json')
  ]);
  if (!consRes.ok) throw new Error('No se pudo cargar data/cons.json');
  const cons = await consRes.json();

  const n = buf.byteLength / 12;
  const dv = new DataView(buf);
  const pairs = new Uint32Array(n * 2);
  const conOf = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 12;
    pairs[i * 2] = dv.getUint32(o, true);
    pairs[i * 2 + 1] = dv.getUint32(o + 4, true);
    conOf[i] = dv.getUint8(o + 8);
  }
  return { pairs, conOf, cons };
}
