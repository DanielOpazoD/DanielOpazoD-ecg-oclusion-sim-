import { CASES, getCase } from '../../cases/index.js';
import type { CaseDefinition } from '../../cases/types.js';
import { store } from '../state/appState.js';

const GROUP_NAMES: Record<CaseDefinition['group'], string> = {
  A: 'STEMI evidente',
  B: 'OMI sutil / equivalentes',
  C: 'Subendocárdica / aVR',
  D: 'Imitadores',
  E: 'Seriados (dinámica)',
  F: 'Adquisición y artefactos',
};

/** Left sidebar: grouped case browser with blind-mode toggle. */
export function renderCaseBrowser(el: HTMLElement, onSelect: (c: CaseDefinition) => void): void {
  const state = store.get();
  el.innerHTML = '';
  const toggle = document.createElement('label');
  toggle.style.cssText =
    'display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted);margin-bottom:8px';
  toggle.innerHTML = `<input type="checkbox" ${state.blind ? 'checked' : ''}> Modo ciego`;
  toggle.querySelector('input')!.addEventListener('change', (e) => {
    store.update({ blind: (e.target as HTMLInputElement).checked });
  });
  el.appendChild(toggle);

  const groups: CaseDefinition['group'][] = ['A', 'B', 'C', 'D', 'E', 'F'];
  let n = 0;
  for (const g of groups) {
    const h = document.createElement('div');
    h.className = 'group-h';
    h.textContent = state.blind ? `Serie ${g}` : `${g} — ${GROUP_NAMES[g]}`;
    el.appendChild(h);
    for (const c of CASES.filter((x) => x.group === g)) {
      n++;
      const b = document.createElement('button');
      b.className = 'case-item';
      b.setAttribute('aria-current', String(state.caseId === c.id));
      b.innerHTML = state.blind
        ? `Caso ${n} <span class="dots">${'●'.repeat(c.difficulty)}</span>`
        : `${c.id} · ${escapeHtml(c.title)} <span class="dots">${'●'.repeat(c.difficulty)}</span>`;
      b.addEventListener('click', () => onSelect(c));
      el.appendChild(b);
    }
  }
}

/** Load a case into the store (scenario copy, patient, tMin). */
export function selectCase(c: CaseDefinition): void {
  store.update({
    caseId: c.id,
    scenario: structuredClone(c.scenario),
    tMin: c.ecgAtMin ?? 0,
    patient: { sex: c.vignette.sex, age: c.vignette.age },
    playing: false,
  });
}

export function currentCase(): CaseDefinition | null {
  const id = store.get().caseId;
  return id ? (getCase(id) ?? null) : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
