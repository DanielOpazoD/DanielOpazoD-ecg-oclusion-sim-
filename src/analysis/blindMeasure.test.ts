import { describe, expect, it } from 'vitest';
import { auditMeasurements } from './audit.js';
import { measureFromDelineation } from './blindMeasure.js';
import { delineate } from './delineate/delineate.js';
import { measureEcg } from './measure.js';
import { generateEcg, LEAD_IDS } from '../engine/index.js';
import { getCase } from '../cases/index.js';

/** Blind (delineation-only) measurement vs the fiducial reference for a case. */
function blindVsRef(id: string) {
  const c = getCase(id)!;
  const ecg = generateEcg(c.scenario, c.ecgAtMin ?? 0);
  const d = delineate({ fs: ecg.fs, leads: ecg.clean });
  return {
    blind: measureFromDelineation(d, ecg.clean, ecg.fs),
    ref: measureEcg(ecg, 'clean'),
  };
}

describe('measureFromDelineation', () => {
  it('reads ST(J) within 0.05 mV of the fiducial reference on ≥10/12 leads', () => {
    for (const id of ['A01', 'B01', 'C01', 'G01', 'J01', 'H01']) {
      const { blind, ref } = blindVsRef(id);
      const close = LEAD_IDS.filter(
        (l) => Math.abs(blind.perLead[l].stJ - ref.perLead[l].stJ) <= 0.05,
      );
      expect(close.length, `${id}: discordant leads`).toBeGreaterThanOrEqual(10);
      expect(blind.qrsWide, `${id}: qrsWide`).toBe(ref.qrsWide);
    }
  });

  it('excludes PVCs so the dominant-beat QRS width matches the reference', () => {
    const { blind, ref } = blindVsRef('H01');
    expect(Math.abs(blind.perLead.II.qrsDurMs - ref.perLead.II.qrsDurMs)).toBeLessThanOrEqual(20);
  });

  it('returns zeros for an empty delineation', () => {
    const ecg = generateEcg(getCase('G01')!.scenario, 0);
    const empty = {
      fs: ecg.fs,
      beats: [],
      rrMs: [],
      hrBpm: null,
      prMs: null,
      qrsMs: null,
      qtMs: null,
      qtc: { bazett: null, fridericia: null, framingham: null, hodges: null },
      axisDeg: { p: null, qrs: null, t: null },
      atrialRateBpm: null,
      rhythmRegularity: 'irregular' as const,
      pacingSpikes: [],
      noiseMv: 0,
      evidence: {
        hr: { status: 'unavailable' as const, count: 0, note: '' },
        pr: { status: 'unavailable' as const, count: 0, note: '' },
        qrs: { status: 'unavailable' as const, count: 0, note: '' },
        qt: { status: 'unavailable' as const, count: 0, note: '' },
        axis: { status: 'unavailable' as const, count: 0, note: '' },
        atrialRate: { status: 'unavailable' as const, count: 0, note: '' },
      },
      quality: 'bad' as const,
    };
    const m = measureFromDelineation(empty, ecg.clean, ecg.fs);
    expect(m.perLead.II.stJ).toBe(0);
    expect(m.perLead.V3.rAmp).toBe(0);
  });
});

describe('auditMeasurements', () => {
  it('is usable for identical inputs', () => {
    const { ref } = blindVsRef('A01');
    const a = auditMeasurements(ref, ref);
    expect(a.status).toBe('usable');
    expect(a.stDiscordant).toHaveLength(0);
    expect(a.tDiscordant).toHaveLength(0);
  });

  it('is unavailable when 3 leads differ by 0.2 mV at J', () => {
    const { ref } = blindVsRef('A01');
    const shifted = {
      ...ref,
      perLead: {
        ...ref.perLead,
        V2: { ...ref.perLead.V2, stJ: ref.perLead.V2.stJ + 0.2 },
        V3: { ...ref.perLead.V3, stJ: ref.perLead.V3.stJ + 0.2 },
        V4: { ...ref.perLead.V4, stJ: ref.perLead.V4.stJ + 0.2 },
      },
    };
    const a = auditMeasurements(shifted, ref);
    expect(a.status).toBe('unavailable');
    expect(a.stDiscordant).toEqual(['V2', 'V3', 'V4']);
  });
});
