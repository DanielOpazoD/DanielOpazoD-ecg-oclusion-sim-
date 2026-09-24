import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { generateEcg } from '../engine/index.js';
import type { Scenario } from '../engine/index.js';
import { delineate } from './delineate/delineate.js';
import { analyzeEcg } from './index.js';

const sinus: Scenario = {
  seed: 7,
  durationS: 10,
  rhythm: { type: 'sinus', hrBpm: 72 },
  conduction: 'normal',
  sources: [],
  variability: false,
};

describe('delineate', () => {
  const ecg = generateEcg(sinus);
  const truth = ecg.beats.filter((b) => b.kind === 'sinus');
  const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

  it('recovers HR/PR/QRS/QT/axis on the clean signal', () => {
    const d = delineate({ fs: ecg.fs, leads: ecg.clean });
    expect(d.hrBpm).toBeGreaterThan(70);
    expect(d.hrBpm).toBeLessThan(74);
    const pr = median(
      truth.filter((b) => b.pOnset >= 0).map((b) => ((b.qrsOnset - b.pOnset) / ecg.fs) * 1000),
    );
    const qrs = median(truth.map((b) => ((b.j - b.qrsOnset) / ecg.fs) * 1000));
    const qt = median(truth.map((b) => ((b.tEnd - b.qrsOnset) / ecg.fs) * 1000));
    expect(Math.abs(d.prMs! - pr)).toBeLessThan(20);
    expect(Math.abs(d.qrsMs! - qrs)).toBeLessThan(15);
    expect(Math.abs(d.qtMs! - qt)).toBeLessThan(35);
    expect(Math.abs(d.axisDeg.qrs! - 60)).toBeLessThan(20);
    expect(d.evidence.hr.status).toBe('usable');
    expect(d.evidence.qrs.status).toBe('usable');
    expect(Number.isFinite(d.noiseMv)).toBe(true);
  });

  it('recovers the same metrics on the acquired (noisy) signal', () => {
    const dirty = generateEcg({
      ...sinus,
      acquisition: {
        baselineWander: { amplitudeMv: 0.1, hz: 0.3 },
        emg: { sigmaMv: 0.03 },
        powerline: { hz: 50, amplitudeMv: 0.02 },
      },
    });
    const d = delineate({ fs: dirty.fs, leads: dirty.leads });
    expect(Math.abs(d.hrBpm! - 72)).toBeLessThan(3);
    const qrs = median(dirty.beats.map((b) => ((b.j - b.qrsOnset) / dirty.fs) * 1000));
    expect(Math.abs(d.qrsMs! - qrs)).toBeLessThan(25);
  });

  it('AF is irregular with no atrial rate', () => {
    const e = generateEcg({ ...sinus, rhythm: { type: 'afib', hrBpm: 95 } });
    const d = delineate({ fs: e.fs, leads: e.clean });
    expect(d.rhythmRegularity).toBe('irregular');
    expect(d.atrialRateBpm).toBeNull();
    expect(analyzeEcg(e).findings.find((f) => f.id === 'rr-irregular')?.positive).toBe(true);
  });

  it('complete AV block exposes the atrial rate and AV dissociation', () => {
    const e = generateEcg({
      ...sinus,
      durationS: 12,
      rhythm: { type: 'av-block-3', atrialBpm: 80, escapeBpm: 38, escapeOrigin: 'junctional' },
    });
    const d = delineate({ fs: e.fs, leads: e.clean });
    expect(d.atrialRateBpm).toBeGreaterThan(72);
    expect(d.atrialRateBpm).toBeLessThan(88);
    const r = analyzeEcg(e).findings.find((f) => f.id === 'av-dissociation');
    expect(r?.positive).toBe(true);
  });

  it('VVI 60 leaves ~10 pacing spikes in 10 s', () => {
    const e = generateEcg({ ...sinus, rhythm: { type: 'paced', mode: 'VVI', rateBpm: 60 } });
    const d = delineate({ fs: e.fs, leads: e.clean });
    expect(d.pacingSpikes.length).toBeGreaterThanOrEqual(8);
    expect(d.pacingSpikes.length).toBeLessThanOrEqual(12);
    expect(analyzeEcg(e).findings.find((f) => f.id === 'pacing')?.positive).toBe(true);
  });

  it('torsades and VF do not throw and degrade gracefully', () => {
    for (const rhythm of [{ type: 'torsades', hrBpm: 200 } as const, { type: 'vf' } as const]) {
      const e = generateEcg({ ...sinus, rhythm });
      const d = delineate({ fs: e.fs, leads: e.clean });
      expect(Number.isNaN(d.hrBpm)).not.toBe(true);
    }
  });

  it('asystole reports no rhythm', () => {
    const e = generateEcg({ ...sinus, rhythm: { type: 'asystole' } });
    const d = delineate({ fs: e.fs, leads: e.clean });
    expect(d.rhythmRegularity).toBe('none');
  });

  it('never throws and never returns NaN over arbitrary scenarios', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.constantFrom('sinus', 'afib', 'vt', 'vf'),
        fc.integer({ min: 50, max: 90 }),
        (seed, type, hr) => {
          const rhythm =
            type === 'sinus'
              ? ({ type: 'sinus', hrBpm: hr } as const)
              : type === 'afib'
                ? ({ type: 'afib', hrBpm: hr } as const)
                : type === 'vt'
                  ? ({ type: 'vt', hrBpm: hr } as const)
                  : ({ type: 'vf' } as const);
          const e = generateEcg({ ...sinus, seed, rhythm, durationS: 8 });
          const d = delineate({ fs: e.fs, leads: e.clean });
          const nums = [
            d.hrBpm,
            d.prMs,
            d.qrsMs,
            d.qtMs,
            d.atrialRateBpm,
            d.noiseMv,
            d.qtc.bazett,
            d.axisDeg.qrs,
          ];
          for (const x of nums) expect(x === null || Number.isFinite(x)).toBe(true);
        },
      ),
      { numRuns: 24 },
    );
  });
});
