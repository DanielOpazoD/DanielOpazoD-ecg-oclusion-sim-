import type { AnalysisReport } from '../../analysis/index.js';
import type { Delineation } from '../../analysis/delineate/delineate.js';
import { store } from '../state/appState.js';

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
      label: 'Eje QRS',
      value: `${num(d?.axisDeg.qrs ?? null)}°`,
      sub: d ? `P ${num(d.axisDeg.p)}° · T ${num(d.axisDeg.t)}°` : undefined,
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
      value: d ? `${(d.noiseMv * 1000).toFixed(0)} µV` : '—',
      sub: d ? `RMS · ${d.quality}` : undefined,
      status: d ? (d.noiseMv < 0.03 ? 'usable' : 'review') : 'unavailable',
    },
  ];
}

/**
 * Render the measurements line into `el` (the `.card meas` below the paper):
 * label over value with an evidence dot, then the «Un latido, de cerca ›»
 * link that toggles the beat card (view.beatOpen).
 */
export function renderMetricCards(el: HTMLElement, cards: MetricCard[]): void {
  el.innerHTML = '';
  const SHOWN = ['FC', 'PR', 'QRS', 'QT / QTcF', 'Eje QRS', 'Ritmo'];
  const LABEL: Record<string, string> = {
    FC: 'Frecuencia',
    'Eje QRS': 'Eje',
    'QT / QTcF': 'QT / QTc',
  };
  for (const c of cards) {
    if (!SHOWN.includes(c.label)) continue;
    const m = document.createElement('div');
    m.className = 'm';
    const dot =
      c.status === 'unavailable'
        ? ''
        : `<span class="ev-dot ${c.status}" title="${escapeAttr(c.note ?? c.status)}"></span>`;
    // QT / QTc reads "374 / 432" — merge value and the QTcF sub.
    const qtMs = c.value.match(/\d+/);
    const qtcMs = c.sub?.match(/\d+/);
    const display = c.label === 'QT / QTcF' && qtMs && qtcMs ? `${qtMs[0]} / ${qtcMs[0]}` : c.value;
    const tip = [c.title, c.sub && c.label !== 'QT / QTcF' ? c.sub : null]
      .filter(Boolean)
      .join(' — ');
    if (tip) m.title = tip;
    m.innerHTML = `${escapeHtml(LABEL[c.label] ?? c.label)}<b>${escapeHtml(display)}${dot}</b>`;
    el.appendChild(m);
  }
  const link = document.createElement('button');
  link.className = 'br-link';
  link.id = 'meas-beat';
  const open = store.get().view.beatOpen;
  link.textContent = `Un latido, de cerca ${open ? '‹' : '›'}`;
  link.setAttribute('aria-expanded', String(open));
  link.setAttribute('aria-controls', 'beat-card');
  link.addEventListener('click', () => {
    const s = store.get();
    store.update({ view: { ...s.view, beatOpen: !s.view.beatOpen } });
  });
  el.appendChild(link);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
