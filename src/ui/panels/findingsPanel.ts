import type { AnalysisReport, Finding } from '../../analysis/index.js';
import { bib } from '../data/bibliography.js';
import { LEAD_IDS, type LeadId } from '../../engine/index.js';
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

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One-sentence verdict: STEMI criteria line + up to two positive OMI-group
 * findings as supporting evidence. Pure — unit-tested.
 */
export function verdictSentence(report: AnalysisReport): string {
  const stemi = report.findings.find((f) => f.id === 'stemi-udmi4')?.positive;
  let s = stemi ? 'Cumple criterios STEMI.' : 'No cumple criterios STEMI.';
  const posOmi = report.findings.filter(
    (f) => f.positive && OMI_IDS.has(f.id) && f.id !== 'stemi-udmi4' && f.id !== 'omi-composite',
  );
  if (posOmi.length) {
    const names = posOmi
      .slice(0, 2)
      .map((f) => lower(f.label))
      .join(' y ');
    s += ` ${upper(names)} apoyan oclusión.`;
  }
  return s;
}

/**
 * Compress a lead list for display: consecutive leads in standard order
 * become `V2–V4`; otherwise a comma list. At most 4 items, then «…».
 */
export function leadRange(leads: LeadId[]): string {
  if (!leads.length) return '';
  const idx = (l: LeadId) => LEAD_IDS.indexOf(l);
  const sorted = [...leads].sort((a, b) => idx(a) - idx(b));
  const parts: string[] = [];
  let run: LeadId[] = [sorted[0]!];
  const flush = () => {
    parts.push(run.length >= 2 ? `${run[0]}–${run[run.length - 1]}` : (run[0] as string));
    run = [];
  };
  for (const l of sorted.slice(1)) {
    if (idx(l) === idx(run[run.length - 1]!) + 1) run.push(l);
    else {
      flush();
      run = [l];
    }
  }
  flush();
  return parts.length > 4 ? `${parts.slice(0, 4).join(', ')}…` : parts.join(', ');
}

/** «Lectura» tab: verdict card + positive findings + expandable criteria. */
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

  // 1. Verdict card.
  const verd = document.createElement('div');
  verd.className = 'card verd';
  const audit = report.measurementAudit;
  verd.innerHTML = `
    <span class="kicker" title="Mediciones obtenidas solo de la señal y la delineación independiente">Veredicto · medido en la señal</span>
    <h2 class="${report.omi.positive ? 'danger' : 'ok'}">
      ${report.omi.positive ? 'OMI probable' : 'Sin criterios de oclusión'}</h2>
    <p>${verdictSentence(report)}</p>
    ${
      audit && audit.status !== 'usable'
        ? `<p class="audit" title="${audit.note}">⚠ Medición con reservas — ${audit.note}</p>`
        : ''
    }
    <label class="src-row">
      <input type="checkbox" id="an-src" ${store.get().analysisSource === 'acquired' ? 'checked' : ''}>
      Analizar señal adquirida (con ruido/filtros)
    </label>`;
  verd.querySelector('#an-src')?.addEventListener('change', (e) => {
    store.update({ analysisSource: (e.target as HTMLInputElement).checked ? 'acquired' : 'clean' });
  });
  el.appendChild(verd);

  // 2. Positive findings as quiet rows.
  const na = report.findings.filter((f) => f.rationale.startsWith(NA_RATIONALE));
  const applicable = report.findings.filter(
    (f) => f.id !== 'omi-composite' && !f.rationale.startsWith(NA_RATIONALE),
  );
  const positives = applicable.filter((f) => f.positive);

  const find = document.createElement('div');
  find.className = 'card find';
  find.innerHTML = `<span class="kicker">Hallazgos</span>`;
  if (!positives.length) {
    find.insertAdjacentHTML('beforeend', '<p class="none-pos">Sin hallazgos positivos.</p>');
  }
  for (const f of positives) find.appendChild(findRow(f, onHighlight));
  el.appendChild(find);

  // 3. Full evaluated-criteria list, collapsed by default (N/A last).
  const more = document.createElement('button');
  more.className = 'more';
  more.id = 'find-all';
  more.setAttribute('aria-expanded', 'false');
  more.textContent = `Ver los ${applicable.length + na.length} criterios evaluados ›`;
  const all = document.createElement('div');
  all.id = 'find-all-list';
  all.hidden = true;
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
    h.className = 'grp';
    h.textContent = g;
    all.appendChild(h);
    for (const f of items) all.appendChild(findRow(f, onHighlight));
  }
  if (na.length) {
    const h = document.createElement('div');
    h.className = 'grp';
    h.textContent = 'No aplicables en este contexto';
    all.appendChild(h);
    for (const f of na) all.appendChild(findRow(f, onHighlight, true));
  }
  more.addEventListener('click', () => {
    all.hidden = !all.hidden;
    more.setAttribute('aria-expanded', String(!all.hidden));
    more.textContent = all.hidden
      ? `Ver los ${applicable.length + na.length} criterios evaluados ›`
      : 'Ocultar criterios ‹';
  });
  find.appendChild(more);
  find.appendChild(all);
}

/** One quiet finding row: status dot · label · leads; click toggles detail. */
function findRow(
  f: Finding,
  onHighlight: (leads: LeadId[] | null) => void,
  na = false,
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const btn = document.createElement('button');
  btn.className = 'f';
  // Límite evidence (score < 1 or rationale says so) gets a warning dot.
  const borderline =
    f.positive && ((f.score !== undefined && f.score < 1) || /l[íi]mite/i.test(f.rationale));
  const dot = na || !f.positive ? 'n' : borderline ? 'w' : '';
  const leadsTxt = na ? 'N/A' : borderline && !f.leads.length ? 'límite' : leadRange(f.leads);
  // Long lead lists get their own muted line under the label.
  if (leadsTxt.length > 10) btn.classList.add('wide');
  btn.innerHTML = `<i class="${dot}"></i><span>${f.label}</span>
    <span class="leads">${leadsTxt}</span>`;
  const detail = document.createElement('div');
  detail.className = 'f-detail';
  detail.hidden = true;
  detail.innerHTML = `<p>${f.rationale}</p>
    <p class="vals">${Object.entries(f.values)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(' · ')}</p>
    <p>${f.refs
      .map((n) => {
        const b = bib(n);
        return b?.url ? `<a href="${b.url}" target="_blank" rel="noreferrer">[${n}]</a>` : `[${n}]`;
      })
      .join(' ')}</p>`;
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    btn.setAttribute('aria-expanded', String(!detail.hidden));
    onHighlight(detail.hidden ? null : f.leads);
  });
  frag.appendChild(btn);
  frag.appendChild(detail);
  return frag;
}
