import type { Scenario, Vec3 } from '../../engine/index.js';
import { territoryById } from '../../engine/index.js';
import type { Measurements } from '../../analysis/measure.js';

/**
 * Physics view: frontal (X/Y) and horizontal (X/Z) planes with hexaxial
 * lead axes; arrows for QRS axis, T axis, and each injury source's ST vector.
 */
export function renderVectorView(
  canvas: HTMLCanvasElement,
  scenario: Scenario,
  measurements: Measurements | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 170;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const styles = getComputedStyle(document.documentElement);
  const border = styles.getPropertyValue('--border').trim() || '#26303a';
  const muted = styles.getPropertyValue('--muted').trim() || '#8b98a5';
  const accent = styles.getPropertyValue('--accent').trim() || '#2dd4bf';
  const danger = styles.getPropertyValue('--danger').trim() || '#f87171';
  const warning = styles.getPropertyValue('--warning').trim() || '#fbbf24';

  ctx.clearRect(0, 0, w, h);
  const half = w / 2;
  drawPlane(ctx, half / 2, h / 2, Math.min(half, h) * 0.42, 'frontal', border, muted);
  drawPlane(ctx, half + half / 2, h / 2, Math.min(half, h) * 0.42, 'horizontal', border, muted);

  // Axis arrows from measured axes (deg, frontal only).
  if (measurements) {
    arrow(
      ctx,
      half / 2,
      h / 2,
      measurements.qrsAxisDeg,
      'frontal',
      Math.min(half, h) * 0.34,
      accent,
      'QRS',
    );
    arrow(
      ctx,
      half / 2,
      h / 2,
      measurements.tAxisDeg,
      'frontal',
      Math.min(half, h) * 0.3,
      warning,
      'T',
    );
  }

  // ST injury vectors: direction × |st|.
  for (const src of scenario.sources) {
    const dir =
      src.direction ?? (src.territory ? territoryById(src.territory).direction : undefined);
    if (!dir) continue;
    const mag = Math.min(Math.abs(src.st) * 30, Math.min(half, h) * 0.38);
    const sign = src.st >= 0 ? 1 : -1;
    arrowVec(
      ctx,
      half / 2,
      h / 2,
      project(dir, 'frontal'),
      mag * sign,
      danger,
      src.territory ?? 'src',
    );
    arrowVec(
      ctx,
      half + half / 2,
      h / 2,
      project(dir, 'horizontal'),
      mag * sign,
      danger,
      src.territory ?? 'src',
    );
  }
}

type Plane = 'frontal' | 'horizontal';

function project(v: Vec3, plane: Plane): [number, number] {
  // Frontal: X right, Y down (lead axes convention). Horizontal: X right, Z back→down.
  return plane === 'frontal' ? [v[0], -v[1]] : [v[0], v[2]];
}

const FRONTAL_LEADS: Array<[string, number]> = [
  ['I', 0],
  ['aVF', 90],
  ['II', 60],
  ['III', 120],
  ['aVR', -150],
  ['aVL', -30],
];
const HORIZ_LEADS: Array<[string, number]> = [
  ['V2', -15],
  ['V4', 30],
  ['V6', 75],
  ['V1', -60],
  ['V5', 60],
  ['V3', 15],
];

function drawPlane(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  plane: Plane,
  border: string,
  muted: string,
): void {
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const leads = plane === 'frontal' ? FRONTAL_LEADS : HORIZ_LEADS;
  ctx.fillStyle = muted;
  ctx.font = '9px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [name, deg] of leads) {
    const a = (deg * Math.PI) / 180;
    const x2 = cx + Math.cos(a) * r;
    const y2 = cy + Math.sin(a) * r;
    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.fillText(name, cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10));
  }
  ctx.fillStyle = muted;
  ctx.fillText(plane === 'frontal' ? 'Frontal' : 'Horizontal', cx, cy + r + 22);
}

function arrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  deg: number,
  _plane: Plane,
  len: number,
  color: string,
  label: string,
): void {
  const a = (deg * Math.PI) / 180;
  arrowVec(ctx, cx, cy, [Math.cos(a), -Math.sin(a)], len, color, label);
}

function arrowVec(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  dir: [number, number],
  len: number,
  color: string,
  label: string,
): void {
  const n = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / n;
  const uy = dir[1] / n;
  const x2 = cx + ux * len;
  const y2 = cy - uy * len;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Arrowhead.
  const ah = 6;
  const ax = x2 - ux * ah;
  const ay = y2 + uy * ah;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(ax - uy * ah * 0.5, ay - ux * ah * 0.5);
  ctx.lineTo(ax + uy * ah * 0.5, ay + ux * ah * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.font = '8px system-ui';
  ctx.fillText(label, x2 + 4, y2);
}
