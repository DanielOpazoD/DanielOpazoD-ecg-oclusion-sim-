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

  // Persistent head: the search input must survive store-driven re-renders or
  // it loses focus after every keystroke. Build it once; afterwards only the
  // list below is rebuilt.
  let head = el.querySelector<HTMLElement>('.case-head');
  if (!head) {
    head = document.createElement('div');
    head.className = 'case-head';
    head.innerHTML = `
      <input type="search" id="case-search" placeholder="Buscar caso…" aria-label="Buscar caso"
        style="width:100%;margin-bottom:6px">
      <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted);margin-bottom:8px">
        <input type="checkbox" id="blind" ${state.blind ? 'checked' : ''}> Modo ciego
      </label>
      <div class="cat-chips" id="cat-chips"></div>`;
    const cats = Object.keys(CATEGORY_LABELS) as CaseCategory[];
    const chipsEl = head.querySelector('#cat-chips')!;
    const mk = (id: CaseCategory | 'all', label: string) => {
      const b = document.createElement('button');
      b.className = 'cat-chip';
      b.dataset['cat'] = id;
      b.textContent = label;
      b.addEventListener('click', () => store.update({ caseFilter: id }));
      chipsEl.appendChild(b);
    };
    mk('all', 'Todas');
    for (const c of cats) mk(c, CATEGORY_LABELS[c]);
    head.querySelector('#blind')!.addEventListener('change', (e) => {
      store.update({ blind: (e.target as HTMLInputElement).checked });
    });
    head.querySelector('#case-search')!.addEventListener('input', (e) => {
      store.update({ caseSearch: (e.target as HTMLInputElement).value });
    });
    el.appendChild(head);
  }

  // Sync head state without rebuilding it (don't steal focus from the input).
  const blind = head.querySelector<HTMLInputElement>('#blind')!;
  if (blind.checked !== state.blind) blind.checked = state.blind;
  const search = head.querySelector<HTMLInputElement>('#case-search')!;
  if (document.activeElement !== search && search.value !== (state.caseSearch ?? ''))
    search.value = state.caseSearch ?? '';
  const filter = state.caseFilter ?? 'all';
  for (const b of head.querySelectorAll<HTMLElement>('.cat-chip'))
    b.setAttribute('aria-pressed', String(b.dataset['cat'] === filter));

  // Rebuild only the list.
  let list = el.querySelector<HTMLElement>('.case-list');
  if (!list) {
    list = document.createElement('div');
    list.className = 'case-list';
    el.appendChild(list);
  }
  list.innerHTML = '';
  const query = (state.caseSearch ?? '').toLowerCase().trim();

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
      if (state.caseId === c.id) b.setAttribute('aria-current', 'true');
      b.textContent = `Caso ${n + 1}`;
      b.addEventListener('click', () => onSelect(c));
      list.appendChild(b);
    });
    return;
  }
  for (const g of GROUPS) {
    const cases = CASES.filter((x) => x.group === g && matches(x));
    if (!cases.length) continue;
    const h = document.createElement('div');
    h.className = 'group-h';
    h.textContent = `${g} — ${GROUP_NAMES[g]}`;
    list.appendChild(h);
    for (const c of cases) {
      const b = document.createElement('button');
      b.className = 'case-item';
      if (state.caseId === c.id) b.setAttribute('aria-current', 'true');
      b.innerHTML = `${c.id} · ${escapeHtml(c.title)} <span class="dots">${'●'.repeat(c.difficulty)}</span>`;
      b.addEventListener('click', () => onSelect(c));
      list.appendChild(b);
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
