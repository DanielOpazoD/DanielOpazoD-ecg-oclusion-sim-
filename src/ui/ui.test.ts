import { describe, expect, it } from 'vitest';
import { createStore } from './state/store.js';
import { BIBLIOGRAPHY, bib } from './data/bibliography.js';
import { quizMetrics } from './modes/quizMode.js';
import { phaseLabel } from './panels/timelineBar.js';
import { formatReport } from './export.js';
import { analyzeEcg } from '../analysis/index.js';
import { generateEcg, defaultScenario } from '../engine/index.js';
import { store } from './state/appState.js';
import { getCase } from '../cases/index.js';

describe('initial app state', () => {
  it('opens Casos mode on case A01 with its scenario and tMin', () => {
    const s = store.get();
    const a01 = getCase('A01')!;
    expect(s.mode).toBe('cases');
    expect(s.caseId).toBe('A01');
    expect(s.tMin).toBe(a01.ecgAtMin);
    expect(s.scenario).toEqual(a01.scenario);
    expect(s.patient).toEqual({ sex: a01.vignette.sex, age: a01.vignette.age });
  });
});

describe('store', () => {
  it('get/set/update/subscribe', () => {
    const s = createStore({ a: 1, b: 'x' });
    expect(s.get().a).toBe(1);
    let seen = 0;
    const off = s.subscribe(() => seen++);
    s.update({ a: 2 });
    expect(s.get().a).toBe(2);
    expect(s.get().b).toBe('x');
    expect(seen).toBe(1);
    s.set({ a: 9, b: 'y' });
    expect(seen).toBe(2);
    off();
    s.update({ a: 10 });
    expect(seen).toBe(2);
  });
});

describe('bibliography', () => {
  it('contains all refs 1–106 in order', () => {
    expect(BIBLIOGRAPHY.length).toBe(106);
    for (let n = 1; n <= 106; n++) {
      const e = bib(n);
      expect(e, `ref ${n}`).toBeDefined();
      expect(e!.n).toBe(n);
      expect(e!.text.length).toBeGreaterThan(20);
    }
    expect(bib(107)).toBeDefined();
    expect(bib(129)).toBeUndefined();
  });
});

describe('quizMetrics', () => {
  it('computes sensitivity/specificity', () => {
    const r = [
      { caseId: 'A01', correct: true, expectedOmi: true, decidedActivate: true },
      { caseId: 'D01', correct: true, expectedOmi: false, decidedActivate: false },
      { caseId: 'B01', correct: false, expectedOmi: true, decidedActivate: false },
      { caseId: 'D02', correct: false, expectedOmi: false, decidedActivate: true },
    ];
    const m = quizMetrics(r);
    expect(m.sensitivity).toBeCloseTo(0.5);
    expect(m.specificity).toBeCloseTo(0.5);
    expect(m.n).toBe(4);
    expect(m.correct).toBe(2);
  });
});

describe('phaseLabel', () => {
  const base = {
    sources: [{ st: 0.3, hyperacuteT: 1.5 }],
    timeline: [{ atMin: 0, kind: 'occlusion' as const }],
  };
  it('progresses through phases', () => {
    expect(phaseLabel(base, 10)).toMatch(/hiperaguda|STE/);
    expect(phaseLabel(base, 120)).toBe('STE');
    const rep = {
      ...base,
      timeline: [
        { atMin: 0, kind: 'occlusion' as const },
        { atMin: 60, kind: 'reperfusion' as const },
      ],
    };
    expect(phaseLabel(rep, 90)).toBe('Reperfusión');
  });
});

describe('formatReport', () => {
  it('produces markdown with findings and ST table', () => {
    const ecg = generateEcg(defaultScenario());
    const report = analyzeEcg(ecg);
    const md = formatReport(report, { tMin: 0, caseId: 'X01' });
    expect(md).toContain('# Informe ECG');
    expect(md).toContain('OMI (compuesto): negativo');
    expect(md).toContain('| V3 |');
    expect(md).toContain('X01');
  });
});
