import type { Ecg12, LeadId } from '../../engine/index.js';
import type { Delineation } from '../../analysis/delineate/delineate.js';

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
