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
  el.innerHTML = `
    <div class="card">
      <h3>Vignette clínica</h3>
      <p><span class="badge muted">${v.age} años · ${v.sex === 'M' ? 'Varón' : 'Mujer'}</span>
         ${v.symptomsOnsetMin ? `<span class="badge warn">desde inicio ${v.symptomsOnsetMin} min</span>` : ''}</p>
      <p>${escapeHtml(v.history)}</p>
      ${v.vitals ? `<p class="mono">Constantes: ${escapeHtml(v.vitals)}</p>` : ''}
      ${v.troponin ? `<p class="mono">Troponina: ${escapeHtml(v.troponin)}</p>` : ''}
      ${isBlind(state) ? '' : '<button id="open-lab" style="margin-top:8px">Abrir en laboratorio</button>'}
    </div>`;
  el.querySelector('#open-lab')?.addEventListener('click', () => {
    // Keep the case scenario + tMin; just switch to lab mode.
    store.update({ mode: 'lab', panelTab: 'lab', playing: false });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
