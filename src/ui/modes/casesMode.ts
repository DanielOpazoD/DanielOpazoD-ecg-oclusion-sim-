import { CASES, getCase } from '../../cases/index.js';
import type { CaseCategory, CaseDefinition } from '../../cases/types.js';
import { store } from '../state/appState.js';

const GROUP_NAMES: Record<CaseDefinition['group'], string> = {
  A: 'STEMI evidente',
  B: 'OMI sutil / equivalentes',
  C: 'Subendocárdica / aVR',
  D: 'Imitadores',
  E: 'Seriados (dinámica)',
  F: 'Adquisición y artefactos',
  G: 'Ritmo supraventricular',
  H: 'Ectopia',
  I: 'Bloqueo AV',
  J: 'Conducción intraventricular',
  K: 'Ventriculares y paro',
  L: 'Marcapasos',
  M: 'Electrolitos, fármacos y QT',
  N: 'Estructural y otros',
};

const CATEGORY_LABELS: Record<CaseCategory, string> = {
  oclusion: 'Isquemia/OMI',
  ritmo: 'Ritmo',
  ectopia: 'Ectopia',
  'bloqueo-av': 'Bloqueo AV',
  conduccion: 'Conducción',
  ventricular: 'Ventricular',
  marcapasos: 'Marcapasos',
  electrolitos: 'Electrolitos',
  estructural: 'Estructural',
};

const GROUPS: CaseDefinition['group'][] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
];

/** Left rail: category filter chips + search + grouped case browser. */
export function renderCaseBrowser(el: HTMLElement, onSelect: (c: CaseDefinition) => void): void {
  const state = store.get();
  el.innerHTML = '';

  const head = document.createElement('div');
  head.innerHTML = `
    <input type="search" id="case-search" placeholder="Buscar caso…" aria-label="Buscar caso"
      style="width:100%;margin-bottom:6px">
    <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted);margin-bottom:8px">
      <input type="checkbox" id="blind" ${state.blind ? 'checked' : ''}> Modo ciego
    </label>
    <div class="cat-chips" id="cat-chips"></div>`;
  el.appendChild(head);
  head.querySelector('#blind')!.addEventListener('change', (e) => {
    store.update({ blind: (e.target as HTMLInputElement).checked });
  });

  const filter = state.caseFilter ?? 'all';
  const query = (state.caseSearch ?? '').toLowerCase().trim();
  const chipsEl = head.querySelector('#cat-chips')!;
  const cats = Object.keys(CATEGORY_LABELS) as CaseCategory[];
  const mk = (id: CaseCategory | 'all', label: string) => {
    const b = document.createElement('button');
    b.className = 'cat-chip';
    b.setAttribute('aria-pressed', String(filter === id));
    b.textContent = label;
    b.addEventListener('click', () => {
      store.update({ caseFilter: id });
      renderCaseBrowser(el, onSelect);
    });
    chipsEl.appendChild(b);
  };
  mk('all', 'Todas');
  for (const c of cats) mk(c, CATEGORY_LABELS[c]);
  head.querySelector('#case-search')!.addEventListener('input', (e) => {
    store.update({ caseSearch: (e.target as HTMLInputElement).value });
    renderCaseBrowser(el, onSelect);
    el.querySelector<HTMLInputElement>('#case-search')!.value = (
      e.target as HTMLInputElement
    ).value;
  });

  const matches = (c: CaseDefinition) =>
    (filter === 'all' || c.category === filter) &&
    (!query ||
      c.id.toLowerCase().includes(query) ||
      c.title.toLowerCase().includes(query) ||
      (c.expected.diagnosis ?? '').toLowerCase().includes(query));

  // Blind (quiz or modo ciego): flat numbered list — no groups, titles or dots.
  if (state.mode === 'quiz' || state.blind) {
    CASES.forEach((c, n) => {
      if (!matches(c)) return;
      const b = document.createElement('button');
      b.className = 'case-item';
      b.setAttribute('aria-current', String(state.caseId === c.id));
      b.textContent = `Caso ${n + 1}`;
      b.addEventListener('click', () => onSelect(c));
      el.appendChild(b);
    });
    return;
  }
  for (const g of GROUPS) {
    const cases = CASES.filter((x) => x.group === g && matches(x));
    if (!cases.length) continue;
    const h = document.createElement('div');
    h.className = 'group-h';
    h.textContent = `${g} — ${GROUP_NAMES[g]}`;
    el.appendChild(h);
    for (const c of cases) {
      const b = document.createElement('button');
      b.className = 'case-item';
      b.setAttribute('aria-current', String(state.caseId === c.id));
      b.innerHTML = `${c.id} · ${escapeHtml(c.title)} <span class="dots">${'●'.repeat(c.difficulty)}</span>`;
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
