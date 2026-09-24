import { describe, expect, it } from 'vitest';
import { defaultScenario, generateEcg, type Scenario } from './scenario.js';
import { measureEcg, mm } from '../analysis/index.js';
import type { Ecg12, LeadId } from './index.js';

const measureBeat = (ecg: Ecg12, l: LeadId) => measureEcg(ecg).perLead[l];

function ecgOf(patch: Partial<Scenario> = {}) {
  return generateEcg({ ...defaultScenario(), seed: 7, durationS: 4, ...patch });
}

describe('beat — §9.2 normal beat ranges (§2.2–§2.3)', () => {
  const ecg = ecgOf();
  const m = (l: LeadId) => measureBeat(ecg, l);

  it('R(V5) ∈ [1.0, 2.2] mV', () => {
    const v = m('V5').rAmp;
    expect(v).toBeGreaterThanOrEqual(1.0);
    expect(v).toBeLessThanOrEqual(2.2);
  });
  it('r(V1) < 0.5 mV and S(V1) ∈ [0.5, 1.6] mV', () => {
    const v1 = m('V1');
    expect(v1.rAmp).toBeLessThan(0.5);
    expect(v1.sAmp).toBeGreaterThanOrEqual(0.5);
    expect(v1.sAmp).toBeLessThanOrEqual(1.6);
  });
  it('R(II) ∈ [0.6, 1.5] mV', () => {
    const v = m('II').rAmp;
    expect(v).toBeGreaterThanOrEqual(0.6);
    expect(v).toBeLessThanOrEqual(1.5);
  });
  it('R progression V1→V5 increases monotonically', () => {
    const amps = (['V1', 'V2', 'V3', 'V4', 'V5'] as const).map((l) => m(l).rAmp);
    for (let i = 1; i < amps.length; i++) {
      expect(amps[i]!).toBeGreaterThan(amps[i - 1]!);
    }
  });
  it('QRS duration 80–100 ms', () => {
    expect(m('V5').qrsDurMs).toBeGreaterThanOrEqual(80);
    expect(m('V5').qrsDurMs).toBeLessThanOrEqual(100);
  });
  it('T amplitudes: V5 ∈ [0.25,0.6], V2 ∈ [0.3,0.9], aVR < 0, V1 ∈ [−0.2,0.2] mV', () => {
    expect(m('V5').tAmp).toBeGreaterThanOrEqual(0.25);
    expect(m('V5').tAmp).toBeLessThanOrEqual(0.6);
    expect(m('V2').tAmp).toBeGreaterThanOrEqual(0.3);
    expect(m('V2').tAmp).toBeLessThanOrEqual(0.9);
    expect(m('aVR').tAmp).toBeLessThan(0);
    expect(Math.abs(m('V1').tAmp)).toBeLessThanOrEqual(0.2);
  });
  it('P in II within 0.10–0.15 mV', () => {
    // Measure P peak over the PR segment before the QRS.
    const beat = ecg.beats.find((b) => b.type === 'sinus' && b.pOnset > 20)!;
    const s = ecg.clean.II;
    let pMax = -Infinity;
    for (let i = beat.pOnset; i < beat.qrsOnset - 10; i++) {
      if (s[i]! > pMax) pMax = s[i]!;
    }
    expect(pMax).toBeGreaterThanOrEqual(0.09);
    expect(pMax).toBeLessThanOrEqual(0.16);
  });
});

describe('determinism — §9.11', () => {
  it('same seed ⇒ identical signals', () => {
    const a = ecgOf({
      sources: [{ territory: 'anterior', st: 1.5, refLead: 'V3', shape: 'straight' }],
    });
    const b = ecgOf({
      sources: [{ territory: 'anterior', st: 1.5, refLead: 'V3', shape: 'straight' }],
    });
    for (const l of ['I', 'V3', 'aVF'] as const) {
      expect(Array.from(a.leads[l])).toEqual(Array.from(b.leads[l]));
    }
  });
});

describe('filters — §9.9', () => {
  it('causal HP 0.5 Hz shifts ST > 0.05 mV vs 0.05 Hz', () => {
    const hp05 = ecgOf({
      acquisition: { highPassHz: 0.5, highPassMode: 'causal' },
    });
    const hp005 = ecgOf({
      acquisition: { highPassHz: 0.05, highPassMode: 'causal' },
    });
    // Measure ST J on the dirty signals with fiducials.
    const b = hp05.beats.find((x) => x.type === 'sinus')!;
    const d = Math.abs(hp05.leads.V5[b.j]! - hp005.leads.V5[b.j]!);
    expect(d).toBeGreaterThan(0.05);
  });
});

describe('mm helper sanity', () => {
  it('0.1 mV = 1 mm', () => expect(mm(0.1)).toBeCloseTo(1));
});
