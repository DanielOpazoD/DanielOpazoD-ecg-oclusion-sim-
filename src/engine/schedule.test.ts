import { describe, expect, it } from 'vitest';
import { generateSchedule } from './schedule.js';
import { assertRepresentableSchedule, ModelScopeError } from './constraints.js';
import { createRng } from './math/random.js';
import { generateEcg, type Scenario } from './scenario.js';

const sched = (
  rhythm: Parameters<typeof generateSchedule>[0],
  ectopy: Parameters<typeof generateSchedule>[1],
  durS: number,
  seed = 7,
) => generateSchedule(rhythm, ectopy, durS, createRng(seed));

describe('schedule — determinism and sinus', () => {
  it('same seed ⇒ identical schedule', () => {
    const a = sched({ type: 'sinus', hrBpm: 72 }, undefined, 10);
    const b = sched({ type: 'sinus', hrBpm: 72 }, undefined, 10);
    expect(a.beats).toEqual(b.beats);
    expect(a.atrial).toEqual(b.atrial);
  });
  it('sinus HR within ±3% over 60 s', () => {
    const { beats } = sched({ type: 'sinus', hrBpm: 80 }, undefined, 60);
    const hr = 60000 / ((beats.at(-1)!.tMs - beats[0]!.tMs) / (beats.length - 1));
    expect(Math.abs(hr - 80) / 80).toBeLessThan(0.03);
  });
  it('conducted beats carry a P event prMs before them', () => {
    const s = sched({ type: 'sinus', hrBpm: 70 }, undefined, 10);
    const b = s.beats[1]!;
    expect(b.prMs).toBeDefined();
    const p = s.atrial.find((a) => a.conducted && Math.abs(a.tMs - (b.tMs - (b.prMs ?? 0))) < 30);
    expect(p).toBeDefined();
  });
});

describe('schedule — AF / flutter / SVT / junctional', () => {
  it('afib: RR CV > 0.15 and no RR < 250 ms', () => {
    const { beats } = sched({ type: 'afib', hrBpm: 90 }, undefined, 60);
    const rrs = beats.slice(1).map((b, i) => b.tMs - beats[i]!.tMs);
    const mean = rrs.reduce((a, x) => a + x, 0) / rrs.length;
    const sd = Math.sqrt(rrs.reduce((a, x) => a + (x - mean) ** 2, 0) / rrs.length);
    expect(sd / mean).toBeGreaterThan(0.15);
    expect(Math.min(...rrs)).toBeGreaterThanOrEqual(250);
  });
  it('flutter 2:1: ventricular rate = atrial/2 ±2%', () => {
    const { beats } = sched({ type: 'flutter', atrialBpm: 300, ratio: 2 }, undefined, 20);
    const hr = 60000 / ((beats.at(-1)!.tMs - beats[0]!.tMs) / (beats.length - 1));
    expect(Math.abs(hr - 150) / 150).toBeLessThan(0.02);
  });
  it('svt: retrograde P 70 ms after each QRS', () => {
    const s = sched({ type: 'svt', hrBpm: 180 }, undefined, 10);
    const b = s.beats[2]!;
    expect(s.atrial.some((a) => a.kind === 'retrograde' && a.tMs === b.tMs + 70)).toBe(true);
  });
  it('junctional: narrow beats with retrograde P after QRS', () => {
    const s = sched({ type: 'junctional', hrBpm: 50 }, undefined, 10);
    expect(s.beats.every((b) => !b.ventricular)).toBe(true);
    expect(s.atrial.some((a) => a.kind === 'retrograde')).toBe(true);
  });
});

describe('schedule — AV blocks', () => {
  it('Mobitz I 4:3: decreasing PR increments, every 4th P non-conducted, pause < 2×PP', () => {
    const s = sched({ type: 'av-block-2-mobitz1', hrBpm: 75, ratio: '4:3' }, undefined, 30);
    const prs = s.beats.map((b) => b.prMs ?? 0);
    // Within each cycle of 3 conducted beats PR grows with decreasing increments.
    let checked = 0;
    for (let i = 0; i + 2 < prs.length; i += 3) {
      const d1 = prs[i + 1]! - prs[i]!;
      const d2 = prs[i + 2]! - prs[i + 1]!;
      expect(d1).toBeGreaterThan(0);
      expect(d2).toBeGreaterThan(0);
      expect(d2).toBeLessThan(d1); // PR increments shrink each beat
      checked++;
    }
    expect(checked).toBeGreaterThan(2);
    // Every 4th P is non-conducted.
    const dropped = s.atrial.filter((a) => !a.conducted);
    const conductedP = s.atrial.filter((a) => a.conducted);
    expect(Math.abs(dropped.length * 3 - conductedP.length)).toBeLessThanOrEqual(2);
    // Pause < 2×PP.
    const pRr = 60000 / 75;
    const rrs = s.beats.slice(1).map((b, i) => b.tMs - s.beats[i]!.tMs);
    for (const rr of rrs) expect(rr).toBeLessThan(2 * pRr + 5);
  });
  it('Mobitz II: constant PR', () => {
    const s = sched({ type: 'av-block-2-mobitz2', hrBpm: 75, ratio: '3:2' }, undefined, 30);
    const prs = new Set(s.beats.map((b) => Math.round(b.prMs ?? 0)));
    expect(prs.size).toBe(1);
    expect(s.atrial.some((a) => !a.conducted)).toBe(true);
  });
  it('complete block: independent atrial/ventricular rates, PR not constant', () => {
    const s = sched(
      { type: 'av-block-3', atrialBpm: 80, escapeBpm: 45, escapeOrigin: 'junctional' },
      undefined,
      30,
    );
    const pRate = 60000 / ((s.atrial.at(-1)!.tMs - s.atrial[0]!.tMs) / (s.atrial.length - 1));
    const vRate = 60000 / ((s.beats.at(-1)!.tMs - s.beats[0]!.tMs) / (s.beats.length - 1));
    expect(Math.abs(pRate - 80)).toBeLessThan(2);
    expect(Math.abs(vRate - 45)).toBeLessThan(2);
    // PR is random: distance from each beat to the preceding P varies.
    const gaps = s.beats.slice(1, 12).map((b) => {
      const before = s.atrial.filter((a) => a.tMs <= b.tMs).at(-1)!;
      return Math.round(b.tMs - before.tMs);
    });
    expect(new Set(gaps).size).toBeGreaterThan(3);
    expect(s.beats.every((b) => b.prMs === undefined)).toBe(true);
  });
});

describe('schedule — ectopy', () => {
  it('bigeminy: alternating sinus/pvc', () => {
    const { beats } = sched({ type: 'sinus', hrBpm: 70 }, { kind: 'pvc', pattern: 'bigeminy' }, 10);
    expect(beats[0]!.kind).toBe('sinus');
    expect(beats[1]!.kind).toBe('pvc');
    expect(beats[2]!.kind).toBe('sinus');
    expect(beats[3]!.kind).toBe('pvc');
  });
  it('PVC: full compensatory pause (coupling + post-PVC RR ≈ 2×base)', () => {
    const { beats } = sched(
      { type: 'sinus', hrBpm: 70 },
      { kind: 'pvc', pattern: 'isolated', perMin: 6 },
      20,
    );
    const base = 60000 / 70;
    const i = beats.findIndex((b) => b.kind === 'pvc');
    expect(i).toBeGreaterThan(0);
    const coupling = beats[i]!.tMs - beats[i - 1]!.tMs;
    const post = beats[i + 1]!.tMs - beats[i]!.tMs;
    expect(Math.abs(coupling + post - 2 * base) / (2 * base)).toBeLessThan(0.05);
  });
  it('PAC: non-compensatory (sinus node resets to P′ + baseRr)', () => {
    const s = sched(
      { type: 'sinus', hrBpm: 70 },
      { kind: 'pac', pattern: 'isolated', perMin: 6 },
      20,
    );
    const beats = s.beats;
    const i = beats.findIndex((b) => b.kind === 'pac');
    expect(i).toBeGreaterThan(0);
    const base = 60000 / 70;
    // Non-compensatory: interval pre-PAC sinus → post-PAC sinus < 2×RR.
    const interval = beats[i + 1]!.tMs - beats[i - 1]!.tMs;
    expect(interval).toBeLessThan(2 * base * 1.08);
    // Sinus-node reset: post-PAC sinus P onset = P' + baseRr (±8%).
    const pPrime = s.atrial.find((a) => a.kind === 'ectopic' && a.conducted)!;
    const nextSinus = s.atrial.find((a) => a.kind === 'sinus' && a.tMs > pPrime.tMs)!;
    expect(Math.abs(nextSinus.tMs - pPrime.tMs - base) / base).toBeLessThan(0.08);
  });
});

describe('schedule — pacing / ventricular', () => {
  it('VVI at 60 → 10 beats in 10 s, ventricular + spike', () => {
    const { beats } = sched({ type: 'paced', mode: 'VVI', rateBpm: 60 }, undefined, 10);
    expect(beats.length).toBe(10);
    expect(beats.every((b) => b.ventricular && b.pacedSpike === 'ventricular')).toBe(true);
  });
  it('DDD: atrial + ventricular spikes, beat prMs = avDelay', () => {
    const { beats } = sched(
      { type: 'paced', mode: 'DDD', rateBpm: 70, avDelayMs: 160 },
      undefined,
      10,
    );
    expect(beats[0]!.pacedSpike).toBe('both');
    expect(beats[0]!.prMs).toBe(160);
  });
  it('torsades: beats carry axisRotDeg + ampScale', () => {
    const { beats } = sched({ type: 'torsades', hrBpm: 150 }, undefined, 10);
    expect(beats.every((b) => b.axisRotDeg !== undefined && b.ampScale !== undefined)).toBe(true);
    const amps = beats.map((b) => b.ampScale!);
    expect(Math.max(...amps) - Math.min(...amps)).toBeGreaterThan(0.5);
  });
  it('vf/asystole produce no beats', () => {
    expect(sched({ type: 'vf' }, undefined, 10).beats).toHaveLength(0);
    expect(sched({ type: 'asystole' }, undefined, 10).beats).toHaveLength(0);
  });
});

describe('constraints — ModelScopeError', () => {
  it('premature coupling 150 ms throws premature-before-t', () => {
    const s = sched(
      { type: 'sinus', hrBpm: 70 },
      { kind: 'pvc', pattern: 'isolated', perMin: 20, couplingMs: 150 },
      15,
    );
    expect(() =>
      assertRepresentableSchedule(
        s,
        { type: 'sinus', hrBpm: 70 },
        { kind: 'pvc', pattern: 'isolated', perMin: 20, couplingMs: 150 },
      ),
    ).toThrowError(ModelScopeError);
    try {
      assertRepresentableSchedule(
        s,
        { type: 'sinus', hrBpm: 70 },
        { kind: 'pvc', pattern: 'isolated', perMin: 20, couplingMs: 150 },
      );
      expect.unreachable();
    } catch (e) {
      expect((e as ModelScopeError).code).toBe('premature-before-t');
    }
  });
  it('ectopy + vt throws unsupported-combination', () => {
    const s = sched({ type: 'vt', hrBpm: 150 }, { kind: 'pvc', pattern: 'isolated' }, 10);
    try {
      assertRepresentableSchedule(
        s,
        { type: 'vt', hrBpm: 150 },
        { kind: 'pvc', pattern: 'isolated' },
      );
      expect.unreachable();
    } catch (e) {
      expect((e as ModelScopeError).code).toBe('unsupported-combination');
    }
  });
  it('generateEcg throws ModelScopeError for out-of-scope scenarios', () => {
    const sc: Scenario = {
      seed: 5,
      durationS: 10,
      rhythm: { type: 'vt', hrBpm: 150 },
      ectopy: { kind: 'pvc', pattern: 'isolated' },
      conduction: 'normal',
      sources: [],
      variability: false,
    };
    expect(() => generateEcg(sc)).toThrowError(ModelScopeError);
  });
});

describe('generateEcg — pacing spike rendering', () => {
  it('VVI: steep spike precedes each paced QRS by ≤10 ms', () => {
    const sc: Scenario = {
      seed: 3,
      durationS: 5,
      rhythm: { type: 'paced', mode: 'VVI', rateBpm: 70 },
      conduction: 'paced',
      sources: [],
      variability: false,
    };
    const ecg = generateEcg(sc);
    const sig = ecg.clean.II;
    const dtMs = 1000 / ecg.fs;
    for (const b of ecg.beats) {
      let maxDeriv = 0;
      let maxIdx = b.qrsOnset;
      for (let i = b.qrsOnset - 20; i < b.qrsOnset; i++) {
        const d = Math.abs(sig[i + 1]! - sig[i]!) * ecg.fs;
        if (d > maxDeriv) {
          maxDeriv = d;
          maxIdx = i;
        }
      }
      expect(maxDeriv).toBeGreaterThan(50);
      expect(b.qrsOnset - maxIdx).toBeLessThanOrEqual(10 / dtMs);
    }
  });
});
