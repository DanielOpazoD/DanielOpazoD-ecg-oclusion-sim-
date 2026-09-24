import { describe, expect, it } from 'vitest';
import { TERRITORIES } from './territories.js';
import { defaultScenario, generateEcg, type Scenario } from './scenario.js';
import { measureEcg, mm } from '../analysis/index.js';
import type { Ecg12, LeadId } from './index.js';

const measureBeat = (ecg: Ecg12, l: LeadId) => measureEcg(ecg).perLead[l];

/**
 * §9.3–9.4: each territory with st = 2 mV in refLead, shape straight.
 */
function ecgFor(territory: string, refLead: LeadId, st = 2) {
  const scenario: Scenario = {
    ...defaultScenario(),
    seed: 11,
    durationS: 4,
    sources: [{ territory, st, refLead, shape: 'straight', qLoss: 0 }],
  };
  return generateEcg(scenario);
}

const REF: Record<string, LeadId> = {
  anteroseptal: 'V3',
  anterior: 'V3',
  anteroapical: 'V4',
  'high-lateral': 'aVL',
  lateral: 'V5',
  'inferior-rca': 'III',
  'inferior-lcx': 'II',
  posterior: 'V8',
  rv: 'V4R',
  subendocardial: 'aVR',
};

describe('territories — §9.3 STE in looking leads', () => {
  for (const t of TERRITORIES.filter((x) => x.profile === 'transmural')) {
    it(`${t.id}: STE > 1 mm in looking leads`, () => {
      const ecg = ecgFor(t.id, REF[t.id]!);
      for (const lead of t.looksAt) {
        const stJ = mm(measureBeat(ecg, lead).stJ);
        expect(stJ, `${t.id} ${lead}`).toBeGreaterThan(1);
      }
    });
  }
});

describe('territories — §9.3–9.4 reciprocal & discriminating patterns', () => {
  it('inferior-rca: ST(III) > ST(II), ST(V1) ≥ 0, STD aVL < −0.5 mm', () => {
    const ecg = ecgFor('inferior-rca', 'III');
    const stII = mm(measureBeat(ecg, 'II').stJ);
    const stIII = mm(measureBeat(ecg, 'III').stJ);
    const stV1 = mm(measureBeat(ecg, 'V1').stJ);
    const stAVL = mm(measureBeat(ecg, 'aVL').stJ);
    expect(stIII).toBeGreaterThan(stII);
    expect(stV1).toBeGreaterThanOrEqual(0);
    expect(stAVL).toBeLessThan(-0.5);
  });

  it('inferior-lcx: ST(II) ≥ ST(III), ST(aVL) ≥ −0.5 mm', () => {
    const ecg = ecgFor('inferior-lcx', 'II');
    const stII = mm(measureBeat(ecg, 'II').stJ);
    const stIII = mm(measureBeat(ecg, 'III').stJ);
    const stAVL = mm(measureBeat(ecg, 'aVL').stJ);
    expect(stII).toBeGreaterThanOrEqual(stIII);
    expect(stAVL).toBeGreaterThanOrEqual(-0.5);
  });

  it('anteroseptal: reciprocal STD in II/III/aVF', () => {
    const ecg = ecgFor('anteroseptal', 'V3');
    for (const l of ['II', 'III', 'aVF'] as const) {
      expect(mm(measureBeat(ecg, l).stJ), l).toBeLessThan(0);
    }
  });

  it('posterior: STD V1–V3 with STE V7–V9', () => {
    const ecg = ecgFor('posterior', 'V8');
    for (const l of ['V1', 'V2', 'V3'] as const) {
      expect(mm(measureBeat(ecg, l).stJ), l).toBeLessThan(-0.5);
    }
    for (const l of ['V7', 'V8', 'V9'] as const) {
      // Posterior leads scaled ×0.6: UDMI4 criterion is ≥ 0.5 mm.
      expect(mm(measureBeat(ecg, l).stJ), l).toBeGreaterThan(0.5);
    }
  });

  it('posterior: T stays upright in V1–V3 (negative tGain mirror)', () => {
    const ecg = ecgFor('posterior', 'V8');
    expect(measureBeat(ecg, 'V2').tTerminal).toBeGreaterThan(0);
  });
});

describe('fidelity — hyperacute T and de-winter sizes', () => {
  it('de-winter config: T(V3) between 6 and 15 mm', () => {
    const ecg = generateEcg({
      ...defaultScenario(),
      seed: 21,
      durationS: 4,
      sources: [
        {
          territory: 'anterior',
          st: -0.15,
          refLead: 'V3',
          shape: 'depression-upsloping',
          hyperacuteT: 1.6,
        },
      ],
    });
    const t3 = mm(measureBeat(ecg, 'V3').tAmp);
    expect(t3).toBeGreaterThanOrEqual(6);
    expect(t3).toBeLessThanOrEqual(15);
  });
});

describe('timeline — §6 static sanity', () => {
  it('st=0 produces ~isoelectric ST', () => {
    const ecg = generateEcg({
      ...defaultScenario(),
      seed: 3,
      durationS: 3,
      sources: [{ territory: 'anterior', st: 0, refLead: 'V3', shape: 'straight' }],
    });
    expect(Math.abs(measureBeat(ecg, 'V3').stJ)).toBeLessThan(0.02);
  });
});
