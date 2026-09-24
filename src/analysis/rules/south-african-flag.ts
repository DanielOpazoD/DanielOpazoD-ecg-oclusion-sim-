import { finding, stJmm, type Rule } from './types.js';

/**
 * South African flag sign (§8, [55]): STE in I, aVL and V2 with STD in III —
 * diagonal (high-lateral) OMI pattern.
 */
export const southAfricanFlag: Rule = (ctx) => {
  const i = stJmm(ctx, 'I');
  const avl = stJmm(ctx, 'aVL');
  const v2 = stJmm(ctx, 'V2');
  const iii = stJmm(ctx, 'III');
  const positive = i >= 0.5 && avl >= 0.5 && v2 >= 0.3 && iii <= -0.5;
  return finding(
    'south-african-flag',
    'Signo de la bandera sudafricana',
    positive,
    ['I', 'aVL', 'V2', 'III'],
    { I: i, aVL: avl, V2: v2, III: iii },
    positive
      ? `STE I ${i.toFixed(1)}, aVL ${avl.toFixed(1)}, V2 ${v2.toFixed(1)} mm con STD III ${iii.toFixed(1)} mm (oclusión diagonal).`
      : `Sin patrón diagonal (I ${i.toFixed(1)}, aVL ${avl.toFixed(1)}, V2 ${v2.toFixed(1)}, III ${iii.toFixed(1)} mm).`,
    [55],
  );
};
