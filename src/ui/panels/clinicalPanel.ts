import type { CaseDefinition } from '../../cases/types.js';
import { store, isBlind } from '../state/appState.js';
import type { AppState } from '../state/appState.js';

/** Vignette card: patient badge, history, vitals, troponin, onset time. */
export function clinicalPanel(el: HTMLElement, c: CaseDefinition | null, state: AppState): void {
  if (!c) {
    el.innerHTML = `<div class="card"><h3>Paciente</h3><p class="mono">
      ${state.patient.age} años · ${state.patient.sex === 'M' ? 'Varón' : 'Mujer'}<br>
      Modo laboratorio — sin viñeta clínica.</p></div>`;
    return;
  }
  const v = c.vignette;
  // Bold lead-in = first sentence of the vignette history.
  const dot = v.history.indexOf('. ');
  const lead = dot > 0 ? v.history.slice(0, dot + 1) : '';
  const rest = dot > 0 ? v.history.slice(dot + 1) : v.history;
  el.innerHTML = `
    <div class="card pat">
      <p>${lead ? `<b>${escapeHtml(lead)}</b> ` : ''}${escapeHtml(rest)}</p>
      <p class="meta">${v.age} años · ${v.sex === 'M' ? 'Varón' : 'Mujer'}${
        v.symptomsOnsetMin ? ` · inicio ${v.symptomsOnsetMin} min` : ''
      }${v.vitals ? ` · Constantes: ${escapeHtml(v.vitals)}` : ''}${
        v.troponin ? ` · Troponina: ${escapeHtml(v.troponin)}` : ''
      }</p>
      ${isBlind(state) ? '' : '<button id="open-lab" class="btn quiet" style="margin-top:8px">Abrir en laboratorio</button>'}
    </div>`;
  el.querySelector('#open-lab')?.addEventListener('click', () => {
    // Keep the case scenario + tMin; just switch to lab mode.
    store.update({ mode: 'lab', panelTab: 'lab', playing: false });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
