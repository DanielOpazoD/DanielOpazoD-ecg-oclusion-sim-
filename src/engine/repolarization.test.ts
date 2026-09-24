import { describe, expect, it } from 'vitest';
import { adaptRR, qtFromAdaptedRR, QT_ADAPTATION_MS } from './repolarization.js';
import { generateEcg, type Scenario } from './scenario.js';

describe('repolarization — QT memory', () => {
  it('adapted RR moves 63% toward a step at τ = 40 s', () => {
    const adapted = adaptRR(1000, 500, QT_ADAPTATION_MS);
    expect(adapted).toBeCloseTo(1000 - 0.6321 * 500, 0);
  });
  it('steady state: QT = QTc · ∛(RR)', () => {
    // At steady state adaptedRr = rr ⇒ qt = qtc·cbrt(rr).
    expect(qtFromAdaptedRR(400, 1, 1000)).toBeCloseTo(400, 5);
    expect(qtFromAdaptedRR(400, 1, 857)).toBeCloseTo(400 * Math.cbrt(0.857), 4);
  });
  it('QT shortens progressively, not instantaneously, after an RR step', () => {
    // A single short RR produces a QT between the two steady-state values.
    const qtc = 400;
    const first = qtFromAdaptedRR(qtc, 1, adaptRR(1000, 500, 500));
    const steadyOld = qtFromAdaptedRR(qtc, 1, 1000);
    const steadyNew = qtFromAdaptedRR(qtc, 1, 500);
    expect(first).toBeLessThan(steadyOld);
    expect(first).toBeGreaterThan(steadyNew);
  });
  it('fiducial QT follows Fridericia at steady state', () => {
    const sc: Scenario = {
      seed: 9,
      durationS: 8,
      rhythm: { type: 'sinus', hrBpm: 70 },
      conduction: 'normal',
      sources: [],
      variability: false,
    };
    const ecg = generateEcg(sc);
    const last = ecg.beats.at(-1)!;
    const qt = ((last.tEnd - last.qrsOnset) / ecg.fs) * 1000;
    const rr = last.qrsOnset - ecg.beats.at(-2)!.qrsOnset;
    const expected = 400 * Math.cbrt(rr / (ecg.fs / 1000) / 1000);
    expect(Math.abs(qt - expected)).toBeLessThan(15);
  });
});
