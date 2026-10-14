/* ═══ HUD: chips, panel de estrella, interruptores, ayuda ═══ */

import { CHIPS } from './config.js';

const $ = (sel) => document.querySelector(sel);

/** valor del slider [0..100] → pc/s [0,05 … 5000] */
export function sliderToFly(v) {
  return 0.05 * Math.pow(10, (v / 100) * 5);
}
export function flyToSlider(f) {
  return Math.max(0, Math.min(100, ((Math.log10(f) + 1.30103) / 5) * 100));
}

export function fmtFly(f) {
  const f2 = (n, d) => n.toFixed(d).replace('.', ',');
  if (f < 1) return `${f2(f, 2)} pc/s`;
  if (f < 1000) return `${f2(f, f < 10 ? 1 : 0)} pc/s`;
  return `${f2(f / 1000, 1)} kpc/s`;
}

export class UI {
  /**
   * @param {object} h callbacks:
   *  onSpeed(pcps), onSelect(idx), onToggle(name,val),
   *  onTravel, onRecenter, onDeselect
   */
  constructor(handlers) {
    this.h = handlers;

    this.speed = $('#speed');
    this.speedLabel = $('#speed-label');
    this.info = $('#info');
    this.chips = $('#chips');
    this.help = $('#help');
    this.loading = $('#loading');
    this.loadingBar = $('#loading-bar');
    this.loadingMsg = $('#loading-msg');
    this.badge = $('#mode-badge');
    this.hint = $('#hint');
    this.posReadout = $('#pos-readout');

    this.chipEls = new Map();   // idx estrella → botón
    this.chipList = [];         // [{idx, slug}] para teclado y hash

    this._bindTop();
    this._bindToggles();
    this._bindInfo();
    this._bindHelp();
  }

  /* ── construcción ─────────────────────────────────────── */
  buildChips(catalog) {
    const byName = new Map();
    for (const [ni, idx] of catalog.nameToIdx) {
      byName.set(catalog.names[ni], idx);
    }
    for (const chip of CHIPS) {
      const idx = chip.name === 'Sol' ? catalog.solIdx : byName.get(chip.name);
      if (idx === undefined) continue;
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.idx = String(idx);
      const rgb = `${catalog.col[idx * 4]},${catalog.col[idx * 4 + 1]},${catalog.col[idx * 4 + 2]}`;
      btn.style.color = `rgb(${rgb})`;
      btn.innerHTML = `<i></i><span style="color:var(--txt)">${chip.label}</span>`;
      btn.title = chip.label;
      btn.addEventListener('click', () => this.h.onSelect(idx));
      this.chips.appendChild(btn);
      this.chipEls.set(idx, btn);
      this.chipList.push({ idx, slug: chip.slug });
    }
  }

  idxOfSlug(slug) {
    const c = this.chipList.find((x) => x.slug === slug);
    return c ? c.idx : -1;
  }

  _bindTop() {
    this.speed.addEventListener('input', () => {
      const f = sliderToFly(+this.speed.value);
      this.speedLabel.textContent = fmtFly(f);
      this.h.onSpeed(f);
    });
    $('#info-close').addEventListener('click', () => this.h.onDeselect());
  }

  _bindToggles() {
    const map = {
      'tg-const': 'const',
      'tg-names': 'names',
      'tg-disk': 'disk',
      'tg-neb': 'neb'
    };
    for (const [id, name] of Object.entries(map)) {
      const el = document.getElementById(id);
      el.addEventListener('change', () => this.h.onToggle(name, el.checked));
    }
    $('#tg-bloom').addEventListener('change', (e) => this.h.onToggle('bloom', e.target.checked));
  }

  _bindInfo() {
    $('#btn-travel').addEventListener('click', () => this.h.onTravel());
    $('#btn-recenter').addEventListener('click', () => this.h.onRecenter());
  }

  _bindHelp() {
    $('#help-btn').addEventListener('click', () => this.toggleHelp());
  }

  toggleHelp(force) {
    const show = force !== undefined ? force : this.help.classList.contains('hidden');
    this.help.classList.toggle('hidden', !show);
  }

  flipToggle(id) {
    const el = document.getElementById(id);
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change'));
  }

  /* ── estado ───────────────────────────────────────────── */
  setSpeed(f) {
    this.speed.value = String(Math.round(flyToSlider(f)));
    this.speedLabel.textContent = fmtFly(f);
  }

  getSpeed() {
    return sliderToFly(+this.speed.value);
  }

  setPosReadout(txt) {
    this.posReadout.textContent = txt;
  }

  setBadge(txt) {
    this.badge.textContent = txt;
  }

  setSelected(idx) {
    for (const [i, el] of this.chipEls) {
      el.classList.toggle('active', i === idx);
    }
  }

  /* ── panel de información ─────────────────────────────── */
  showInfo(info) {
    $('#info-name').textContent = info.name;
    $('#info-type').textContent = info.type;
    $('#info-dot').style.color = info.color;
    $('#info-desc').textContent = info.desc;

    const stats = $('#info-stats');
    stats.innerHTML = '';
    for (const [k, v] of Object.entries(info.stats)) {
      const cell = document.createElement('div');
      cell.className = 'stat';
      cell.innerHTML = `<b></b><span></span>`;
      cell.querySelector('b').textContent = v;
      cell.querySelector('span').textContent = k;
      stats.appendChild(cell);
    }

    const ul = $('#info-facts');
    ul.innerHTML = '';
    for (const f of info.facts || []) {
      const li = document.createElement('li');
      li.textContent = f;
      ul.appendChild(li);
    }

    this.info.classList.remove('hidden');
    this.hideHint();
  }

  hideInfo() {
    this.info.classList.add('hidden');
  }

  /* ── carga y ayuda ────────────────────────────────────── */
  setProgress(p, msg) {
    this.loadingBar.style.width = `${Math.round(p * 100)}%`;
    if (msg) this.loadingMsg.textContent = msg;
  }

  hideLoading() {
    this.loading.classList.add('done');
  }

  hideHint() {
    this.hint.classList.add('hidden');
  }

  showFatal(msg) {
    this.loadingMsg.textContent = msg;
    this.loadingMsg.style.color = '#ff8a8a';
    this.loadingBar.style.width = '100%';
    this.loadingBar.style.background = '#ff5a5a';
  }
}
