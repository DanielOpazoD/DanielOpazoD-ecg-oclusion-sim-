import { LEAD_IDS, type LeadId } from './leads.js';
import type { Ecg12 } from './scenario.js';

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Compact per-lead signal fingerprint used for engine regression snapshots:
 * `stats` = `[min, max, mean, rms]` in mV; `wave` = 48 evenly spaced samples
 * across the record, so morphology shifts trip the snapshot. All 4 decimals.
 */
export function ecgSignature(ecg: Ecg12): Record<LeadId, { stats: number[]; wave: number[] }> {
  const out = {} as Record<LeadId, { stats: number[]; wave: number[] }>;
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
    const wave: number[] = [];
    for (let i = 0; i < 48; i++) wave.push(r4(s[Math.floor((i * n) / 48)]!));
    out[lead] = {
      stats: [min, max, sum / n, Math.sqrt(sq / n)].map(r4),
      wave,
    };
  }
  return out;
}
