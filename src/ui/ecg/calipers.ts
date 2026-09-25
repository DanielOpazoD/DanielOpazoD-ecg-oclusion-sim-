import { gridGeometry, type GridGeometry } from './renderer.js';
import type { ViewState } from '../state/appState.js';

/**
 * Pointer tools over the ECG canvas, sharing the renderer's mm geometry via
 * {@link gridGeometry}. Two modes (store flag `view.calipers`):
 *  - calipers on: drag measures Δt/ΔV (+ FC eq.) with a persistent overlay.
 *  - calipers off: drag does nothing; a click (<4 px) picks the nearest beat.
 * Esc clears the overlay/line.
 */
export interface CaliperState {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  active: boolean;
}

export interface CaliperOpts {
  /** Current calipers-mode flag — re-read on every event. */
  isOn?: () => boolean;
  /** Fired on pointerup when the drag moved less than 4 px. `tSec` is the
   *  recording time under the pointer (sequential/simultaneous/strip aware). */
  onPick?: (tSec: number) => void;
}

/** Map a canvas point to recording time (seconds) using the grid geometry. */
export function timeAtPoint(xPx: number, yPx: number, g: GridGeometry, view: ViewState): number {
  const xm = (xPx - g.mx) / g.ppm;
  const row = Math.floor((yPx - g.mx) / g.ppm / g.cellHMm);
  // Rhythm-strip rows (below the grid) span the full width.
  if (row >= g.rows) return Math.max(0, xm / view.speedMmS);
  const col = Math.min(g.cols - 1, Math.max(0, Math.floor(xm / g.cellWMm)));
  const withinS = Math.max(0, (xm - col * g.cellWMm) / view.speedMmS);
  return view.simultaneous ? withinS : col * g.cellSec + withinS;
}

export function attachCalipers(
  canvas: HTMLCanvasElement,
  getView: () => ViewState,
  getGain: () => number,
  opts: CaliperOpts = {},
): () => void {
  let drag: CaliperState | null = null;
  let overlay: HTMLDivElement | null = null;
  const isOn = opts.isOn ?? (() => false);

  const ensureOverlay = () => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'caliper-overlay';
      overlay.style.cssText =
        'position:absolute;pointer-events:none;background:var(--text);color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-variant-numeric:tabular-nums;z-index:5;';
      canvas.parentElement?.appendChild(overlay);
    }
    return overlay;
  };

  const onDown = (e: PointerEvent) => {
    if (!isOn()) return;
    // A new drag replaces the previous measurement.
    overlay?.remove();
    overlay = null;
    clearLine(canvas);
    const r = canvas.getBoundingClientRect();
    drag = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: 0, y1: 0, active: true };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag?.active) return;
    const r = canvas.getBoundingClientRect();
    drag.x1 = e.clientX - r.left;
    drag.y1 = e.clientY - r.top;
    const { ppm } = gridGeometry(canvas, getView());
    const o = ensureOverlay();
    const dtMm = Math.abs(drag.x1 - drag.x0) / ppm;
    const dvMm = Math.abs(drag.y1 - drag.y0) / ppm;
    const gain = getGain();
    const dtMs = dtMm * 40;
    const fc = dtMs >= 100 ? ` · FC eq. ${Math.round(60000 / dtMs)} lpm` : '';
    o.textContent = `Δt ${dtMs.toFixed(0)} ms · ΔV ${(dvMm / gain).toFixed(2)} mV${fc}`;
    o.style.left = `${Math.max(drag.x0, drag.x1) + 8}px`;
    o.style.top = `${Math.min(drag.y0, drag.y1) - 20}px`;
    drawLine(canvas, drag);
  };
  const onUp = (e: PointerEvent) => {
    const d = drag;
    if (d) d.active = false;
    drag = null;
    // Click (or calipers off): pick the beat under the pointer.
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (d && Math.hypot(x - d.x0, y - d.y0) < 4) {
      opts.onPick?.(timeAtPoint(x, y, gridGeometry(canvas, getView()), getView()));
      return;
    }
    if (!isOn()) {
      opts.onPick?.(timeAtPoint(x, y, gridGeometry(canvas, getView()), getView()));
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      drag = null;
      overlay?.remove();
      overlay = null;
      clearLine(canvas);
    }
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKey);
    overlay?.remove();
  };
}

// Overlay canvas pair: draw caliper line on a 2nd absolutely-positioned canvas.
const lineStore = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function drawLine(canvas: HTMLCanvasElement, d: CaliperState): void {
  let ov = lineStore.get(canvas);
  if (!ov) {
    ov = document.createElement('canvas');
    ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;width:100%;height:100%;';
    canvas.parentElement?.appendChild(ov);
    lineStore.set(canvas, ov);
  }
  const dpr = window.devicePixelRatio || 1;
  ov.width = canvas.clientWidth * dpr;
  ov.height = canvas.clientHeight * dpr;
  const c = ov.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.strokeStyle = '#e11d48';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(d.x0, d.y0);
  c.lineTo(d.x1, d.y1);
  c.stroke();
}

function clearLine(canvas: HTMLCanvasElement): void {
  const ov = lineStore.get(canvas);
  ov?.getContext('2d')?.clearRect(0, 0, ov.width, ov.height);
}
