import { finding, stJmm, type Rule } from './types.js';

/**
 * Reciprocal aVL depression in inferior MI (§8, [70]): any inferior STE
 * (II/III/aVF ≥ 0.5 mm) with STD aVL ≥ 0.5 mm.
 */
export const reciprocalAvl: Rule = (ctx) => {
  const inf = Math.max(stJmm(ctx, 'II'), stJmm(ctx, 'III'), stJmm(ctx, 'aVF'));
  const avl = stJmm(ctx, 'aVL');
  const positive = inf >= 0.3 && avl <= -0.3;
  return finding(
    'reciprocal-avl',
    'Depresión recíproca en aVL',
    positive,
    ['III', 'aVL'],
    { infSteMm: inf, avlStdMm: avl },
    positive
      ? `STE inferior ${inf.toFixed(1)} mm con STD aVL ${avl.toFixed(1)} mm — recíproca de IAM inferior.`
      : `Sin STE inferior con recíproca en aVL (inf ${inf.toFixed(1)}, aVL ${avl.toFixed(1)} mm).`,
    [70],
  );
};
