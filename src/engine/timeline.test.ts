import { describe, expect, it } from 'vitest';
import { effectiveSource, aivrWindow, type TimelineEvent } from './timeline.js';
import { generateSchedule, type RhythmSpec } from './schedule.js';
import { createRng } from './math/random.js';
import { generateEcg, defaultScenario } from './scenario.js';
import { measureEcg } from '../analysis/index.js';
import type { Ecg12, LeadId } from './index.js';

const measureBeat = (ecg: Ecg12, l: LeadId) => measureEcg(ecg).perLead[l];

const M = { st: 2, hyperacuteT: 1.5, tInversion: 0 };
const occ: TimelineEvent[] = [{ atMin: 0, kind: 'occlusion' }];

describe('timeline — §6', () => {
  it('occlusion ramps: st 0 at t0, full by 25 min; hyperacuteT peaks early', () => {
    expect(effectiveSource(M, occ, 0).st).toBe(0);
    const e5 = effectiveSource(M, occ, 5);
    const e45 = effectiveSource(M, occ, 45);
    expect(e5.hyperacuteT).toBeGreaterThan(0.5);
    expect(e5.st).toBeLessThan(e45.st);
    expect(e45.st).toBeGreaterThan(1.5);
  });
  it('reperfusion: st decays, hyperacuteT → 0, tInversion ramps, qLoss frozen', () => {
    const evs: TimelineEvent[] = [
      { atMin: 0, kind: 'occlusion' },
      { atMin: 120, kind: 'reperfusion' },
    ];
    const atRep = effectiveSource(M, evs, 120).st;
    const e90 = effectiveSource(M, evs, 210);
    expect(e90.st).toBeLessThan(0.5 * atRep);
    expect(e90.hyperacuteT).toBe(0);
    expect(e90.tInversion).toBeGreaterThan(0);
    expect(e90.qLoss).toBeGreaterThan(0);
  });
  it('reocclusion: tInversion resets then rises', () => {
    const evs: TimelineEvent[] = [
      { atMin: 0, kind: 'occlusion' },
      { atMin: 60, kind: 'reperfusion' },
      { atMin: 200, kind: 'reocclusion' },
    ];
    const e5 = effectiveSource(M, evs, 205);
    expect(e5.tInversion).toBeLessThan(0.15);
    expect(effectiveSource(M, evs, 230).st).toBeGreaterThan(e5.st);
  });
  it('aivrWindow returns [tR, tR+30]', () => {
    expect(aivrWindow(60)).toEqual([60, 90]);
  });
});

describe('rhythm — §5.1', () => {
  it.each([
    { type: 'sinus', hrBpm: 70 },
    { type: 'sinus', hrBpm: 45 },
    { type: 'av-block-1', hrBpm: 70, prMs: 260 },
    { type: 'av-block-2-mobitz1', hrBpm: 75, ratio: '3:2' },
    { type: 'av-block-3', atrialBpm: 80, escapeBpm: 45, escapeOrigin: 'junctional' },
    { type: 'aivr', hrBpm: 90 },
    { type: 'afib', hrBpm: 90 },
    { type: 'svt', hrBpm: 180 },
    { type: 'paced', mode: 'VVI', rateBpm: 70 },
  ] as RhythmSpec[])('produces beats for %o', (spec) => {
    const beats = generateSchedule(spec, undefined, 10, createRng(4)).beats;
    expect(beats.length).toBeGreaterThan(0);
    expect(beats.every((b) => b.tMs < 10000)).toBe(true);
  });
  it('sinus HRV: RR varies', () => {
    const beats = generateSchedule({ type: 'sinus', hrBpm: 70 }, undefined, 20, createRng(2)).beats;
    const rrs = beats.slice(1).map((b, i) => b.tMs - beats[i]!.tMs);
    expect(Math.max(...rrs) - Math.min(...rrs)).toBeGreaterThan(5);
  });
  it('mobitz drops beats (fewer QRS than sinus at same HR)', () => {
    const m = generateSchedule(
      { type: 'av-block-2-mobitz1', hrBpm: 75, ratio: '3:2' },
      undefined,
      60,
      createRng(1),
    ).beats;
    expect(m.length).toBeLessThan(70);
  });
});

describe('conduction variants — §5.2 smoke', () => {
  it.each(['lbbb', 'rbbb', 'paced', 'lvh', 'lvh-strain', 'wpw'] as const)(
    'generates ECG for %s',
    (c) => {
      const ecg = generateEcg({ ...defaultScenario(), durationS: 3, conduction: c });
      expect(ecg.clean.V5.length).toBe(1500);
    },
  );
  it('lbbb widens QRS to ~150 ms', () => {
    const ecg = generateEcg({ ...defaultScenario(), durationS: 3, conduction: 'lbbb' });
    expect(measureBeat(ecg, 'V5').qrsDurMs).toBeGreaterThanOrEqual(140);
  });
});
