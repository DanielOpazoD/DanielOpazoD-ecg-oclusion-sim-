/**
 * Click-drag calipers over the ECG canvas: shows Δt (ms) and ΔV (mV).
 * Esc clears. Requires the same mm geometry as the renderer — we recompute
 * px-per-mm from the canvas width and the active view.
 */
export interface CaliperState {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  active: boolean;
}

export function attachCalipers(
  canvas: HTMLCanvasElement,
  getPpm: () => { pxPerMm: number; marginPx: number },
  getGain: () => number,
): () => void {
  let drag: CaliperState | null = null;
  let overlay: HTMLDivElement | null = null;

  const ensureOverlay = () => {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'caliper-overlay';
      overlay.style.cssText =
        'position:absolute;pointer-events:none;background:#111;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-variant-numeric:tabular-nums;z-index:5;';
      canvas.parentElement?.appendChild(overlay);
    }
    return overlay;
  };

  const onDown = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    drag = { x0: e.clientX - r.left, y0: e.clientY - r.top, x1: 0, y1: 0, active: true };
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag?.active) return;
    const r = canvas.getBoundingClientRect();
    drag.x1 = e.clientX - r.left;
    drag.y1 = e.clientY - r.top;
    const { pxPerMm } = getPpm();
    const o = ensureOverlay();
    const dtMm = Math.abs(drag.x1 - drag.x0) / pxPerMm;
    const dvMm = Math.abs(drag.y1 - drag.y0) / pxPerMm;
    const gain = getGain();
    o.textContent = `Δt ${(dtMm * 40).toFixed(0)} ms · ΔV ${(dvMm / gain).toFixed(2)} mV (${dvMm.toFixed(1)} mm)`;
    o.style.left = `${Math.max(drag.x0, drag.x1) + 8}px`;
    o.style.top = `${Math.min(drag.y0, drag.y1) - 20}px`;
    drawLine(canvas, drag);
  };
  const onUp = () => {
    if (drag) drag.active = false;
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
