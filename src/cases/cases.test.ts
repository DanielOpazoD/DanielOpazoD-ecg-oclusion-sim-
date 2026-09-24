import { describe, expect, it } from 'vitest';
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
  it('has all 50 cases with unique ids', () => {
    expect(CASES.length).toBe(50);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(50);
  });
  it('every case has ≥3 teachingPoints and non-empty refs', () => {
    for (const c of CASES) {
      expect(c.teachingPoints.length, c.id).toBeGreaterThanOrEqual(3);
      expect(c.refs.length, c.id).toBeGreaterThanOrEqual(1);
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
