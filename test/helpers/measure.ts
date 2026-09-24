import type { Ecg12, Fiducials, LeadId } from '../../src/engine/index.js';

/**
 * Internal measurement helper (MODEL.md §8 preview; §9 tests).
 * Uses engine fiducials on the `clean` signal — the real analysis layer
 * will replace this.
 */

/** 1 mV = 10 mm (standard calibration). */
export const MV_PER_MM = 0.1;

export interface BeatMeasurement {
  /** PR-segment baseline in mV (§8). */
  baseline: number;
  /** ST at J, J+60 ms, J+80 ms relative to baseline, mV (§8). */
  stJ: number;
  st60: number;
  st80: number;
  /** R amplitude (max positive in QRS window, above baseline), mV. */
  rAmp: number;
  /** S amplitude (max negative depth, below baseline), mV (≥0). */
  sAmp: number;
  /** T amplitude (signed extremum in [J, Tend]), mV. */
  tAmp: number;
  qrsDurMs: number;
}

function msToSamples(ms: number, fs: number): number {
  return Math.round((ms / 1000) * fs);
}

/**
 * Measure `lead` on the dominant sinus beat (§8: dominant sinus beat via
 * fiducials; here the first non-ectopic beat with margin).
 */
export function measureBeat(ecg: Ecg12, lead: LeadId, beatIndex?: number): BeatMeasurement {
  const signal = ecg.clean[lead];
  const fs = ecg.fs;
  const beats = ecg.beats;
  const idx = beatIndex ?? beats.findIndex((b) => b.type === 'sinus' || b.type === 'paced');
  const beat: Fiducials = beats[idx >= 0 ? idx : 0]!;

  const b0 = beat.qrsOnset - msToSamples(60, fs);
  const b1 = beat.qrsOnset - msToSamples(20, fs);
  let baseline = 0;
  let cnt = 0;
  for (let i = Math.max(0, b0); i <= Math.min(signal.length - 1, b1); i++) {
    baseline += signal[i]!;
    cnt++;
  }
  baseline /= Math.max(1, cnt);

  const at = (i: number) => signal[Math.min(signal.length - 1, Math.max(0, i))]! - baseline;

  let rAmp = 0;
  let sAmp = 0;
  for (let i = beat.qrsOnset; i <= beat.j; i++) {
    const v = at(i);
    if (v > rAmp) rAmp = v;
    if (v < -sAmp) sAmp = -v;
  }
  let tAmp = 0;
  for (let i = beat.j; i <= beat.tEnd; i++) {
    const v = at(i);
    if (Math.abs(v) > Math.abs(tAmp)) tAmp = v;
  }

  return {
    baseline,
    stJ: at(beat.j),
    st60: at(beat.j + msToSamples(60, fs)),
    st80: at(beat.j + msToSamples(80, fs)),
    rAmp,
    sAmp,
    tAmp,
    qrsDurMs: ((beat.j - beat.qrsOnset) / fs) * 1000,
  };
}

/** mV → mm. */
export function mm(mv: number): number {
  return mv / MV_PER_MM;
}
