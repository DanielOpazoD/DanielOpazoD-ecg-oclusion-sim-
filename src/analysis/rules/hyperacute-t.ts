import type { LeadId } from '../../engine/index.js';
import { contiguous, finding, has, type Rule } from './types.js';

const SET: LeadId[] = ['I', 'II', 'III', 'aVF', 'aVL', 'V2', 'V3', 'V4', 'V5', 'V6'];

/**
 * Hyperacute T score (§8, [27]): per lead s = 0.6·min(Tarea/QRSarea/0.9, 1)
 * + 0.4·tSym (only where T is upright and QRS positive); positive when the
 * mean of the best contiguous pair ≥ 0.7.
 */
export const hyperacuteT: Rule = (ctx) => {
  const scoreOf = (l: LeadId): number => {
    const m = ctx.measurements.perLead[l];
    if (m.tAmp <= 0.05 || m.rAmp <= 0) return 0;
    // Gates (§8 [27]): hyperacute T is tall (≥5 mm), WIDE (≥90 ms at half
    // amplitude — narrow tall T of hyperkalemia is excluded) and roughly
    // doubles the baseline T/QRS area ratio (baseline ≈ 2–3 → gate ≥ 4.5).
    if (m.tAmp < 0.5 || m.tWidth50Ms < 90 || m.tQrsAreaRatio < 4.0) return 0;
    return 0.75 * Math.min(m.tQrsAreaRatio / 1.5, 1) + 0.25 * m.tSym;
  };
  const scores = Object.fromEntries(SET.map((l) => [l, scoreOf(l)])) as Record<string, number>;
  // §8: positive when the MEAN of the best contiguous pair ≥ 0.7.
  let bestMean = 0;
  let pair: LeadId[] = [];
  for (const a of SET) {
    for (const b of SET) {
      if (a >= b || !contiguous(a, b) || !has(ctx, a) || !has(ctx, b)) continue;
      const mean = (scores[a]! + scores[b]!) / 2;
      if (mean > bestMean) {
        bestMean = mean;
        pair = [a, b];
      }
    }
  }
  const best = [...SET].sort((a, b) => scores[b]! - scores[a]!).slice(0, 2);
  const positive = bestMean >= 0.7;
  return finding(
    'hyperacute-t',
    'Ondas T hiperagudas',
    positive,
    pair,
    scores,
    positive
      ? `Score T/QRS-área+simetría medio ${bestMean.toFixed(2)} ≥ 0.7 en contiguas ${pair.join(', ')}.`
      : `Mejor score ${scores[best[0]!]!.toFixed(2)} (${best[0]}) < 0.7 en contiguas.`,
    [26, 27],
  );
};
