import { describe, expect, it } from 'vitest';
import { highPass, lowPass, addNoise } from './acquisition.js';
import { createRng } from './math/random.js';
import { generateEcg, defaultScenario } from './scenario.js';

describe('acquisition — §7', () => {
  it('zero-phase high-pass removes a DC offset symmetrically', () => {
    const sig = new Float32Array(2000).fill(0.5);
    const y = highPass(sig, 500, 0.5, 'zero-phase');
    expect(Math.abs(y[1000]!)).toBeLessThan(0.1);
  });
  it('causal high-pass leaves a decaying tail', () => {
    const sig = new Float32Array(2000).fill(0.5);
    const y = highPass(sig, 500, 0.5, 'causal');
    expect(Math.abs(y[1900]!)).toBeLessThan(Math.abs(y[100]!));
  });
  it('low-pass attenuates a high-frequency sine', () => {
    const sig = new Float32Array(2000);
    for (let i = 0; i < sig.length; i++) sig[i] = Math.sin((2 * Math.PI * 100 * i) / 500);
    const y = lowPass(sig, 500, 40);
    let max = 0;
    for (let i = 500; i < 2000; i++) max = Math.max(max, Math.abs(y[i]!));
    expect(max).toBeLessThan(0.4);
  });
  it('addNoise adds baseline wander, EMG, powerline and motion', () => {
    const sig = new Float32Array(5000);
    addNoise(
      sig,
      {
        baselineWander: { amplitudeMv: 0.2, hz: 0.25 },
        emg: { sigmaMv: 0.03 },
        powerline: { hz: 50, amplitudeMv: 0.05 },
        motion: { perMin: 30, amplitudeMv: 0.5 },
      },
      500,
      createRng(9),
    );
    let max = 0;
    for (const v of sig) max = Math.max(max, Math.abs(v));
    expect(max).toBeGreaterThan(0.1);
  });
  it('empty and edge-length signals survive filters', () => {
    expect(highPass(new Float32Array(0), 500, 0.5, 'causal').length).toBe(0);
    expect(lowPass(new Float32Array(1).fill(1), 500, 40)[0]).toBe(1);
  });
  it('v1v2-high and precordial-lateral-shift placements generate', () => {
    for (const placement of ['v1v2-high', 'precordial-lateral-shift'] as const) {
      const ecg = generateEcg({
        ...defaultScenario(),
        durationS: 2,
        acquisition: { placement },
      });
      expect(ecg.clean.V1.length).toBe(1000);
    }
  });
});
