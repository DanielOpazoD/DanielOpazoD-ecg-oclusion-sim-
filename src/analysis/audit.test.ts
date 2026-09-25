import { describe, expect, it } from 'vitest';
import { auditDelineation } from './audit.js';
import type { Delineation } from './delineate/delineate.js';
import { evidence, unavailable } from './delineate/evidence.js';
import type { Fiducials } from '../engine/index.js';

const ok = evidence([0.83, 0.83, 0.83], 3, 0.15, 'ok');
const base: Delineation = {
  fs: 500,
  beats: [],
  rrMs: [833],
  hrBpm: 72,
  prMs: 160,
  qrsMs: 90,
  qtMs: 380,
  qtc: { bazett: 400, fridericia: 395, framingham: 398, hodges: 396 },
  axisDeg: { p: null, qrs: 60, t: 55 },
  atrialRateBpm: null,
  rhythmRegularity: 'regular',
  pacingSpikes: [],
  noiseMv: 0.01,
  evidence: { hr: ok, pr: ok, qrs: ok, qt: ok, axis: ok, atrialRate: unavailable('x') },
  quality: 'ok',
};

const truth = (
  prMs: number,
): { fiducials: Fiducials[]; schedule: { beats: []; atrial: [] }; fs: number } => ({
  fs: 500,
  fiducials: [1, 2, 3, 4].map((k) => ({
    pOnset: k * 416 - (prMs / 1000) * 500,
    qrsOnset: k * 416,
    j: k * 416 + 44,
    tEnd: k * 416 + 190,
    kind: 'sinus' as const,
  })),
  schedule: { beats: [], atrial: [] },
});

describe('auditDelineation', () => {
  it('withdraws a PR that disagrees with truth by more than 25 ms', () => {
    const out = auditDelineation({ ...base, prMs: 220 }, truth(160));
    expect(out.prMs).toBeNull();
    expect(out.evidence.pr.status).toBe('unavailable');
    expect(out.evidence.pr.note).toContain('PR');
    // Truth is never written into the output.
    expect(out.prMs).not.toBe(160);
  });

  it('passes correct values through unchanged', () => {
    const out = auditDelineation(base, truth(160));
    expect(out.prMs).toBe(160);
    expect(out.hrBpm).toBe(72);
    expect(out.qrsMs).toBe(90);
    expect(out.qtMs).toBe(380);
    expect(out.evidence.pr.status).toBe('usable');
  });

  it('withdraws an out-of-tolerance heart rate and QT', () => {
    const out = auditDelineation({ ...base, hrBpm: 95, qtMs: 440 }, truth(160));
    expect(out.hrBpm).toBeNull();
    expect(out.qtMs).toBeNull();
    expect(out.qtc.bazett).toBeNull();
  });
});
