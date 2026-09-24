import type { Ecg12, LeadId } from '../../engine/index.js';
import type { ViewState } from '../state/appState.js';

/** Render options beyond the view state. */
export interface RenderOpts {
  /** Leads to tint behind (selected finding). */
  highlightLeads?: readonly LeadId[];
  /** Draw J fiducial ticks. */
  markers?: boolean;
  /** Which signal to draw (dirty by default). */
  clean?: boolean;
  /** Footer text suffix (e.g. acquisition info). */
  footerExtra?: string;
}

const STD12: LeadId[] = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
const EXTRA: LeadId[] = ['V7', 'V8', 'V9', 'V3R', 'V4R'];

// Standard print order: columns of 4 rows.
const LAYOUT_3x4: LeadId[][] = [
  ['I', 'aVR', 'V1', 'V4'],
  ['II', 'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];
const LAYOUT_6x2: LeadId[][] = [
  ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'],
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
];

/** mm → px scale is derived from the canvas width so the strip fits. */
interface Cell {
  x: number; // mm
  y: number; // mm
  w: number; // mm
  h: number; // mm
  lead: LeadId;
}

function cellsForLayout(
  layout: ViewState['layout'],
  extra: boolean,
): { cols: number; rows: number; grid: LeadId[][]; strip: boolean } {
  switch (layout) {
    case '3x4':
      return { cols: 3, rows: 4, grid: LAYOUT_3x4, strip: false };
    case '3x4+II':
      return { cols: 3, rows: 4, grid: LAYOUT_3x4, strip: true };
    case '6x2':
      return { cols: 6, rows: 2, grid: LAYOUT_6x2, strip: false };
    case '12x1':
      return {
        cols: 1,
        rows: extra ? STD12.length + EXTRA.length : STD12.length,
        grid: [...STD12, ...(extra ? EXTRA : [])].map((l) => [l]),
        strip: false,
      };
  }
}

/**
 * Render the full ECG sheet onto `canvas` (paper + grid + traces).
 * DPI-aware; mm geometry is square (grid true).
 */
export function renderEcg(
  canvas: HTMLCanvasElement,
  ecg: Ecg12,
  view: ViewState,
  opts: RenderOpts = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cssW = canvas.clientWidth || 900;
  const cssH = canvas.clientHeight || 600;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const styles = getComputedStyle(document.documentElement);
  const paper = styles.getPropertyValue('--paper').trim() || '#fbfbf7';
  const minor = styles.getPropertyValue('--grid-minor').trim() || '#f3c9c9';
  const major = styles.getPropertyValue('--grid-major').trim() || '#e39a9a';

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, cssW, cssH);

  const marginMm = 8;
  const footerMm = 8;
  const { grid, strip } = cellsForLayout(view.layout, view.extraLeads);
  const cols = grid[0]?.length ?? 1;
  const rows = grid.length;
  const totalWidthMm = view.speedMmS * (layoutCellSeconds(view.layout) * cols);
  const pxPerMm = (cssW - marginMm * pxGuess(view.speedMmS)) / totalWidthMm;
  const ppm = Math.max(2, pxPerMm);
  const mx = marginMm * ppm;

  // Grid for the whole paper area.
  const gridW = totalWidthMm * ppm;
  const gridH = cssH - footerMm * ppm - mx;
  drawGrid(ctx, mx, mx, gridW, gridH, ppm, minor, major);

  const cellWMm = layoutCellSeconds(view.layout) * view.speedMmS;
  const cellHMm = gridH / ppm / (strip ? rows + 1 : rows);
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lead = grid[r]?.[c];
      if (!lead) continue;
      cells.push({ x: c * cellWMm, y: r * cellHMm, w: cellWMm, h: cellHMm, lead });
    }
  }
  if (strip) {
    cells.push({ x: 0, y: rows * cellHMm, w: cellWMm * cols, h: cellHMm, lead: 'II' });
  }
  if (view.extraLeads && view.layout === '3x4') {
    // extra row appended (no strip in this layout)
  }
  if (view.extraLeads && (view.layout === '3x4' || view.layout === '3x4+II')) {
    const baseR = strip ? rows + 1 : rows;
    EXTRA.forEach((lead, i) => {
      cells.push({
        x: i * (cellWMm * 0.6),
        y: baseR * cellHMm * 0.8,
        w: cellWMm * 0.6,
        h: cellHMm * 0.8,
        lead,
      });
    });
  }

  const sig = opts.clean ? ecg.clean : ecg.leads;
  const hi = new Set(opts.highlightLeads ?? []);
  const jTicks = opts.markers ? ecg.beats : [];

  for (const cell of cells) {
    const x0 = mx + cell.x * ppm;
    const y0 = mx + cell.y * ppm;
    const w = cell.w * ppm;
    const h = cell.h * ppm;
    const baseline = y0 + h * 0.55;
    const sPerCell = cell.w / view.speedMmS;
    const n = Math.min(sig[cell.lead].length, Math.round(sPerCell * ecg.fs));

    if (hi.has(cell.lead)) {
      ctx.fillStyle = 'rgb(45 212 191 / 0.10)';
      ctx.fillRect(x0, y0, w, h);
    }
    // Lead label.
    ctx.fillStyle = '#444';
    ctx.font = `600 ${Math.max(10, 2.8 * ppm)}px ${styles.getPropertyValue('--font') || 'sans-serif'}`;
    ctx.textBaseline = 'top';
    ctx.fillText(cell.lead, x0 + 1.5 * ppm, y0 + 1 * ppm);

    // Trace.
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const yScale = view.gainMmMv * ppm;
    for (let i = 0; i < n; i++) {
      const px = x0 + (i / ecg.fs) * view.speedMmS * ppm;
      const py = baseline - sig[cell.lead][i]! * yScale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 1 mV calibration pulse at the left edge of the first cell column.
    if (cell.x === 0) {
      const px = x0 + 0.8 * ppm;
      const mv = yScale;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, baseline);
      ctx.lineTo(px, baseline - mv);
      ctx.lineTo(px + 1.5 * ppm, baseline - mv);
      ctx.lineTo(px + 1.5 * ppm, baseline);
      ctx.stroke();
    }

    // J markers.
    for (const b of jTicks) {
      const tS = b.j / ecg.fs;
      if (tS > sPerCell) continue;
      const px = x0 + tS * view.speedMmS * ppm;
      ctx.strokeStyle = 'rgb(45 212 191 / 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, baseline - 3 * ppm);
      ctx.lineTo(px, baseline - 1.2 * ppm);
      ctx.stroke();
    }
  }

  // Footer.
  ctx.fillStyle = '#555';
  ctx.font = `${Math.max(9, 2.2 * ppm)}px ${styles.getPropertyValue('--font') || 'sans-serif'}`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `${view.speedMmS} mm/s   ${view.gainMmMv} mm/mV   ${opts.footerExtra ?? '0.05–150 Hz'}`,
    mx,
    cssH - 1.5 * ppm,
  );
}

function layoutCellSeconds(layout: ViewState['layout']): number {
  switch (layout) {
    case '3x4':
    case '3x4+II':
      return 2.5;
    case '6x2':
      return 5;
    case '12x1':
      return 10;
  }
}

function pxGuess(speed: number): number {
  return speed === 25 ? 1 : 0.8;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ppm: number,
  minor: string,
  major: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineWidth = 0.5;
  for (let gx = 0; gx <= w; gx += ppm) {
    ctx.strokeStyle = Math.round(gx / ppm) % 5 === 0 ? major : minor;
    ctx.beginPath();
    ctx.moveTo(x + gx, y);
    ctx.lineTo(x + gx, y + h);
    ctx.stroke();
  }
  for (let gy = 0; gy <= h; gy += ppm) {
    ctx.strokeStyle = Math.round(gy / ppm) % 5 === 0 ? major : minor;
    ctx.beginPath();
    ctx.moveTo(x, y + gy);
    ctx.lineTo(x + w, y + gy);
    ctx.stroke();
  }
  ctx.restore();
}
