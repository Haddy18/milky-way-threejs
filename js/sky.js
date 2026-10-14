/* ═══ Cielo: estrellas, constelaciones, nebulosas, etiquetas ═ */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3
} from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { STAR_VERT, STAR_FRAG } from './shaders.js';
import {
  CON_ES, LABELS, LY_PER_PC, NEBULAS, R_SUN_PC, eqDegToThree, threeToLB
} from './config.js';
import { Noise2D, clamp01 } from './noise.js';

const SPECT_ES = {
  O: 'gigante azul muy caliente', B: 'estrella azul-blanca',
  A: 'estrella blanca', F: 'estrella blanco-amarilla',
  G: 'estrella amarilla (tipo solar)', K: 'estrella naranja',
  M: 'estrella roja'
};

export function fmtPC(pc) {
  const f = (n, d) => n.toFixed(d).replace('.', ',');
  const a = Math.abs(pc);
  if (a < 0.1) return `${f(pc * 206265, 0)} UA`;
  if (a < 1) return `${f(pc, 2)} pc`;
  if (a < 3000) return `${f(pc, 1)} pc`;
  return `${f(pc / 1000, 2)} kpc`;
}

export function fmtLY(pc) {
  const ly = pc * LY_PER_PC;
  const f = (n, d) => n.toFixed(d).replace('.', ',');
  if (ly < 0.1) return `${f(ly * 63241, 0)} al`;
  if (ly < 100) return `${f(ly, 2)} al`;
  if (ly < 100000) return `${f(ly, 0)} al`;
  return `${f(ly / 1000, 1)} mil al`;
}

export class Sky {
  /**
   * @param {Scene} scene
   * @param {object} catalog catálogo cargado (data.js)
   * @param {object} field campo procedural (galaxy.js)
   * @param {object} lines líneas de constelaciones (data.js)
   * @param {{ onSelect:(i:number)=>void }} opts
   */
  constructor(scene, catalog, field, lines, opts = {}) {
    this.scene = scene;
    this.catalog = catalog;
    this.field = field;
    this.linesData = lines;
    this.onSelect = opts.onSelect || (() => {});

    this.toggles = { const: true, names: true, disk: true, neb: true };
    this.selected = -1;

    this.starLabels = new Map();   // idx → CSS2DObject
    this.consLabels = [];
    this.nebulaSprites = [];
    this._ring = null;
    this._lastLabelUpdate = 0;
    this._v = new Vector3();
    this._mvp = new Matrix4();
  }

  /* ── construcción ─────────────────────────────────────── */
  build() {
    this.starMat = new ShaderMaterial({
      uniforms: { uPixel: { value: 1 }, uBoost: { value: 1 } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending
    });

    this.stars = this._makePoints(
      this.catalog.pos, this.catalog.col, this.catalog.size, this.catalog.mag);
    this.scene.add(this.stars);

    this.fieldPoints = this._makePoints(
      this.field.pos, this.field.col, this.field.size, this.field.mag);
    this.scene.add(this.fieldPoints);

    this._buildLines();
    this._buildNebulas();
    this._buildRing();
    this._buildStarLabels();
    this._buildConsLabels();
  }

  _makePoints(pos, col, size, mag) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new BufferAttribute(col, 4, true));
    geo.setAttribute('aMag', new BufferAttribute(mag, 1));
    geo.setAttribute('aSize', new BufferAttribute(size, 1));
    const pts = new Points(geo, this.starMat);
    pts.frustumCulled = false;
    return pts;
  }

  _buildLines() {
    const { pairs } = this.linesData;
    const c = this.catalog;
    const lp = new Float32Array(pairs.length * 3);
    for (let i = 0; i < pairs.length; i++) {
      const s = pairs[i] * 3;
      lp[i * 3] = c.pos[s];
      lp[i * 3 + 1] = c.pos[s + 1];
      lp[i * 3 + 2] = c.pos[s + 2];
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(lp, 3));
    this.lines = new LineSegments(geo, new LineBasicMaterial({
      color: 0x59d8ff,
      transparent: true,
      opacity: 0.18,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending
    }));
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
  }

  _buildNebulas() {
    for (const neb of NEBULAS) {
      const tex = this._nebulaTexture(neb.rgb);
      const [x, y, z] = eqDegToThree(neb.ra, neb.dec, neb.d);
      const sprite = new Sprite(new SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending
      }));
      sprite.position.set(x, y, z);
      sprite.scale.set(neb.size, neb.size, 1);
      sprite.frustumCulled = false;
      this.scene.add(sprite);
      this.nebulaSprites.push(sprite);
    }
  }

  _nebulaTexture(tint) {
    const S = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    const noise = new Noise2D(90210);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x - S / 2) / (S / 2);
        const dy = (y - S / 2) / (S / 2);
        const r = Math.hypot(dx, dy);
        const n = noise.fbm(x / 40, y / 40, 5) * 0.5 + 0.5;
        const shape = Math.pow(Math.max(0, 1 - r), 1.7) * (0.3 + 0.85 * n);
        const a = clamp01(shape);
        const t = clamp01((1 - r) * 1.7) * (0.55 + 0.45 * n);
        const o = (y * S + x) * 4;
        d[o] = Math.round(255 * (1 - t) + tint[0] * 255 * t);
        d[o + 1] = Math.round(255 * (1 - t) + tint[1] * 255 * t);
        d[o + 2] = Math.round(255 * (1 - t) + tint[2] * 255 * t);
        d[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  _buildRing() {
    const S = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const r = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
        const ring = Math.exp(-Math.pow((r - 0.38) / 0.075, 2));
        const o = (y * S + x) * 4;
        d[o] = 255; d[o + 1] = 236; d[o + 2] = 190;
        d[o + 3] = Math.round(clamp01(ring) * 230);
      }
    }
    ctx.putImageData(img, 0, 0);
    this._ring = new Sprite(new SpriteMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending
    }));
    this._ring.visible = false;
    this._ring.frustumCulled = false;
    this.scene.add(this._ring);
  }

  _buildStarLabels() {
    const c = this.catalog;
    for (let i = 0; i < c.count; i++) {
      const ni = c.nameIdx[i];
      if (!ni) continue;
      const el = document.createElement('button');
      el.className = 'label star-label';
      if (i === c.solIdx) el.classList.add('sol');
      el.textContent = c.names[ni];
      el.title = c.names[ni];
      const obj = new CSS2DObject(el);
      obj.position.set(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]);
      obj.visible = false;
      obj.frustumCulled = false;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onSelect(i);
      });
      this.scene.add(obj);
      this.starLabels.set(i, obj);
    }
  }

  _buildConsLabels() {
    const best = new Map();
    for (const con of this.linesData.cons) {
      const prev = best.get(con.id);
      if (!prev || con.n > prev.n) best.set(con.id, con);
    }
    for (const con of best.values()) {
      const el = document.createElement('div');
      el.className = 'label cons-label';
      el.textContent = CON_ES[con.id] || con.id;
      const obj = new CSS2DObject(el);
      obj.position.set(con.cx, con.cy, con.cz);
      obj.visible = false;
      obj.frustumCulled = false;
      this.scene.add(obj);
      this.consLabels.push(obj);
    }
  }

  setPixelRatio(r) {
    this.starMat.uniforms.uPixel.value = r;
  }

  /* ── estado ───────────────────────────────────────────── */
  setToggle(name, v) {
    this.toggles[name] = v;
    if (name === 'const') {
      this.lines.visible = v;
      for (const l of this.consLabels) l.visible = v;
    } else if (name === 'disk') {
      this.fieldPoints.visible = v;
    } else if (name === 'neb') {
      for (const s of this.nebulaSprites) s.visible = v;
    }
    // 'names' se aplica en updateLabels()
  }

  setSelected(i) {
    this.selected = i;
    this._ring.visible = i >= 0;
    for (const [idx, obj] of this.starLabels) {
      obj.element.classList.toggle('sel', idx === i);
    }
  }

  /* ── picking (pantalla, solo estrellas reales) ────────── */
  pick(camera, mx, my, w, h) {
    const c = this.catalog;
    camera.updateMatrixWorld();
    this._mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const e = this._mvp.elements;
    const pos = c.pos;
    const R2 = 26 * 26;
    let best = -1;
    let bestW = Infinity;
    for (let i = 0; i < c.count; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (cw <= 0) continue;
      const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const sx = ((cx / cw) * 0.5 + 0.5) * w;
      const sy = (0.5 - (cy / cw) * 0.5) * h;
      const dx = sx - mx;
      const dy = sy - my;
      if (dx * dx + dy * dy < R2 && cw < bestW) {
        best = i;
        bestW = cw;
      }
    }
    return best;
  }

  /* ── ficha de estrella para el panel ──────────────────── */
  starInfo(i, camX, camY, camZ) {
    const c = this.catalog;
    const x = c.pos[i * 3];
    const y = c.pos[i * 3 + 1];
    const z = c.pos[i * 3 + 2];
    const dCam = Math.hypot(x - camX, y - camY, z - camZ);
    const dSol = Math.hypot(x, y, z);
    const dCen = Math.hypot(x - R_SUN_PC, y, z);
    const [l, b] = threeToLB(x, y, z);

    const name = c.nameOf(i) || (c.hipOf(i) ? `HIP ${c.hipOf(i)}` : `Estrella #${i}`);
    const spect = (c.spectOf(i) || '').replace(/…+$/, '');
    const conEs = CON_ES[c.conOf(i)] || '';
    const cls = SPECT_ES[(spect || ' ')[0]] || 'estrella';
    const isSol = i === c.solIdx;

    const appMagSol = isSol ? -26.7 : c.mag[i] + 5 * Math.log10(Math.max(dSol, 1e-6) / 10);
    const rgb = `rgb(${c.col[i * 4]},${c.col[i * 4 + 1]},${c.col[i * 4 + 2]})`;

    const desc = isSol
      ? 'Nuestra estrella: una enana amarilla G2V en el brazo de Orión. Toda la Vía Láctea se ve desde aquí.'
      : `${conEs ? conEs + ' · ' : ''}${cls}. Sus ${fmtLY(dSol)} respecto al Sol y su posición real la sitúan en el catálogo.`;

    const facts = [];
    if (isSol) {
      facts.push(`A ${fmtPC(R_SUN_PC)} del centro galáctico, en el brazo de Orión.`);
      facts.push('1 año-luz = 0,3066 pc; el catálogo llega a ~100 pc con estrellas débiles.');
    } else {
      facts.push(c.mag[i] < 6.5
        ? 'Con esta magnitud se ve a simple vista desde el Sol.'
        : 'Más tenue que el límite de visión humana; el catálogo la incluye por su distancia.');
      facts.push('Posición real del catálogo HYG (Hipparcos, Yale y Gliese).');
    }

    return {
      name,
      type: [spect, conEs].filter(Boolean).join(' · ') || 'Estrella',
      color: rgb,
      desc,
      stats: {
        'Distancia a ti': fmtPC(dCam),
        'Distancia al Sol': fmtLY(dSol),
        'Mag. aparente': appMagSol.toFixed(2).replace('.', ','),
        'Mag. absoluta': c.mag[i].toFixed(2).replace('.', ','),
        'l / b': `${l.toFixed(1).replace('.', ',')}° / ${b >= 0 ? '+' : ''}${b.toFixed(1).replace('.', ',')}°`,
        'Al centro': fmtPC(dCen)
      },
      facts
    };
  }

  /* ── frame a frame ────────────────────────────────────── */
  update(dt, camera, now) {
    if (this._ring.visible && this.selected >= 0) {
      const c = this.catalog;
      this._ring.position.set(
        c.pos[this.selected * 3], c.pos[this.selected * 3 + 1], c.pos[this.selected * 3 + 2]);
      const d = Math.max(camera.position.distanceTo(this._ring.position), 1e-6);
      const s = Math.min(Math.max(d * 0.07, 0.02), 30);
      const pulse = 1 + 0.1 * Math.sin(now / 300);
      this._ring.scale.set(s * pulse, s * pulse, 1);
    }

    if (now - this._lastLabelUpdate > LABELS.updateMs) {
      this._lastLabelUpdate = now;
      const c = this.catalog;
      const cp = camera.position;
      const w = window.innerWidth;
      const h = window.innerHeight;

      // candidatos: nombre visible si brilla bastante desde la cámara
      const cand = [];
      for (const [i, obj] of this.starLabels) {
        let vis = this.toggles.names;
        let pri = 0;
        if (vis) {
          if (i === this.selected || i === c.solIdx) {
            pri = i === this.selected ? -100 : -99;
          } else {
            const d = Math.max(c.distTo(i, cp.x, cp.y, cp.z), 1e-6);
            const appMag = c.mag[i] + 5 * Math.log10(d / 10);
            if (appMag <= LABELS.appMagMax) pri = appMag;
            else vis = false;
          }
        }
        obj.visible = vis;
        if (vis) cand.push([pri, i, obj]);
      }

      // las más brillantes primero; las que se solapen, fuera
      cand.sort((a, b) => a[0] - b[0]);
      const placed = [];
      const gap2 = LABELS.minGapPx * LABELS.minGapPx;
      for (const [, i, obj] of cand) {
        this._v.set(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]).project(camera);
        if (this._v.z > 1 || this._v.z < -1) continue;
        const sx = (this._v.x * 0.5 + 0.5) * w;
        const sy = (0.5 - this._v.y * 0.5) * h;
        let ok = true;
        for (const p of placed) {
          const dx = p[0] - sx;
          const dy = p[1] - sy;
          if (dx * dx + dy * dy < gap2) { ok = false; break; }
        }
        if (ok) placed.push([sx, sy]);
        else obj.visible = false;
      }
    }
  }
}
