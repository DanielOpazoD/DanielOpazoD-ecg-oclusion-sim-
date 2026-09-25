import type { AnalysisReport, Finding } from '../../analysis/index.js';
import { bib } from '../data/bibliography.js';
import type { LeadId } from '../../engine/index.js';
import { store } from '../state/appState.js';

const OMI_IDS = new Set([
  'stemi-udmi4',
  'posterior-std',
  'de-winter',
  'hyperacute-t',
  'aslanger',
  'rv-involvement',
  'avr-diffuse-std',
  'south-african-flag',
  'reciprocal-avl',
  'smith-3v',
  'smith-4v',
  'terminal-qrs-distortion',
  'wellens',
  'pathological-q',
  'sgarbossa',
  'sgarbossa-modified',
  'barcelona',
  'u-ubiquitous',
]);
const RHYTHM_IDS = new Set([
  'heart-rate',
  'rr-irregular',
  'wide-qrs',
  'bundle-branch-morphology',
  'pr-prolonged',
  'pr-short',
  'av-dissociation',
  'pacing',
  'flutter-waves',
  'axis-deviation',
]);
const REPOL_IDS = new Set(['qtc-prolonged', 'qtc-short', 'peaked-t', 'u-wave']);
const VOLTAGE_IDS = new Set(['lvh-voltage', 'low-voltage']);

function groupOf(f: Finding): string {
  if (OMI_IDS.has(f.id)) return 'OMI / isquemia';
  if (RHYTHM_IDS.has(f.id)) return 'Ritmo y conducción';
  if (REPOL_IDS.has(f.id)) return 'Repolarización / QT';
  if (VOLTAGE_IDS.has(f.id)) return 'Voltaje / hipertrofia';
  return 'Otros';
}

const NA_RATIONALE = 'No aplicable';

/** Findings panel: OMI verdict badge, grouped finding chips, N/A section. */
export function findingsPanel(
  el: HTMLElement,
  report: AnalysisReport | null,
  onHighlight: (leads: LeadId[] | null) => void,
): void {
  el.innerHTML = '';
  if (!report) {
    el.innerHTML = '<div class="card"><p class="mono">Sin análisis.</p></div>';
    return;
  }

  const head = document.createElement('div');
  head.className = 'card';
  const stemi = report.findings.find((f) => f.id === 'stemi-udmi4');
  const audit = report.measurementAudit;
  head.innerHTML = `
    <h3>Veredicto <span class="badge muted blind-chip" title="Mediciones obtenidas solo de la señal y la delineación independiente">Medido en señal (ciego)</span></h3>
    ${
      audit && audit.status !== 'usable'
        ? `<p><span class="ev-badge ev-${audit.status === 'review' ? 'review' : 'na'}" title="${audit.note}">⚠ medición</span> <small>${audit.note}</small></p>`
        : ''
    }
    <p>
      <span class="badge ${report.omi.positive ? 'danger' : 'ok'}">${
        report.omi.positive ? 'OMI probable' : 'Sin criterios de oclusión'
      }</span>
      <span class="badge ${stemi?.positive ? 'warn' : 'muted'}">${
        stemi?.positive ? 'Criterios STEMI' : 'No STEMI'
      }</span>
    </p>
    <label style="font-size:12px;color:var(--muted);display:flex;gap:6px;align-items:center;margin-top:6px">
      <input type="checkbox" id="an-src" ${store.get().analysisSource === 'acquired' ? 'checked' : ''}>
      Analizar señal adquirida (con ruido/filtros)
    </label>`;
  head.querySelector('#an-src')?.addEventListener('change', (e) => {
    store.update({ analysisSource: (e.target as HTMLInputElement).checked ? 'acquired' : 'clean' });
  });
  el.appendChild(head);

  const na = report.findings.filter((f) => f.rationale.startsWith(NA_RATIONALE));
  const applicable = report.findings.filter(
    (f) => f.id !== 'omi-composite' && !f.rationale.startsWith(NA_RATIONALE),
  );
  const groups = new Map<string, Finding[]>();
  for (const f of applicable) {
    const g = groupOf(f);
    groups.set(g, [...(groups.get(g) ?? []), f]);
  }
  const ORDER = [
    'OMI / isquemia',
    'Ritmo y conducción',
    'Repolarización / QT',
    'Voltaje / hipertrofia',
    'Otros',
  ];
  for (const g of ORDER) {
    const items = groups.get(g);
    if (!items?.length) continue;
    const h = document.createElement('div');
    h.className = 'group-h';
    h.textContent = g;
    el.appendChild(h);
    const list = document.createElement('div');
    for (const f of items) list.appendChild(findingRow(f, onHighlight));
    el.appendChild(list);
  }
  if (na.length) {
    const det = document.createElement('details');
    det.className = 'na-group';
    det.innerHTML = `<summary>No aplicables en este contexto · ${na.length}</summary>`;
    const list = document.createElement('div');
    for (const f of na) list.appendChild(findingRow(f, onHighlight));
    det.appendChild(list);
    el.appendChild(det);
  }
}

function findingRow(f: Finding, onHighlight: (leads: LeadId[] | null) => void): DocumentFragment {
  const frag = document.createDocumentFragment();
  const chip = document.createElement('button');
  chip.className = `finding-chip ${f.positive ? 'pos' : 'neg'}`;
  chip.innerHTML = `<span>${f.label}</span><span class="mono">${f.positive ? '✓' : '·'}${
    f.score !== undefined ? ` ${f.score.toFixed(1)}` : ''
  }</span>`;
  const detail = document.createElement('div');
  detail.className = 'finding-detail';
  detail.hidden = true;
  detail.innerHTML = `<p>${f.rationale}</p>
    <p class="vals">${Object.entries(f.values)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(' · ')}</p>
    <p>${f.refs
      .map((n) => {
        const b = bib(n);
        return b?.url
          ? `<a href="${b.url}" target="_blank" rel="noreferrer" style="color:var(--accent)">[${n}]</a>`
          : `[${n}]`;
      })
      .join(' ')}</p>`;
  chip.setAttribute('aria-expanded', 'false');
  chip.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    chip.setAttribute('aria-expanded', String(!detail.hidden));
    onHighlight(detail.hidden ? null : f.leads);
  });
  frag.appendChild(chip);
  frag.appendChild(detail);
  return frag;
}
