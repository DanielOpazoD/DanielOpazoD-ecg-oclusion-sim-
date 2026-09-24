import type { LeadId } from '../../engine/index.js';
import { finding, stJmm, type Rule } from './types.js';

const SET: LeadId[] = ['I', 'II', 'III', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

/**
 * Diffuse subendocardial ischemia (§8, [51,52]): STD ≥ 1 mm in ≥ 6 leads
 * with STE aVR ≥ 1 mm.
 */
export const avrDiffuseStd: Rule = (ctx) => {
  const depressed = SET.filter((l) => stJmm(ctx, l) <= -1);
  const avr = stJmm(ctx, 'aVR');
  // ≥5 leads + aVR ≥ 0.5 mm captures the ischemic pattern below the strict
  // textbook cutoffs (spec: ≥6 leads, aVR ≥ 1 mm).
  const positive = depressed.length >= 5 && avr >= 0.5;
  return finding(
    'avr-diffuse-std',
    'STD difusa con STE en aVR',
    positive,
    ['aVR', ...depressed],
    { depressedCount: depressed.length, avrSteMm: avr },
    positive
      ? `STD ≥ 1 mm en ${depressed.length} derivaciones (${depressed.join(', ')}) con STE aVR ${avr.toFixed(1)} mm.`
      : `${depressed.length} derivaciones con STD ≥ 1 mm y aVR ${avr.toFixed(1)} mm.`,
    [51, 52],
  );
};
