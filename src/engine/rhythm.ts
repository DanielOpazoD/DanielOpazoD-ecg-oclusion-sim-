import type { Rng } from './math/random.js';

/**
 * Beat scheduling: rhythm specifications and beat trains (MODEL.md §5.1).
 */

/** Rhythm specification union (§5.1). */
export type RhythmSpec =
  | { type: 'sinus'; hrBpm: number; hrv?: boolean }
  | { type: 'sinus-bradycardia'; hrBpm: number }
  | { type: 'av-block-1'; hrBpm: number; prMs: number }
  | { type: 'av-block-2-mobitz1'; hrBpm: number; ratio: '3:2' | '4:3' }
  | { type: 'av-block-3'; atrialBpm: number; escapeBpm: number; escapeWide?: boolean }
  | { type: 'aivr'; hrBpm: number }
  | { type: 'pvc'; hrBpm: number; pvcPerMin: number; couplingMs?: number }
  | { type: 'afib'; hrBpm: number }
  | { type: 'svt'; hrBpm: number }
  | { type: 'paced-rhythm'; hrBpm: number };

/** Beat morphology classification used for fiducials and dipole selection. */
export type BeatType = 'sinus' | 'pvc' | 'escape' | 'aivr' | 'paced';

/** One scheduled beat (§5.1). */
export interface BeatEvent {
  /** Beat time (QRS onset) in ms from scenario start. */
  tMs: number;
  type: BeatType;
  /** Whether a P wave precedes this beat (§2.1). */
  hasP: boolean;
  /** PR interval in ms (−1 = dissociated P, randomised per beat). */
  prMs: number;
  /** RR interval preceding this beat in ms (QT scaling, §2.3). */
  rrMs: number;
}

/**
 * Generate the beat train for `durationS` seconds (§5.1).
 * Deterministic given `rng`.
 */
export function generateBeatSchedule(spec: RhythmSpec, durationS: number, rng: Rng): BeatEvent[] {
  const endMs = durationS * 1000;
  const beats: BeatEvent[] = [];
  const push = (tMs: number, type: BeatType, hasP: boolean, prMs: number, rrMs: number) => {
    if (tMs >= -400 && tMs < endMs) beats.push({ tMs, type, hasP, prMs, rrMs });
  };

  switch (spec.type) {
    case 'sinus':
    case 'sinus-bradycardia':
    case 'av-block-1':
    case 'paced-rhythm': {
      const hr = spec.type === 'sinus-bradycardia' ? Math.min(spec.hrBpm, 59) : spec.hrBpm;
      const baseRr = 60000 / hr;
      const hrv = spec.type === 'sinus' ? (spec.hrv ?? true) : true;
      let t = 0;
      let prevRr = baseRr;
      while (t < endMs) {
        const s = t / 1000;
        const mod = hrv ? 1 + 0.03 * Math.sin(2 * Math.PI * 0.25 * s) : 1;
        const rr = baseRr * mod * (1 + 0.015 * rng.gaussian());
        const pr = spec.type === 'av-block-1' ? spec.prMs : 160 + 20 * rng.gaussian();
        push(t, spec.type === 'paced-rhythm' ? 'paced' : 'sinus', true, pr, prevRr);
        t += rr;
        prevRr = rr;
      }
      break;
    }
    case 'svt': {
      const rr = 60000 / Math.min(200, Math.max(150, spec.hrBpm));
      let t = 0;
      while (t < endMs) {
        push(t, 'sinus', false, -1, rr); // P hidden in T (§5.1 svt)
        t += rr;
      }
      break;
    }
    case 'av-block-2-mobitz1': {
      // Wenckebach: PR lengthens then a P is dropped (3:2 or 4:3).
      const conducted = spec.ratio === '3:2' ? 2 : 3;
      const pRr = 60000 / spec.hrBpm;
      let cycleStart = 0;
      let prevRr = pRr;
      while (cycleStart < endMs) {
        for (let k = 0; k < conducted; k++) {
          const t = cycleStart + k * pRr;
          const pr = 200 + k * 80 + 10 * rng.gaussian(); // lengthening PR
          push(t, 'sinus', true, pr, prevRr);
          prevRr = pRr;
        }
        // dropped beat: skip one P
        cycleStart += (conducted + 1) * pRr;
      }
      break;
    }
    case 'av-block-3': {
      // Ventricular escape train; P waves dissociated (§5.1).
      const rr = 60000 / spec.escapeBpm;
      let t = 0;
      while (t < endMs) {
        push(t, 'escape', true, -1, rr); // hasP → dissociated P handled in scenario
        t += rr;
      }
      break;
    }
    case 'aivr': {
      const hr = Math.min(110, Math.max(60, spec.hrBpm));
      const rr = 60000 / hr;
      let t = 0;
      while (t < endMs) {
        push(t, 'aivr', false, -1, rr); // AV dissociation (§5.1)
        t += rr;
      }
      break;
    }
    case 'pvc': {
      // Underlying sinus + interpolated PVCs with compensatory pause (§5.1).
      const baseRr = 60000 / spec.hrBpm;
      const coupling = spec.couplingMs ?? 520;
      let t = 0;
      let prevRr = baseRr;
      let nextPvc = t + 60000 / spec.pvcPerMin;
      while (t < endMs) {
        if (t >= nextPvc) {
          const tp = t + coupling * (0.9 + 0.2 * rng.next());
          push(tp, 'pvc', false, -1, tp - t);
          t = tp + baseRr * 1.8; // compensatory pause
          nextPvc = t + 60000 / spec.pvcPerMin;
          prevRr = baseRr;
          continue;
        }
        push(t, 'sinus', true, 160 + 20 * rng.gaussian(), prevRr);
        t += baseRr;
        prevRr = baseRr;
      }
      break;
    }
    case 'afib': {
      const base = 60000 / spec.hrBpm;
      let t = 0;
      let prevRr = base;
      while (t < endMs) {
        push(t, 'sinus', false, -1, prevRr);
        const rr = base * (0.65 + 0.7 * rng.next()); // §5.1
        t += rr;
        prevRr = rr;
      }
      break;
    }
  }
  beats.sort((a, b) => a.tMs - b.tMs);
  return beats;
}
