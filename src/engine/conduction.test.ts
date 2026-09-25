import { describe, expect, it } from 'vitest';
import { generateEcg, type Scenario } from './scenario.js';
import { measureEcg } from '../analysis/index.js';
import type { ConductionSpec } from './beat.js';
import type { LeadId } from './leads.js';

function ecgOf(conduction: ConductionSpec, extra: Partial<Scenario> = {}) {
  return generateEcg({
    seed: 11,
    durationS: 6,
    rhythm: { type: 'sinus', hrBpm: 70 },
    conduction,
    sources: [],
    variability: false,
    ...extra,
  });
}

const mm = (m: ReturnType<typeof measureEcg>, l: LeadId, k: 'stJ' | 'rAmp' | 'sAmp' | 'tAmp') =>
  m.perLead[l][k] * 10;

describe('conduction — fascicular and intraventricular', () => {
  it('lafb: frontal axis in [−90, −30]°, narrow QRS', () => {
    const m = measureEcg(ecgOf('lafb'));
    expect(m.qrsAxisDeg).toBeGreaterThanOrEqual(-90);
    expect(m.qrsAxisDeg).toBeLessThanOrEqual(-30);
    expect(m.perLead.II.qrsDurMs).toBeLessThan(120);
  });
  it('lpfb: frontal axis in [90, 180]°', () => {
    const m = measureEcg(ecgOf('lpfb'));
    expect(m.qrsAxisDeg).toBeGreaterThanOrEqual(90);
    expect(m.qrsAxisDeg).toBeLessThanOrEqual(180);
  });
  it('rbbb: QRS ≥ 120 ms, terminal R′ in V1, wide S in I/V6', () => {
    const m = measureEcg(ecgOf('rbbb'));
    expect(m.perLead.V1.qrsDurMs).toBeGreaterThanOrEqual(120);
    // rSR′: positive terminal deflection in V1.
    const rep = repWave(ecgOf('rbbb'), 'V1');
    const jIdx = rep.j;
    const tail = rep.wave.slice(jIdx - 15, jIdx + 1);
    expect(Math.max(...tail)).toBeGreaterThan(0.05);
    // Wide terminal S in V6.
    expect(mm(m, 'V6', 'sAmp')).toBeGreaterThan(1.5);
  });
  it('irbbb: QRS < 120 ms', () => {
    const m = measureEcg(ecgOf('irbbb'));
    expect(m.perLead.V1.qrsDurMs).toBeLessThan(120);
    expect(m.perLead.V1.qrsDurMs).toBeGreaterThanOrEqual(100);
  });
  it('lbbb: V1 predominantly negative, V6 positive, QRS ≥ 120', () => {
    const m = measureEcg(ecgOf('lbbb'));
    expect(m.perLead.V6.qrsDurMs).toBeGreaterThanOrEqual(120);
    expect(mm(m, 'V1', 'sAmp')).toBeGreaterThan(mm(m, 'V1', 'rAmp'));
    expect(mm(m, 'V6', 'rAmp')).toBeGreaterThan(2);
  });
  it('rvh: R(V1) > S(V1), axis > 90°', () => {
    const m = measureEcg(ecgOf('rvh'));
    expect(mm(m, 'V1', 'rAmp')).toBeGreaterThan(mm(m, 'V1', 'sAmp'));
    expect(m.qrsAxisDeg).toBeGreaterThan(90);
  });
  it('axisDeg override rotates the normal template', () => {
    const m = measureEcg(ecgOf('normal', { axisDeg: -40 }));
    expect(m.qrsAxisDeg).toBeGreaterThanOrEqual(-70);
    expect(m.qrsAxisDeg).toBeLessThanOrEqual(-15);
  });
  it('dextrocardia: inverted I, positive aVR, reverse precordial progression', () => {
    const ecg = generateEcg({
      seed: 11,
      durationS: 5,
      rhythm: { type: 'sinus', hrBpm: 70 },
      conduction: 'normal',
      sources: [],
      variability: false,
      acquisition: { placement: 'dextrocardia' },
    });
    const m = measureEcg(ecg);
    // I predominantly negative; aVR positive QRS (the model's P in aVR is
    // near-isoelectric — a pure sagittal mirror keeps the atrial vector's
    // inferior component).
    expect(mm(m, 'I', 'rAmp')).toBeLessThan(mm(m, 'I', 'sAmp'));
    expect(mm(m, 'aVR', 'rAmp')).toBeGreaterThan(mm(m, 'aVR', 'sAmp'));
    // Reverse progression: R(V1) > R(V6).
    expect(mm(m, 'V1', 'rAmp')).toBeGreaterThan(mm(m, 'V6', 'rAmp'));
    // P negative in lead I.
    const b = ecg.beats.find((x) => x.pOnset >= 0)!;
    let sawNegP = false;
    for (let i = b.pOnset; i < b.qrsOnset - 10; i++) {
      if (ecg.clean.I[i]! < -0.03) {
        sawNegP = true;
        break;
      }
    }
    expect(sawNegP).toBe(true);
  });
});

describe('electrical identities across rhythms', () => {
  it.each([
    { type: 'sinus', hrBpm: 70 },
    { type: 'afib', hrBpm: 100 },
    { type: 'flutter', ratio: 2 },
    { type: 'svt', hrBpm: 180 },
    { type: 'av-block-2-mobitz1', hrBpm: 75, ratio: '4:3' },
    { type: 'av-block-3', atrialBpm: 80, escapeBpm: 40, escapeOrigin: 'ventricular' },
    { type: 'aivr', hrBpm: 90 },
    { type: 'vt', hrBpm: 150 },
    { type: 'torsades', hrBpm: 180 },
    { type: 'vf' },
    { type: 'paced', mode: 'VVI', rateBpm: 70 },
  ] as const)('Einthoven/Goldberger hold for %o', (rhythm) => {
    const ecg = generateEcg({
      seed: 21,
      durationS: 4,
      rhythm: rhythm as never,
      conduction: 'normal',
      sources: [],
      variability: false,
    });
    const n = Math.min(500, ecg.clean.I.length);
    for (let i = 0; i < n; i += 7) {
      expect(ecg.clean.II[i]! - ecg.clean.I[i]! - ecg.clean.III[i]!).toBeCloseTo(0, 4);
      expect(ecg.clean.aVR[i]! + 0.5 * (ecg.clean.I[i]! + ecg.clean.II[i]!)).toBeCloseTo(0, 4);
      expect(ecg.clean.aVF[i]! - (ecg.clean.II[i]! - 0.5 * ecg.clean.I[i]!)).toBeCloseTo(0, 4);
      expect(ecg.clean.aVL[i]! - (ecg.clean.I[i]! - 0.5 * ecg.clean.II[i]!)).toBeCloseTo(0, 4);
    }
  });
});

/** Median-aligned representative beat of the dominant kind in one lead. */
function repWave(ecg: ReturnType<typeof generateEcg>, lead: LeadId) {
  const sig = ecg.clean[lead];
  const pre = Math.round(0.22 * ecg.fs);
  const post = Math.round(0.7 * ecg.fs);
  const beats = ecg.beats.filter((b) => b.qrsOnset - pre >= 0 && b.qrsOnset + post < sig.length);
  const wave = new Float32Array(pre + post);
  for (let i = 0; i < wave.length; i++) {
    const vals = beats.map((b) => sig[b.qrsOnset - pre + i]!).sort((x, y) => x - y);
    wave[i] = vals[Math.floor(vals.length / 2)]!;
  }
  const j = pre + Math.round(0.125 * ecg.fs);
  return { wave, qrsOnset: pre, j };
}
