import { describe, expect, it } from 'vitest';
import { bib } from '../ui/data/bibliography.js';
import { CASES, getCase } from './index.js';
import { generateEcg } from '../engine/index.js';
import { analyzeEcg } from '../analysis/index.js';

/** §9 item 12: every case library entry. */

function reportFor(id: string) {
  const c = getCase(id)!;
  const ecg = generateEcg(c.scenario, c.ecgAtMin);
  return analyzeEcg(ecg, {
    sex: c.vignette.sex,
    age: c.vignette.age,
    conduction: c.scenario.conduction,
    ...(c.leadsAvailable ? { leadsAvailable: c.leadsAvailable } : {}),
  });
}

describe('case library metadata', () => {
  it('has all 103 cases with unique ids', () => {
    expect(CASES.length).toBe(103);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(103);
  });
  it('every case carries a category and every G–N case has diagnosis + 3 distractors', () => {
    for (const c of CASES) {
      expect(c.category, c.id).toBeDefined();
    }
    for (const c of CASES.filter((c) => c.group >= 'G')) {
      expect(c.expected.diagnosis, c.id).toBeTruthy();
      expect(c.expected.distractors?.length, c.id).toBe(3);
      expect(new Set([c.expected.diagnosis, ...(c.expected.distractors ?? [])]).size, c.id).toBe(4);
    }
  });
  it('every case has ≥4 teachingPoints, ≥2 pitfalls and non-empty refs', () => {
    for (const c of CASES) {
      expect(c.teachingPoints.length, c.id).toBeGreaterThanOrEqual(4);
      expect(c.pitfalls?.length ?? 0, c.id).toBeGreaterThanOrEqual(2);
      expect(c.refs.length, c.id).toBeGreaterThanOrEqual(1);
    }
  });
  it('vignette histories do not describe the ECG (quiz/blind leak guard)', () => {
    const ecgLeak = /\b(STE|STD|ST\b|onda[s]? T|T hiperagud|Q patol|V[1-9]|aVL|aVR|aVF|derivaci)/i;
    for (const c of CASES) {
      expect(ecgLeak.test(c.vignette.history), c.id).toBe(false);
    }
  });
  it('every cited ref resolves in the bibliography', () => {
    for (const c of CASES) {
      for (const n of c.refs) {
        expect(bib(n), `${c.id} ref ${n}`).toBeDefined();
      }
    }
  });
});

describe('case findings — §9.12', () => {
  for (const c of CASES) {
    it(`${c.id} ${c.title}`, () => {
      const rep = reportFor(c.id);
      for (const id of c.expected.positiveFindings) {
        const f = id === 'omi-composite' ? rep.omi : rep.findings.find((x) => x.id === id);
        expect(
          f?.positive,
          `${c.id}: ${id} should be positive — ${f?.rationale ?? 'missing'}`,
        ).toBe(true);
      }
      for (const id of c.expected.negativeFindings) {
        const f = id === 'omi-composite' ? rep.omi : rep.findings.find((x) => x.id === id);
        expect(f?.positive ?? false, `${c.id}: ${id} should be negative`).toBe(false);
      }
      if (!c.expected.rulesMiss) {
        expect(
          rep.omi.positive,
          `${c.id}: omi ${rep.omi.positive} vs expected ${c.expected.omi}`,
        ).toBe(c.expected.omi);
      }
    });
  }
});
