import type { Ecg12, LeadId } from '../../engine/index.js';
import type { ViewState } from '../state/appState.js';
import { strokeMinMax } from './downsample.js';

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
// Cabrera order: aVL, I, −aVR, II, aVF, III — −aVR drawn negated, labelled '−aVR'.
const LAYOUT_3x4_CABRERA: LeadId[][] = [
  ['aVL', 'aVF', 'V1', 'V4'],
  ['I', 'III', 'V2', 'V5'],
  ['aVR', 'II', 'V3', 'V6'],
];
const CABRERA_INVERT: ReadonlySet<LeadId> = new Set(['aVR']);
const LAYOUT_6x2: LeadId[][] = [
  ['I', 'II', 'III', 'aVR', 'aVL', 'aVF'],
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
];
const LAYOUT_6x2_CABRERA: LeadId[][] = [
  ['aVL', 'I', 'aVR', 'II', 'aVF', 'III'],
  ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
];
const STRIPS_3: LeadId[] = ['II', 'V1', 'V5'];

/** Export for tests: the lead order a view produces (limb grid). */
export function leadOrderFor(view: Pick<ViewState, 'layout' | 'cabrera'>): LeadId[][] {
  switch (view.layout) {
    case '6x2':
      return view.cabrera ? LAYOUT_6x2_CABRERA : LAYOUT_6x2;
    case '12x1':
      return [view.cabrera ? LAYOUT_6x2_CABRERA[0]! : STD12.slice(0, 6), STD12.slice(6)];
    default:
      return view.cabrera ? LAYOUT_3x4_CABRERA : LAYOUT_3x4;
  }
}

interface Cell {
  x: number; // mm
  y: number; // mm
  w: number; // mm
  h: number; // mm
  lead: LeadId;
  /** seconds into the recording this cell starts at (sequential mode). */
  tStartS: number;
  invert: boolean;
}

function layoutCellSeconds(layout: ViewState['layout']): number {
  switch (layout) {
    case '3x4':
    case '3x4+II':
    case '3x4+3strips':
      return 2.5;
    case '6x2':
      return 5;
    case '12x1':
      return 10;
  }
}

/**
 * Render the full ECG sheet onto `canvas` (paper + grid + traces).
 * DPI-aware; mm geometry is square (grid true). Traces are rasterized with
 * per-column min/max so narrow spikes survive downsampling.
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
  const paper = styles.getPropertyValue('--paper').trim() || '#fffaf8';
  const minor = styles.getPropertyValue('--grid-minor').trim() || '#f7d9d9';
  const major = styles.getPropertyValue('--grid-major').trim() || '#eaa9a9';
  const trace = styles.getPropertyValue('--trace').trim() || '#16191d';

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, cssW, cssH);

  const marginMm = 8;
  const footerMm = 8;
  const cellSec = layoutCellSeconds(view.layout);
  const grid = leadOrderFor(view);
  const cols = view.layout === '12x1' ? 1 : (grid[0]?.length ?? 1);
  const rows =
    view.layout === '12x1' ? STD12.length + (view.extraLeads ? EXTRA.length : 0) : grid.length;
  const stripRows = view.layout === '3x4+II' ? 1 : view.layout === '3x4+3strips' ? 3 : 0;
  const stripLead =
    view.layout === '3x4+II' ? ['II' as LeadId] : view.layout === '3x4+3strips' ? STRIPS_3 : [];

  const totalWidthMm = view.speedMmS * cellSec * cols;
  const pxPerMm = (cssW - marginMm * 2 * pxGuess(view.speedMmS)) / totalWidthMm;
  const ppm = Math.max(2, pxPerMm);
  const mx = marginMm * ppm;

  const gridW = totalWidthMm * ppm;
  const gridH = cssH - footerMm * ppm - mx;
  drawGrid(ctx, mx, mx, gridW, gridH, ppm, minor, major);

  const cellWMm = cellSec * view.speedMmS;
  const extraRows = view.extraLeads && view.layout !== '12x1' ? 1 : 0;
  const cellHMm = gridH / ppm / (rows + stripRows + extraRows);
  const cells: Cell[] = [];

  const rowLead = (r: number, c: number): LeadId | null => {
    if (view.layout === '12x1') {
      const seq = [...STD12, ...(view.extraLeads ? EXTRA : [])];
      return seq[r] ?? null;
    }
    return grid[r]?.[c] ?? null;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lead = rowLead(r, c);
      if (!lead) continue;
      // Sequential: columns march through time (2.5 s each from t=0).
      // Simultaneous: every column shows the same window from t=0.
      const tStartS = view.simultaneous ? 0 : c * cellSec;
      const invert = view.cabrera && CABRERA_INVERT.has(lead);
      cells.push({ x: c * cellWMm, y: r * cellHMm, w: cellWMm, h: cellHMm, lead, tStartS, invert });
    }
  }
  // Rhythm strips: full-width, configurable 10/30/60 s.
  stripLead.forEach((lead, i) => {
    cells.push({
      x: 0,
      y: (rows + i) * cellHMm,
      w: Math.min(cellWMm * cols, view.stripS * view.speedMmS),
      h: cellHMm,
      lead,
      tStartS: 0,
      invert: false,
    });
  });
  if (view.extraLeads && view.layout !== '12x1') {
    const baseR = rows + stripRows;
    EXTRA.forEach((lead, i) => {
      cells.push({
        x: i * (cellWMm * 0.6),
        y: baseR * cellHMm * 0.85,
        w: cellWMm * 0.6,
        h: cellHMm * 0.85,
        lead,
        tStartS: i * cellSec * 0.6,
        invert: false,
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
    const i0 = Math.round(cell.tStartS * ecg.fs);
    const n = Math.min(sig[cell.lead].length - i0, Math.round(sPerCell * ecg.fs));

    if (hi.has(cell.lead)) {
      ctx.fillStyle = 'rgb(15 139 141 / 0.10)';
      ctx.fillRect(x0, y0, w, h);
    }
    ctx.fillStyle = trace;
    ctx.font = `600 ${Math.max(10, 2.8 * ppm)}px ${styles.getPropertyValue('--font') || 'sans-serif'}`;
    ctx.textBaseline = 'top';
    const label = cell.invert ? `−${cell.lead}` : cell.lead;
    ctx.fillText(label, x0 + 1.5 * ppm, y0 + 1 * ppm);

    if (n > 0) {
      ctx.strokeStyle = trace;
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'round';
      const yScale = view.gainMmMv * ppm * (cell.invert ? -1 : 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, w, h);
      ctx.clip();
      strokeMinMax(ctx, sig[cell.lead], ecg.fs, x0, baseline, view.speedMmS * ppm, yScale, n, i0);
      ctx.restore();
    }

    // 1 mV calibration pulse at the left edge of the first column.
    if (cell.x === 0 && !cell.invert) {
      const px = x0 + 0.8 * ppm;
      const mv = view.gainMmMv * ppm;
      ctx.strokeStyle = trace;
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
      const tS = b.j / ecg.fs - cell.tStartS;
      if (tS < 0 || tS > sPerCell) continue;
      const px = x0 + tS * view.speedMmS * ppm;
      ctx.strokeStyle = 'rgb(15 139 141 / 0.8)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, baseline - 3 * ppm);
      ctx.lineTo(px, baseline - 1.2 * ppm);
      ctx.stroke();
    }
  }

  ctx.fillStyle = trace;
  ctx.font = `${Math.max(9, 2.2 * ppm)}px ${styles.getPropertyValue('--font') || 'sans-serif'}`;
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `${view.speedMmS} mm/s   ${view.gainMmMv} mm/mV   ${opts.footerExtra ?? '0.05–150 Hz'}   ${view.cabrera ? 'Cabrera' : 'estándar'} · ${view.simultaneous ? 'simultáneo' : 'secuencial'}`,
    mx,
    cssH - 1.5 * ppm,
  );
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
