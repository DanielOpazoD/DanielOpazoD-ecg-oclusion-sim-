import type { Ecg12, LeadId } from '../../engine/index.js';
import type { Delineation } from '../../analysis/delineate/delineate.js';

/** Index of the delineated beat whose QRS onset is nearest to `tSec`. */
export function pickBeat(delin: Delineation, tSec: number): number {
  let best = -1;
  let bestD = Infinity;
  delin.beats.forEach((b, i) => {
    const d = Math.abs(b.qrsOnsetS - tSec);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Display window around a beat: QRS onset −250 ms … +650 ms. */
export function beatWindow(delin: Delineation, idx: number): { t0: number; t1: number } {
  const b = delin.beats[idx];
  const on = b?.qrsOnsetS ?? 0;
  return { t0: on - 0.25, t1: on + 0.65 };
}

interface Fid {
  t: number;
  label: string;
  color: string;
}

/**
 * Wide beat-reader SVG ("un latido, de cerca"): mV axis, dotted grid, shaded
 * QRS band, fiducial dashed verticals (P / QRS / J* / T fin) and PR / QRS /
 * QT dimension lines with per-beat values in ms. `width` sets the viewBox;
 * the svg scales to 100 % of its container.
 */
export function renderBeatReaderSvg(
  ecg: Ecg12,
  delin: Delineation,
  idx: number,
  lead: LeadId,
  width = 900,
): string {
  const b = delin.beats[idx];
  if (!b) return `<svg viewBox="0 0 ${width} 230"/>`;
  const sig = ecg.leads[lead];
  const { t0, t1 } = beatWindow(delin, idx);
  const i0 = Math.max(0, Math.round(t0 * ecg.fs));
  const i1 = Math.min(sig.length, Math.round(t1 * ecg.fs));
  if (i1 - i0 < 8) return `<svg viewBox="0 0 ${width} 230"/>`;

  const H = 230;
  const xL = 46;
  const xR = width - 16;
  const plotTop = 100;
  const plotBot = 205;
  const on = b.qrsOnsetS;

  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = i0; i < i1; i++) {
    if (sig[i]! < vmin) vmin = sig[i]!;
    if (sig[i]! > vmax) vmax = sig[i]!;
  }
  vmin = Math.min(vmin, 0);
  vmax = Math.max(vmax, 0);
  const pad = Math.max((vmax - vmin) * 0.12, 0.05);
  vmin -= pad;
  vmax += pad;

  const px = (t: number) => xL + ((t - t0) / (t1 - t0)) * (xR - xL);
  const py = (v: number) => plotBot - ((v - vmin) / (vmax - vmin)) * (plotBot - plotTop);

  const parts: string[] = [];
  // Dotted grid: every 100 ms horizontally, every 0.2 mV vertically.
  const grid = '#e3e8ee';
  for (let ms = Math.ceil((t0 - on) * 10) * 100; ms <= (t1 - on) * 1000; ms += 100) {
    const x = px(on + ms / 1000);
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="${plotTop}" x2="${x.toFixed(1)}" y2="${plotBot}" stroke="${grid}" stroke-dasharray="2 3"/>`,
    );
    parts.push(
      `<text x="${x.toFixed(1)}" y="${plotBot + 14}" text-anchor="middle" font-size="10" fill="#64717f">${ms}</text>`,
    );
  }
  const vStep = 0.2;
  for (let v = Math.ceil(vmin / vStep) * vStep; v <= vmax; v += vStep) {
    const y = py(v);
    parts.push(
      `<line x1="${xL}" y1="${y.toFixed(1)}" x2="${xR}" y2="${y.toFixed(1)}" stroke="${grid}" stroke-dasharray="2 3"/>`,
    );
    parts.push(
      `<text x="${xL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="#64717f">${v.toFixed(1)}</text>`,
    );
  }
  parts.push(
    `<text x="${xL - 6}" y="${plotTop - 4}" text-anchor="end" font-size="10" fill="#64717f">mV</text>`,
  );
  parts.push(
    `<text x="${xR}" y="${plotBot + 26}" text-anchor="end" font-size="10" fill="#64717f">ms desde QRS</text>`,
  );

  // Fiducials + shaded QRS band.
  const fids: Fid[] = [];
  if (b.pOnsetS !== undefined) fids.push({ t: b.pOnsetS, label: 'P', color: '#3b6ea5' });
  fids.push({ t: b.qrsOnsetS, label: 'QRS', color: '#0f8b8d' });
  fids.push({ t: b.qrsEndS, label: 'J*', color: '#0f8b8d' });
  if (b.tEndS !== undefined) fids.push({ t: b.tEndS, label: 'T fin', color: '#7c5cbf' });
  parts.push(
    `<rect x="${px(b.qrsOnsetS).toFixed(1)}" y="${plotTop}" width="${(px(b.qrsEndS) - px(b.qrsOnsetS)).toFixed(1)}" height="${plotBot - plotTop}" fill="rgba(15,139,141,0.08)"/>`,
  );
  for (const f of fids) {
    const x = px(f.t);
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="${plotTop}" x2="${x.toFixed(1)}" y2="${plotBot}" stroke="${f.color}" stroke-dasharray="4 3"/>`,
      `<text x="${x.toFixed(1)}" y="${plotTop - 4}" text-anchor="middle" font-size="10" fill="${f.color}">${f.label}</text>`,
    );
  }

  // Waveform.
  let pts = '';
  for (let i = i0; i < i1; i++) pts += `${px(i / ecg.fs).toFixed(1)},${py(sig[i]!).toFixed(1)} `;
  parts.push(
    `<polyline points="${pts}" fill="none" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/>`,
  );
  // Dots on the fiducials.
  for (const f of fids) {
    const fi = Math.min(sig.length - 1, Math.max(0, Math.round(f.t * ecg.fs)));
    parts.push(
      `<circle cx="${px(f.t).toFixed(1)}" cy="${py(sig[fi]!).toFixed(1)}" r="3" fill="${f.color}"/>`,
    );
  }

  // Dimension lines (staggered rows above the fiducial labels).
  const dim = (x0: number, x1: number, y: number, color: string, label: string) => {
    parts.push(
      `<line x1="${x0.toFixed(1)}" y1="${y}" x2="${x1.toFixed(1)}" y2="${y}" stroke="${color}"/>`,
      `<line x1="${x0.toFixed(1)}" y1="${y - 4}" x2="${x0.toFixed(1)}" y2="${y + 4}" stroke="${color}"/>`,
      `<line x1="${x1.toFixed(1)}" y1="${y - 4}" x2="${x1.toFixed(1)}" y2="${y + 4}" stroke="${color}"/>`,
      `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="600" font-family="ui-monospace,monospace" fill="${color}">${label}</text>`,
    );
  };
  if (b.pOnsetS !== undefined)
    dim(px(b.pOnsetS), px(on), 44, '#3b6ea5', `PR ${Math.round((on - b.pOnsetS) * 1000)} ms`);
  dim(px(on), px(b.qrsEndS), 62, '#0f8b8d', `QRS ${Math.round((b.qrsEndS - on) * 1000)} ms`);
  if (b.tEndS !== undefined)
    dim(px(on), px(b.tEndS), 80, '#7c5cbf', `QT ${Math.round((b.tEndS - on) * 1000)} ms`);

  return `<svg viewBox="0 0 ${width} ${H}" width="100%" role="img" aria-label="Latido ${idx + 1} en ${lead}">${parts.join('')}</svg>`;
}

/**
 * Beat-detail SVG: one representative beat per chosen lead with delineated
 * fiducials (P onset, QRS onset/end, J, T end) and optional truth overlay
 * (dashed markers from ecg.beats). Adapted from simuladorecg's beat detail.
 */
export function renderBeatDetailSvg(
  ecg: Ecg12,
  delineation: Delineation | null,
  lead: LeadId = 'II',
  opts: { showTruth?: boolean; width?: number; height?: number } = {},
): string {
  const w = opts.width ?? 340;
  const h = opts.height ?? 120;
  const sig = ecg.leads[lead];
  const beatIdx = delineation?.beats.findIndex((b) => b.qrsOnsetS > 0.15) ?? -1;
  const d = beatIdx >= 0 ? (delineation?.beats[beatIdx] ?? null) : null;
  // Window: 200 ms before QRS onset → 500 ms after.
  const qrsT = d?.qrsOnsetS ?? (ecg.beats[1]?.qrsOnset ?? ecg.fs) / ecg.fs;
  const t0 = qrsT - 0.22;
  const t1 = qrsT + 0.55;
  const i0 = Math.max(0, Math.round(t0 * ecg.fs));
  const i1 = Math.min(sig.length, Math.round(t1 * ecg.fs));
  if (i1 - i0 < 8) return `<svg width="${w}" height="${h}"/>`;
  let min = Infinity;
  let max = -Infinity;
  for (let i = i0; i < i1; i++) {
    if (sig[i]! < min) min = sig[i]!;
    if (sig[i]! > max) max = sig[i]!;
  }
  const span = Math.max(max - min, 0.4);
  const pad = span * 0.15;
  min -= pad;
  max += pad;
  const px = (i: number) => ((i / ecg.fs - t0) / (t1 - t0)) * w;
  const py = (v: number) => h - ((v - min) / (max - min)) * h;

  let pts = '';
  for (let i = i0; i < i1; i++) pts += `${px(i).toFixed(1)},${py(sig[i]!).toFixed(1)} `;

  const marks: string[] = [];
  const mark = (x: number, color: string, label: string, dash = false) =>
    marks.push(
      `<line x1="${x}" y1="0" x2="${x}" y2="${h - 12}" stroke="${color}" stroke-width="1" ${dash ? 'stroke-dasharray="3 2"' : ''}/>` +
        `<text x="${x + 2}" y="${h - 3}" font-size="8" fill="${color}">${label}</text>`,
    );

  if (d) {
    if (d.pOnsetS !== undefined) mark(px(d.pOnsetS * ecg.fs), '#0f8b8d', 'P');
    mark(px(d.qrsOnsetS * ecg.fs), '#e11d48', 'Q');
    mark(px(d.qrsEndS * ecg.fs), '#e11d48', 'J');
    if (d.tEndS !== undefined) mark(px(d.tEndS * ecg.fs), '#b45309', 'T');
  }
  if (opts.showTruth && beatIdx >= 0 && beatIdx < ecg.beats.length) {
    const truth = ecg.beats[beatIdx + 1] ?? ecg.beats[beatIdx];
    if (truth) {
      if (truth.pOnset !== undefined) mark(px(truth.pOnset), '#0f8b8d', '', true);
      mark(px(truth.qrsOnset), '#e11d48', '', true);
      mark(px(truth.j), '#e11d48', '', true);
      if (truth.tEnd !== undefined) mark(px(truth.tEnd), '#b45309', '', true);
    }
  }

  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Detalle del latido ${lead}">
    <rect width="${w}" height="${h}" fill="var(--paper,#fffaf8)"/>
    <polyline points="${pts.trim()}" fill="none" stroke="var(--trace,#16191d)" stroke-width="1.3"/>
    ${marks.join('')}
    <text x="4" y="11" font-size="10" fill="var(--muted,#64717f)">${lead}</text>
  </svg>`;
}
