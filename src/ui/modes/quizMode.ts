import { CASES, getCase } from '../../cases/index.js';
import type { CaseDefinition } from '../../cases/types.js';
import type { QuizResult } from '../state/appState.js';
import { store } from '../state/appState.js';
import { selectCase } from './casesMode.js';

const DECISIONS = [
  { id: 'activate', label: 'Activar hemodinamia ahora' },
  { id: 'serial', label: 'ECG seriado + troponina' },
  { id: 'not-ischemic', label: 'No isquemia aguda' },
] as const;

export type QuizDecision = (typeof DECISIONS)[number]['id'];

/** OMI sensitivity/specificity over a quiz session. */
export function quizMetrics(results: readonly QuizResult[]): {
  sensitivity: number;
  specificity: number;
  n: number;
  correct: number;
} {
  const tp = results.filter((r) => r.expectedOmi && r.decidedActivate).length;
  const fn = results.filter((r) => r.expectedOmi && !r.decidedActivate).length;
  const tn = results.filter((r) => !r.expectedOmi && !r.decidedActivate).length;
  const fp = results.filter((r) => !r.expectedOmi && r.decidedActivate).length;
  return {
    sensitivity: tp + fn > 0 ? tp / (tp + fn) : 0,
    specificity: tn + fp > 0 ? tn / (tn + fp) : 0,
    n: results.length,
    correct: results.filter((r) => r.correct).length,
  };
}

/** Trailing consecutive correct answers (for the score line). */
export function currentStreak(results: readonly QuizResult[]): number {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i]!.correct; i--) n++;
  return n;
}

/** Shuffle (seeded) the filtered case ids and start a quiz session. */
export function startQuiz(seed = Math.floor(Math.random() * 1e6)): void {
  const s = store.get();
  const query = (s.caseSearch ?? '').toLowerCase().trim();
  const order = CASES.filter(
    (c) =>
      (s.caseFilter === 'all' || c.category === s.caseFilter) &&
      (!query ||
        c.id.toLowerCase().includes(query) ||
        c.title.toLowerCase().includes(query) ||
        (c.expected.diagnosis ?? '').toLowerCase().includes(query)),
  ).map((c) => c.id);
  let rng = seed;
  for (let i = order.length - 1; i > 0; i--) {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    const j = rng % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  store.update({
    quiz: { order, idx: 0, picked: new Set(), submitted: false, results: [], done: false },
  });
  loadQuizCase();
}

/** Deterministic shuffle of the 4 diagnosis options for a non-ischaemia case. */
export function diagnosisOptions(c: CaseDefinition): string[] {
  const opts = [c.expected.diagnosis!, ...c.expected.distractors!];
  let s = c.scenario.seed;
  for (let i = opts.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [opts[i], opts[j]] = [opts[j]!, opts[i]!];
  }
  return opts;
}

const NON_OCCLUSION = (c: CaseDefinition): boolean => c.category !== 'oclusion';

function loadQuizCase(): void {
  const q = store.get().quiz;
  const id = q.order[q.idx];
  const c = id ? getCase(id) : undefined;
  if (!c) {
    store.update({ quiz: { ...q, done: true } });
    return;
  }
  selectCase(c);
  const qq = store.get().quiz;
  store.update({
    quiz: {
      order: qq.order,
      idx: qq.idx,
      picked: new Set(),
      submitted: false,
      results: qq.results,
      done: qq.done,
    },
    blind: true,
  });
}

/** Right-panel quiz UI: decision buttons, findings multi-select, submit. */
export function renderQuizPanel(
  el: HTMLElement,
  allFindings: readonly { id: string; label: string }[],
  onChanged: () => void,
): void {
  const state = store.get();
  const q = state.quiz;
  el.innerHTML = '';
  if (q.done || q.order.length === 0) {
    renderSummary(el);
    return;
  }
  const c = getCase(q.order[q.idx]!);
  if (!c) return;

  const card = document.createElement('div');
  card.className = 'card';
  const dxMode = NON_OCCLUSION(c);
  card.innerHTML = `<h3 class="section-title">${dxMode ? 'Diagnóstico' : 'Decisión'}</h3>
    <p class="mono" style="color:var(--muted)">Caso ${q.idx + 1} / ${q.order.length} · ${c.vignette.age} años · ${c.vignette.sex}</p>
    <p class="mono" style="font-size:12px">Puntuación ${quizMetrics(q.results).correct}/${q.results.length}
      · racha ${currentStreak(q.results)}
      · sens ${(quizMetrics(q.results).sensitivity * 100).toFixed(0)} % / esp ${(quizMetrics(q.results).specificity * 100).toFixed(0)} %</p>
    <p>${escapeHtml(c.vignette.history)}</p>`;
  if (dxMode) {
    // Diagnosis MCQ: diagnosis + 3 distractors, seed-shuffled.
    for (const opt of diagnosisOptions(c)) {
      const b = document.createElement('button');
      b.className = 'quiz-chip';
      b.setAttribute('aria-pressed', String(q.picked.has(`dx:${opt}`)));
      b.textContent = opt;
      b.style.display = 'block';
      b.style.width = '100%';
      b.style.margin = '6px 0';
      b.disabled = q.submitted;
      b.addEventListener('click', () => {
        store.update({
          quiz: { ...store.get().quiz, decision: 'not-ischemic', picked: new Set([`dx:${opt}`]) },
        });
        onChanged();
      });
      card.appendChild(b);
    }
  } else {
    for (const d of DECISIONS) {
      const b = document.createElement('button');
      b.className = 'quiz-chip';
      b.setAttribute('aria-pressed', String(q.decision === d.id));
      b.textContent = d.label;
      b.style.display = 'block';
      b.style.width = '100%';
      b.style.margin = '6px 0';
      b.disabled = q.submitted;
      b.addEventListener('click', () => {
        store.update({ quiz: { ...store.get().quiz, decision: d.id } });
        onChanged();
      });
      card.appendChild(b);
    }
  }
  el.appendChild(card);

  const fc = document.createElement('div');
  fc.className = 'card';
  fc.innerHTML = '<h3 class="section-title">Hallazgos sospechados</h3>';
  for (const f of allFindings) {
    const b = document.createElement('button');
    b.className = 'quiz-chip';
    b.setAttribute('aria-pressed', String(q.picked.has(f.id)));
    b.textContent = f.label;
    b.disabled = q.submitted;
    b.addEventListener('click', () => {
      const picked = new Set(store.get().quiz.picked);
      if (picked.has(f.id)) picked.delete(f.id);
      else picked.add(f.id);
      store.update({ quiz: { ...store.get().quiz, picked } });
      onChanged();
    });
    fc.appendChild(b);
  }
  el.appendChild(fc);

  if (!q.submitted) {
    const go = document.createElement('button');
    go.className = 'primary';
    go.style.width = '100%';
    go.textContent = 'Confirmar';
    go.disabled = q.decision === undefined || (NON_OCCLUSION(c) && q.picked.size === 0);
    go.addEventListener('click', () => {
      submitQuiz(c);
      onChanged();
    });
    el.appendChild(go);
  } else {
    renderVerdict(el, c);
    const next = document.createElement('button');
    next.className = 'primary';
    next.style.width = '100%';
    next.style.marginTop = '8px';
    next.textContent = 'Siguiente →';
    next.addEventListener('click', () => {
      const qq = store.get().quiz;
      store.update({ quiz: { ...qq, idx: qq.idx + 1 } });
      loadQuizCase();
      onChanged();
    });
    el.appendChild(next);
  }
}

function submitQuiz(c: CaseDefinition): void {
  const q = store.get().quiz;
  const decidedActivate = q.decision === 'activate';
  const pickedDx = [...q.picked].find((p) => p.startsWith('dx:'))?.slice(3);
  const correct = NON_OCCLUSION(c)
    ? pickedDx === c.expected.diagnosis
    : decidedActivate === c.expected.activateCathLab;
  const results = [
    ...q.results,
    { caseId: c.id, correct, expectedOmi: c.expected.omi, decidedActivate },
  ];
  store.update({ quiz: { ...q, submitted: true, results } });
  saveQuizStats(results);
}

function renderVerdict(el: HTMLElement, c: CaseDefinition): void {
  const q = store.get().quiz;
  const last = q.results[q.results.length - 1];
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>Resultado</h3>
    <p><span class="badge ${last?.correct ? 'ok' : 'danger'}">${last?.correct ? 'Correcto' : 'Incorrecto'}</span>
    <span class="badge ${c.expected.omi ? 'danger' : 'ok'}">${c.expected.omi ? 'OMI' : 'No OMI'}</span></p>
    ${c.expected.diagnosis ? `<p class="mono">Diagnóstico: ${escapeHtml(c.expected.diagnosis)}</p>` : ''}
    <p class="mono">Arteria culpable: ${escapeHtml(c.expected.culprit ?? c.angiography)}</p>
    <p class="mono">Hallazgos esperados: ${c.expected.positiveFindings.join(', ') || '—'}</p>
    <p class="mono">Tus hallazgos: ${[...q.picked].join(', ') || '—'}</p>
    <p style="margin-top:8px">Angiografía: ${escapeHtml(c.angiography)}</p>
    <ul style="font-size:12px;color:var(--muted)">${c.teachingPoints.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
  el.appendChild(card);
}

function renderSummary(el: HTMLElement): void {
  const q = store.get().quiz;
  const m = quizMetrics(q.results);
  const perGroup: Record<string, { ok: number; n: number }> = {};
  for (const r of q.results) {
    const g = r.caseId[0]!;
    const e = (perGroup[g] ??= { ok: 0, n: 0 });
    e.n++;
    if (r.correct) e.ok++;
  }
  const best = Number(localStorage.getItem('omilab.quiz.streak') ?? 0);
  el.innerHTML = `
    <div class="card">
      <h3>Resumen de sesión</h3>
      <p class="mono">Aciertos: ${m.correct}/${m.n}</p>
      <p class="mono">Sensibilidad OMI: ${(m.sensitivity * 100).toFixed(0)} % · Especificidad: ${(m.specificity * 100).toFixed(0)} %</p>
      <p class="mono">Mejor racha: ${best}</p>
      <p class="mono">${Object.entries(perGroup)
        .map(([g, v]) => `${g}: ${v.ok}/${v.n}`)
        .join(' · ')}</p>
      <button id="quiz-restart" class="primary" style="width:100%">Reiniciar quiz</button>
    </div>`;
  el.querySelector('#quiz-restart')?.addEventListener('click', () => startQuiz());
}

function saveQuizStats(results: readonly QuizResult[]): void {
  let streak = 0;
  let best = 0;
  for (const r of results) {
    streak = r.correct ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  localStorage.setItem('omilab.quiz.streak', String(best));
  localStorage.setItem('omilab.quiz.results', JSON.stringify(results));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** All distinct finding labels shown in quiz chips. */
export const QUIZ_FINDING_CHOICES = [
  { id: 'stemi-udmi4', label: 'Criterios STEMI' },
  { id: 'hyperacute-t', label: 'T hiperaguda' },
  { id: 'de-winter', label: 'De Winter' },
  { id: 'wellens', label: 'Wellens' },
  { id: 'posterior-std', label: 'Posterior (STD V1–V4)' },
  { id: 'aslanger', label: 'Aslanger' },
  { id: 'avr-diffuse-std', label: 'STD difusa + aVR' },
  { id: 'reciprocal-avl', label: 'Recíproca aVL' },
  { id: 'pathological-q', label: 'Onda Q patológica' },
];
