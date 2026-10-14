/* ═══ Cámara: vuelos entre estrellas ════════════════════════
 *  Las estrellas no se mueven: el destino del vuelo es fijo.
 *  follow no hace falta (a diferencia del sistema solar).
 */

import { Vector3 } from 'three';

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.flying = false;

    this._fly = null;
    this._onDone = null;
    this._startCam = new Vector3();
    this._startTarget = new Vector3();
    this._target = new Vector3();
    this._camPos = new Vector3();
  }

  get busy() {
    return this.flying;
  }

  /**
   * Vuela hasta una posición (pc).
   * @param {Vector3} pos destino (el objetivo queda ahí)
   * @param {Vector3} offset desplazamiento final de la cámara
   * @param {number} duration segundos
   * @param {() => void} [onDone]
   */
  flyTo(pos, offset, duration = 1.8, onDone = null) {
    this._fly = { pos: pos.clone(), offset: offset.clone(), t: 0, dur: Math.max(0.05, duration) };
    this._startCam.copy(this.camera.position);
    this._startTarget.copy(this.controls.target);
    this._onDone = onDone;
    this.flying = true;
    this.controls.enabled = false;
  }

  /** Cancela el vuelo sin mover la cámara */
  cancel() {
    this._fly = null;
    this.flying = false;
    this.controls.enabled = true;
  }

  update(dt) {
    const f = this._fly;
    if (!f) return;

    f.t += dt / f.dur;
    this._target.copy(f.pos);
    this._camPos.copy(f.pos).add(f.offset);

    const k = easeInOut(Math.min(1, f.t));
    this.camera.position.lerpVectors(this._startCam, this._camPos, k);
    this.controls.target.lerpVectors(this._startTarget, this._target, k);

    if (f.t >= 1) {
      this._fly = null;
      this.flying = false;
      this.controls.enabled = true;
      const cb = this._onDone;
      this._onDone = null;
      if (cb) cb();
    }
  }
}
