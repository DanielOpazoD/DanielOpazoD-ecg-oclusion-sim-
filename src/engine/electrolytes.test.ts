import { describe, expect, it } from 'vitest';
import { generateEcg, type Scenario } from './scenario.js';
import { measureEcg } from '../analysis/index.js';
import {
  digoxinOverrides,
  hypocalcemiaOverrides,
  hypokalemiaOverrides,
  severeHyperkalemiaOverrides,
} from './beat.js';
import type { BeatOverrides } from './beat.js';

function ecgOf(overrides: BeatOverrides | undefined) {
  return generateEcg({
    seed: 13,
    durationS: 6,
    rhythm: { type: 'sinus', hrBpm: 70 },
    conduction: 'normal',
    sources: [],
    variability: false,
    ...(overrides ? { beatOverrides: overrides } : {}),
  } satisfies Scenario);
}

describe('electrolytes & drugs', () => {
  it('hypokalaemia: positive U wave in V2/V3 after the T', () => {
    const ecg = ecgOf(hypokalemiaOverrides());
    const b = ecg.beats[2]!;
    const v2 = ecg.clean.V2;
    // U wave peaks ~180 ms after T peak — sample a window past tEnd.
    let uMax = -Infinity;
    for (let i = b.tEnd - 5; i < b.tEnd + 90; i++) uMax = Math.max(uMax, v2[i]!);
    expect(uMax).toBeGreaterThan(0.05);
  });
  it('severe hyperkalaemia: tall T in V3 (> 0.8 mV) and QRS > 120 ms', () => {
    const ecg = ecgOf(severeHyperkalemiaOverrides());
    const m = measureEcg(ecg);
    expect(m.perLead.V3.tAmp).toBeGreaterThan(0.8);
    expect(m.perLead.V3.qrsDurMs).toBeGreaterThan(120);
  });
  it('hypocalcaemia: QT +60 ms or more, T width preserved (±10%)', () => {
    const hypo = measureEcg(ecgOf(hypocalcemiaOverrides()));
    const base = measureEcg(ecgOf(undefined));
    expect(hypo.qt - base.qt).toBeGreaterThan(60);
    const w = (m: typeof hypo) => m.perLead.V5.tWidth50Ms;
    expect(Math.abs(w(hypo) - w(base)) / w(base)).toBeLessThan(0.1);
  });
  it('digoxin: scooped ST below baseline at J+60 in V5/V6', () => {
    const m = measureEcg(ecgOf(digoxinOverrides()));
    expect(m.perLead.V5.st60).toBeLessThan(-0.03);
    expect(m.perLead.V6.st60).toBeLessThan(-0.03);
  });
});
