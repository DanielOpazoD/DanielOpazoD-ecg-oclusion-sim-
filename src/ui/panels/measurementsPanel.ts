import type { Measurements } from '../../analysis/measure.js';
import { LEAD_IDS } from '../../engine/index.js';

const COLS: Array<{
  key: string;
  label: string;
  get: (m: Measurements, l: (typeof LEAD_IDS)[number]) => number;
  hi?: (v: number) => boolean;
}> = [
  { key: 'stJ', label: 'ST J', get: (m, l) => m.perLead[l].stJ * 10, hi: (v) => Math.abs(v) >= 1 },
  {
    key: 'st60',
    label: 'ST 60',
    get: (m, l) => m.perLead[l].st60 * 10,
    hi: (v) => Math.abs(v) >= 1,
  },
  { key: 'rAmp', label: 'R', get: (m, l) => m.perLead[l].rAmp * 10 },
  { key: 'sAmp', label: 'S', get: (m, l) => m.perLead[l].sAmp * 10 },
  { key: 'tAmp', label: 'T', get: (m, l) => m.perLead[l].tAmp * 10 },
  {
    key: 'ratio',
    label: 'T/QRS',
    get: (m, l) => m.perLead[l].tQrsAreaRatio,
    hi: (v) => v >= 4,
  },
];

/** Measurements table (lead × metrics, mm; colored beyond thresholds). */
export function measurementsPanel(el: HTMLElement, m: Measurements | null): void {
  if (!m) {
    el.innerHTML = '<div class="card"><p class="mono">Sin mediciones.</p></div>';
    return;
  }
  const rows = LEAD_IDS.map((l) => {
    const cells = COLS.map((c) => {
      const v = c.get(m, l);
      const cls = c.hi?.(v) ? ' class="hi"' : v < -0.05 ? ' class="lo"' : '';
      return `<td${cls}>${v.toFixed(1)}</td>`;
    }).join('');
    return `<tr><td>${l}</td>${cells}</tr>`;
  }).join('');
  el.innerHTML = `
    <div class="card">
      <h3>Mediciones (mm)</h3>
      <p class="mono">FC ${m.hrBpm.toFixed(0)} · PR ${m.prMs.toFixed(0)} ms · QRS ${m.qrsWide ? '≥120' : '<120'} ms ·
      QT ${m.qt.toFixed(0)} / QTc ${m.qtcBazett.toFixed(0)} · eje QRS ${m.qrsAxisDeg.toFixed(0)}° · eje T ${m.tAxisDeg.toFixed(0)}°</p>
      <table class="meas">
        <thead><tr><th></th>${COLS.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
