import type { Rng } from './math/random.js';

/**
 * Acquisition chain: additive noise sources and filters (MODEL.md §7).
 * Order: dipole → projection → noise → filters (§7).
 */

/** Noise and filter configuration (§7). */
export interface AcquisitionSpec {
  /** Baseline wander: respiration sine + slow drift (§7). */
  baselineWander?: { amplitudeMv: number; hz: number };
  /** EMG: band-limited muscle noise, σ in mV (§7). */
  emg?: { sigmaMv: number };
  /** Powerline interference (§7). */
  powerline?: { hz: 50 | 60; amplitudeMv: number };
  /** Random motion transients (§7). */
  motion?: { perMin: number; amplitudeMv: number };
  /** High-pass corner Hz: 0.05 diagnostic | 0.5 monitor (§7). */
  highPassHz?: number;
  /** 'zero-phase' (bidirectional) or 'causal' (single direction) (§7). */
  highPassMode?: 'zero-phase' | 'causal';
  /** Low-pass corner Hz: 150 diagnostic | 40 monitor (§7). */
  lowPassHz?: number;
}

/** First-order high-pass filter `y[n] = a(y[n−1] + x[n] − x[n−1])` (§7).
 * `mode: 'zero-phase'` applies it forward and backward (no phase shift);
 * `'causal'` applies once forward (distorts ST — monitor mode). */
export function highPass(
  signal: Float32Array,
  fs: number,
  hz: number,
  mode: 'zero-phase' | 'causal',
): Float32Array {
  const out = hpForward(signal, fs, hz);
  if (mode === 'zero-phase') {
    out.reverse();
    const out2 = hpForward(out, fs, hz);
    out2.reverse();
    return out2;
  }
  return out;
}

function hpForward(x: Float32Array, fs: number, hz: number): Float32Array {
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * hz);
  const a = rc / (rc + dt);
  const y = new Float32Array(x.length);
  if (x.length === 0) return y;
  y[0] = x[0]!;
  for (let i = 1; i < x.length; i++) {
    y[i] = a * (y[i - 1]! + x[i]! - x[i - 1]!);
  }
  return y;
}

/** First-order low-pass filter `y += a(x − y)` (§7). */
export function lowPass(signal: Float32Array, fs: number, hz: number): Float32Array {
  const dt = 1 / fs;
  const rc = 1 / (2 * Math.PI * hz);
  const a = dt / (rc + dt);
  const y = new Float32Array(signal.length);
  if (signal.length === 0) return y;
  y[0] = signal[0]!;
  for (let i = 1; i < signal.length; i++) {
    y[i] = y[i - 1]! + a * (signal[i]! - y[i - 1]!);
  }
  return y;
}

/**
 * Add noise sources to a single lead signal (§7). Mutates and returns
 * `signal`. Deterministic given `rng`.
 */
export function addNoise(
  signal: Float32Array,
  spec: AcquisitionSpec,
  fs: number,
  rng: Rng,
): Float32Array {
  const n = signal.length;

  if (spec.baselineWander && spec.baselineWander.amplitudeMv > 0) {
    const { amplitudeMv, hz } = spec.baselineWander;
    const phase = rng.next() * 2 * Math.PI;
    const driftPhase = rng.next() * 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      const t = i / fs;
      signal[i]! += amplitudeMv * Math.sin(2 * Math.PI * hz * t + phase);
      signal[i]! += 0.3 * amplitudeMv * Math.sin(2 * Math.PI * 0.05 * t + driftPhase);
    }
  }

  if (spec.emg && spec.emg.sigmaMv > 0) {
    // Band-limited approximation: smoothed white noise (20–100 Hz feel).
    let prev = 0;
    for (let i = 0; i < n; i++) {
      const w = spec.emg.sigmaMv * rng.gaussian();
      prev = 0.3 * prev + 0.7 * w;
      signal[i]! += prev;
    }
  }

  if (spec.powerline && spec.powerline.amplitudeMv > 0) {
    const { hz, amplitudeMv } = spec.powerline;
    const phase = rng.next() * 2 * Math.PI;
    for (let i = 0; i < n; i++) {
      signal[i]! += amplitudeMv * Math.sin((2 * Math.PI * hz * i) / fs + phase);
    }
  }

  if (spec.motion && spec.motion.perMin > 0) {
    const { perMin, amplitudeMv } = spec.motion;
    const durS = n / fs;
    const expected = (perMin / 60) * durS;
    const count = Math.floor(expected) + (rng.next() < expected % 1 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const center = rng.next() * n;
      const amp = amplitudeMv * (0.5 + rng.next()) * (rng.next() < 0.5 ? -1 : 1);
      const tauSamples = 0.15 * fs; // τ 150 ms (§7)
      for (let i = Math.floor(center); i < n; i++) {
        signal[i]! += amp * Math.exp(-(i - center) / tauSamples);
      }
    }
  }

  return signal;
}
