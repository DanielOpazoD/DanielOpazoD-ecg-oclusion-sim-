import { describe, expect, it } from 'vitest';
import { getCase } from '../cases/index.js';
import { generateEcg } from '../engine/index.js';
import { delineate } from '../analysis/delineate/delineate.js';
import { pickBeat, beatWindow, renderBeatReaderSvg } from './ecg/beatDetail.js';

function ecgAndDelin(id: string) {
  const c = getCase(id)!;
  const ecg = generateEcg(c.scenario, c.ecgAtMin);
  const delin = delineate({ fs: ecg.fs, leads: ecg.leads });
  return { ecg, delin };
}

describe('pickBeat', () => {
  it('returns the beat with nearest qrsOnsetS', () => {
    const { delin } = ecgAndDelin('A01');
    const target = delin.beats[2]!;
    expect(pickBeat(delin, target.qrsOnsetS + 0.05)).toBe(2);
    expect(pickBeat(delin, target.qrsOnsetS - 0.1)).toBe(2);
    // Between two beats picks the closer one.
    const mid = (delin.beats[0]!.qrsOnsetS + delin.beats[1]!.qrsOnsetS) / 2;
    expect([0, 1]).toContain(pickBeat(delin, mid));
  });
});

describe('beatWindow', () => {
  it('is qrsOnset −250 ms … +650 ms', () => {
    const { delin } = ecgAndDelin('A01');
    const w = beatWindow(delin, 1);
    expect(w.t0).toBeCloseTo(delin.beats[1]!.qrsOnsetS - 0.25, 6);
    expect(w.t1).toBeCloseTo(delin.beats[1]!.qrsOnsetS + 0.65, 6);
  });
});

describe('renderBeatReaderSvg', () => {
  it('A01 II contains PR/QRS/QT dimension labels', () => {
    const { ecg, delin } = ecgAndDelin('A01');
    const svg = renderBeatReaderSvg(ecg, delin, 0, 'II');
    expect(svg).toContain('PR ');
    expect(svg).toContain('QRS ');
    expect(svg).toContain('QT ');
    expect(svg).toContain('T fin');
    expect(svg).toContain('ms desde QRS');
  });
  it('omits PR when the beat has no P fiducial', () => {
    // G05 (AF con respuesta ventricular rápida): no P fiducials.
    const { ecg, delin } = ecgAndDelin('G05');
    const idx = delin.beats.findIndex((b) => b.pOnsetS === undefined);
    expect(idx, 'G05 should delineate at least one P-less beat').toBeGreaterThanOrEqual(0);
    const svg = renderBeatReaderSvg(ecg, delin, idx, 'II');
    expect(svg).not.toContain('PR ');
    expect(svg).not.toContain('>P<');
    expect(svg).toContain('QRS ');
  });
});
