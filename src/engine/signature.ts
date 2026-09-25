import { LEAD_IDS, type LeadId } from './leads.js';
import type { Ecg12 } from './scenario.js';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Compact per-lead signal fingerprint used for engine regression snapshots:
 * `[min, max, mean, rms, v(25%), v(50%), v(75%)]` in mV, 4 decimals.
 */
export function ecgSignature(ecg: Ecg12): Record<LeadId, number[]> {
  const out = {} as Record<LeadId, number[]>;
  for (const lead of LEAD_IDS) {
    const s = ecg.leads[lead];
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < s.length; i++) {
      const v = s[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      sq += v * v;
    }
    const n = s.length;
    const at = (f: number) => s[Math.min(n - 1, Math.floor(n * f))]!;
    out[lead] = [min, max, sum / n, Math.sqrt(sq / n), at(0.25), at(0.5), at(0.75)].map(r4);
  }
  return out;
}
