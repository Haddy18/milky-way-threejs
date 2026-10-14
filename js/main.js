/* ═══ Vía Láctea · Three.js — punto de entrada ══════════════
 * Monta renderer + bloom + etiquetas, carga el catálogo HYG,
 * el campo galáctico procedural y las constelaciones; gestiona
 * selección, vuelo libre (WASD), atajos y bucle.
 */

import {
  ACESFilmicToneMapping,
  MathUtils,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { R_SUN_PC, START } from './config.js';
import { loadCatalog, loadLines } from './data.js';
import { buildField } from './galaxy.js';
import { Sky, fmtPC } from './sky.js';
import { CameraRig } from './camera.js';
import { UI, sliderToFly } from './ui.js';

/* ── estado ──────────────────────────────────────────────── */
const state = {
  selected: -1,
  flySpeed: sliderToFly(START.flySlider),
  bloom: true,
  lastInteract: performance.now()
};

const UP = new Vector3(0, 1, 0);
const _v1 = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _move = new Vector3();

/* ── elementos ───────────────────────────────────────────── */
const canvas = document.getElementById('scene');
const labelsHost = document.getElementById('labels');

/* ── motor ───────────────────────────────────────────────── */
let renderer, composer, bloomPass, labelRenderer, scene, camera, controls, rig;
let catalog, field, lines, sky, ui;

function setupEngine() {
  renderer = new WebGLRenderer({ canvas, antialias: true, logDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  scene = new Scene();

  camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.004, 1e5);
  camera.position.set(START.camPos[0], START.camPos[1], START.camPos[2]);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.7;
  controls.minDistance = START.camMin;
  controls.maxDistance = START.camMax;
  if ('zoomToCursor' in controls) controls.zoomToCursor = true;
  controls.target.set(START.target[0], START.target[1], START.target[2]);
  controls.update();

  labelRenderer = new CSS2DRenderer({ element: labelsHost });
  labelRenderer.setSize(window.innerWidth, window.innerHeight);

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(
    new Vector2(window.innerWidth, window.innerHeight),
    0.62, 0.45, 1.05
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}

/* ── selección y vuelos ──────────────────────────────────── */
function select(i, travel = false) {
  if (i < 0 || i >= catalog.count) return;
  const same = state.selected === i;
  state.selected = i;
  sky.setSelected(i);
  ui.setSelected(i);
  ui.showInfo(sky.starInfo(i, camera.position.x, camera.position.y, camera.position.z));
  ui.hideHint();
  if (travel || same) travelTo(i);
}

function deselect() {
  if (state.selected < 0) return;
  state.selected = -1;
  rig.cancel();
  sky.setSelected(-1);
  ui.setSelected(-1);
  ui.hideInfo();
}

function travelTo(i) {
  const pos = _v1.set(catalog.pos[i * 3], catalog.pos[i * 3 + 1], catalog.pos[i * 3 + 2]);
  const dist = camera.position.distanceTo(pos);
  const focus = MathUtils.clamp(dist * 0.22, 0.04, 9);
  const dir = camera.position.clone().sub(pos);
  if (dir.lengthSq() < 1e-8) dir.set(0.4, 0.15, 1);
  dir.normalize().multiplyScalar(focus);
  const dur = Math.min(4.5, 1.2 + Math.sqrt(dist) * 0.16);
  rig.flyTo(pos, dir, dur, () => {
    // al llegar, la ficha refleja las distancias reales del punto de vista
    if (state.selected === i) {
      ui.showInfo(sky.starInfo(i, camera.position.x, camera.position.y, camera.position.z));
    }
  });
}

/* ── vuelo libre ─────────────────────────────────────────── */
const keys = new Set();

function applyFlight(dt) {
  if (rig.busy || keys.size === 0) return;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const u = (keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0);
  if (!f && !r && !u) return;

  camera.getWorldDirection(_fwd);
  _right.crossVectors(_fwd, UP).normalize();
  _move.set(0, 0, 0).addScaledVector(_fwd, f).addScaledVector(_right, r);
  if (u) _move.addScaledVector(UP, u);
  _move.normalize();

  const boost = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6 : 1;
  const step = state.flySpeed * boost * dt;
  camera.position.addScaledVector(_move, step);
  controls.target.addScaledVector(_move, step);
  state.lastInteract = performance.now();
}

/* ── picking ─────────────────────────────────────────────── */
function pickAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return sky.pick(camera, clientX - rect.left, clientY - rect.top, rect.width, rect.height);
}

/* ── UI ──────────────────────────────────────────────────── */
function applyToggle(name, value) {
  if (name === 'bloom') {
    state.bloom = value;
    bloomPass.enabled = value;
  } else {
    sky.setToggle(name, value);
  }
}

/* ── arranque ────────────────────────────────────────────── */
const breathe = () => new Promise((r) => setTimeout(r, 30));

async function start() {
  ui = new UI({
    onSpeed: (f) => { state.flySpeed = f; },
    onSelect: (idx) => select(idx, true),
    onToggle: applyToggle,
    onTravel: () => { if (state.selected >= 0) travelTo(state.selected); },
    onRecenter: () => { if (state.selected >= 0) travelTo(state.selected); },
    onDeselect: deselect
  });
  ui.setSpeed(state.flySpeed);

  ui.setProgress(0.02, 'Preparando el motor…');
  setupEngine();
  rig = new CameraRig(camera, controls);

  ui.setProgress(0.08, 'Descargando el catálogo estelar (3,4 MB)…');
  catalog = await loadCatalog();
  await breathe();

  ui.setProgress(0.45, 'Trazando las constelaciones…');
  lines = await loadLines(catalog);
  await breathe();

  ui.setProgress(0.55, 'Pintando la Vía Láctea (300.000 puntos)…');
  field = buildField();
  await breathe();

  ui.setProgress(0.85, 'Encendiendo las estrellas…');
  sky = new Sky(scene, catalog, field, lines, { onSelect: (i) => select(i, true) });
  sky.build();
  sky.setPixelRatio(renderer.getPixelRatio());
  // el estado inicial de los interruptores manda sobre el cielo
  sky.setToggle('const', document.getElementById('tg-const').checked);
  sky.setToggle('names', document.getElementById('tg-names').checked);
  sky.setToggle('disk', document.getElementById('tg-disk').checked);
  sky.setToggle('neb', document.getElementById('tg-neb').checked);
  ui.buildChips(catalog);
  ui.setBadge(`${catalog.real.toLocaleString('es-ES')} estrellas reales`);
  await breathe();

  bindPointer();
  bindKeys();
  bindResize();
  bindVisibility();

  // gancho de depuración (útil en pruebas vía CDP)
  window.mw = { state, camera, controls, get sky() { return sky; }, get catalog() { return catalog; } };

  ui.setProgress(1, '¡Listo!');
  ui.hideLoading();
  ui.hint.classList.remove('hidden');
  setTimeout(() => ui.hideHint(), 9000);

  // enlaces directos: /#sirio
  const hash = location.hash.replace('#', '');
  if (hash) {
    const idx = ui.idxOfSlug(hash);
    if (idx >= 0) select(idx, true);
  }

  requestAnimationFrame(tick);
}

/* ── eventos ─────────────────────────────────────────────── */
function bindPointer() {
  let downAt = null;

  canvas.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    state.lastInteract = performance.now();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const dx = e.clientX - downAt[0];
    const dy = e.clientY - downAt[1];
    downAt = null;
    if (dx * dx + dy * dy > 36) return; // era un arrastre
    const i = pickAt(e.clientX, e.clientY);
    if (i >= 0) select(i, false);
    else deselect();
  });

  canvas.addEventListener('dblclick', (e) => {
    const i = pickAt(e.clientX, e.clientY);
    if (i >= 0) select(i, true);
  });

  let lastHover = 0;
  canvas.addEventListener('pointermove', (e) => {
    const now = performance.now();
    if (now - lastHover < 110) return;
    lastHover = now;
    canvas.style.cursor = pickAt(e.clientX, e.clientY) >= 0 ? 'pointer' : 'grab';
  });

  canvas.addEventListener('wheel', () => { state.lastInteract = performance.now(); }, { passive: true });
}

function bumpSpeed(dir) {
  const v = MathUtils.clamp(+ui.speed.value + dir * 4, 0, 100);
  const f = sliderToFly(v);
  state.flySpeed = f;
  ui.setSpeed(f);
}

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'BUTTON' || ae.tagName === 'INPUT') &&
        (e.code === 'Space' || e.code === 'Enter')) {
      ae.blur();
    }
    state.lastInteract = performance.now();

    if (e.code === 'Escape') { deselect(); ui.toggleHelp(false); return; }
    if (e.code === 'ArrowRight') { e.preventDefault(); bumpSpeed(+1); return; }
    if (e.code === 'ArrowLeft') { e.preventDefault(); bumpSpeed(-1); return; }
    if (e.code === 'KeyH' || (e.code === 'Slash' && e.shiftKey)) { ui.toggleHelp(); return; }
    if (e.code === 'KeyC') { ui.flipToggle('tg-const'); return; }
    if (e.code === 'KeyN') { ui.flipToggle('tg-names'); return; }
    if (e.code === 'KeyG') { ui.flipToggle('tg-disk'); return; }
    if (e.code === 'KeyB') { ui.flipToggle('tg-bloom'); return; }

    const m = /^Digit([1-9])$/.exec(e.code);
    if (m) {
      const chip = ui.chipList[+m[1] - 1];
      if (chip) select(chip.idx, true);
      return;
    }

    if (/^(Key[WASDQE]|Shift(Left|Right))$/.test(e.code)) keys.add(e.code);
  });

  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}

function bindResize() {
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    labelRenderer.setSize(w, h);
  });
}

function bindVisibility() {
  document.addEventListener('visibilitychange', () => {
    lastFrame = performance.now();
  });
}

/* ── bucle ───────────────────────────────────────────────── */
let lastFrame = performance.now();
let lastReadout = 0;

function tick() {
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  applyFlight(dt);
  rig.update(dt);

  controls.autoRotate =
    state.selected < 0 &&
    !rig.busy &&
    now - state.lastInteract > 9000;
  controls.autoRotateSpeed = 0.18;
  controls.update();

  sky.update(dt, camera, now);

  if (now - lastReadout > 250) {
    lastReadout = now;
    const dSol = camera.position.length();
    const dCen = camera.position.distanceTo(_v1.set(R_SUN_PC, 0, 0));
    ui.setPosReadout(`Sol: ${fmtPC(dSol)} · centro: ${fmtPC(dCen)}`);
  }

  composer.render();
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ── GO ──────────────────────────────────────────────────── */
start().catch((err) => {
  console.error(err);
  const msg = err && /WebGL|webgl/i.test(String(err))
    ? 'Tu navegador no soporta WebGL.'
    : `Error al iniciar: ${err && err.message ? err.message : err}`;
  if (ui) ui.showFatal(msg);
  else {
    const el = document.getElementById('loading-msg');
    if (el) el.textContent = msg;
  }
});
