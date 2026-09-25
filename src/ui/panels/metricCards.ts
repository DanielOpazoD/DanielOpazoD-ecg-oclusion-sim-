import type { AnalysisReport } from '../../analysis/index.js';
import type { Delineation } from '../../analysis/delineate/delineate.js';

/** One metric card value + evidence state. */
export interface MetricCard {
  label: string;
  value: string;
  sub?: string | undefined;
  /** Extra detail shown as the card tooltip (e.g. all QTc formulas). */
  title?: string | undefined;
  status: 'usable' | 'review' | 'unavailable';
  note?: string | undefined;
}

/**
 * Map the delineation + report onto the metric-card row. Exported pure so
 * the evidence mapping is unit-testable without a DOM.
 */
export function metricCards(
  delineation: Delineation | null,
  report: AnalysisReport | null,
): MetricCard[] {
  const d = delineation;
  const ev = (k: keyof Delineation['evidence']) =>
    d?.evidence[k] ?? { status: 'unavailable' as const, note: 'sin delineación' };
  const num = (v: number | null, digits = 0, unit = '') =>
    v === null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${unit}`;

  const qtcLine = d
    ? `Bazett ${num(d.qtc.bazett)} · Fridericia ${num(d.qtc.fridericia)} · Framingham ${num(d.qtc.framingham)} · Hodges ${num(d.qtc.hodges)} ms`
    : undefined;

  const regularity =
    d?.rhythmRegularity === 'regular'
      ? 'regular'
      : d?.rhythmRegularity === 'regularly-irregular'
        ? 'irregular organizado'
        : d?.rhythmRegularity === 'irregular'
          ? 'irregular'
          : '—';
  // Atrial rate only adds information when it clearly differs from the
  // ventricular rate (dissociation) or the ventricular rate is unknown.
  const hrV = d?.hrBpm ?? null;
  const atrialInformative =
    d?.atrialRateBpm != null && (hrV === null || Math.abs(d.atrialRateBpm - hrV) > hrV * 0.1);

  return [
    {
      label: 'FC',
      value: `${num(d?.hrBpm ?? report?.measurements.hrBpm ?? null)} lpm`,
      sub: atrialInformative ? `auricular ${num(d.atrialRateBpm)}` : regularity,
      status: ev('hr').status,
      note: ev('hr').note,
    },
    {
      label: 'PR',
      value: `${num(d?.prMs ?? null)} ms`,
      status: ev('pr').status,
      note: ev('pr').note,
    },
    {
      label: 'QRS',
      value: `${num(d?.qrsMs ?? null)} ms`,
      status: ev('qrs').status,
      note: ev('qrs').note,
    },
    {
      label: 'QT / QTcF',
      value: `${num(d?.qtMs ?? null)} ms`,
      sub: `QTcF ${num(d?.qtc.fridericia ?? null)} ms`,
      title: qtcLine,
      status: ev('qt').status,
      note: ev('qt').note,
    },
    {
      label: 'Ejes P·QRS·T',
      value: `${num(d?.axisDeg.p ?? null)}°·${num(d?.axisDeg.qrs ?? null)}°·${num(d?.axisDeg.t ?? null)}°`,
      status: ev('axis').status,
      note: ev('axis').note,
    },
    {
      label: 'Ritmo',
      value: regularity,
      sub: d?.pacingSpikes.length ? `espigas ${d.pacingSpikes.length}` : undefined,
      status: d ? 'usable' : 'unavailable',
    },
    {
      label: 'Calidad',
      value: d ? `${(d.noiseMv * 1000).toFixed(0)} µV RMS` : '—',
      sub: d?.quality,
      status: d ? (d.noiseMv < 0.03 ? 'usable' : 'review') : 'unavailable',
    },
  ];
}

/** Render the metric-card row into `el` (below the ECG paper). */
export function renderMetricCards(el: HTMLElement, cards: MetricCard[]): void {
  el.innerHTML = '';
  for (const c of cards) {
    const card = document.createElement('div');
    card.className = `metric-card ev-${c.status}`;
    const badge =
      c.status === 'usable'
        ? '<span class="ev-badge ev-usable" title="Evidencia utilizable">●</span>'
        : c.status === 'review'
          ? `<span class="ev-badge ev-review" title="${escapeAttr(c.note ?? 'revisar')}">◐</span>`
          : `<span class="ev-badge ev-na" title="${escapeAttr(c.note ?? 'no disponible')}">—</span>`;
    if (c.title) card.title = c.title;
    card.innerHTML = `<div class="mc-label">${escapeHtml(c.label)} ${badge}</div>
      <div class="mc-value num">${escapeHtml(c.value)}</div>
      ${c.sub ? `<div class="mc-sub" title="${escapeAttr(c.sub)}">${escapeHtml(c.sub)}</div>` : ''}`;
    el.appendChild(card);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
