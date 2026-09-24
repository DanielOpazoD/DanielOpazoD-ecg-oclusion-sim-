import type { AnalysisReport } from '../../analysis/index.js';
import { bib } from '../data/bibliography.js';
import type { LeadId } from '../../engine/index.js';
import { store } from '../state/appState.js';

/** Findings panel: OMI verdict badge, STEMI badge, expandable finding chips. */
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
  head.innerHTML = `
    <h3>Veredicto</h3>
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

  const list = document.createElement('div');
  for (const f of report.findings) {
    if (f.id === 'omi-composite') continue;
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
    chip.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      onHighlight(detail.hidden ? null : f.leads);
    });
    list.appendChild(chip);
    list.appendChild(detail);
  }
  el.appendChild(list);
}
