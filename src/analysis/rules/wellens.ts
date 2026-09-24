import { finding, mmOf, stJmm, type Rule } from './types.js';

/**
 * Wellens pattern (§8, [38,39]): biphasic (A) or deep symmetric inverted (B)
 * T waves in V2–V4 without STE, narrow QRS.
 */
export const wellens: Rule = (ctx) => {
  const set = ['V2', 'V3', 'V4'] as const;
  const biphasic = set.filter((l) => ctx.measurements.perLead[l].tBiphasic > 0.05);
  const deepNeg = set.filter(
    (l) => mmOf(ctx, l, 'tAmp') <= -3 && ctx.measurements.perLead[l].tSym >= 0.5,
  );
  const noSte = set.every((l) => stJmm(ctx, l) < 0.5);
  const positive =
    !ctx.measurements.qrsWide && noSte && (biphasic.length >= 2 || deepNeg.length >= 2);
  const pattern = deepNeg.length >= 2 ? 'B (profunda simétrica)' : 'A (bifásica)';
  return finding(
    'wellens',
    'Patrón de Wellens',
    positive,
    [...new Set([...biphasic, ...deepNeg])],
    { biphasicCount: biphasic.length, deepCount: deepNeg.length },
    positive
      ? `T ${pattern} en ${[...new Set([...biphasic, ...deepNeg])].join(', ')} sin STE — lesión crítica de DA.`
      : `Sin T bifásica/profunda en V2–V4 (bifásicas ${biphasic.length}, profundas ${deepNeg.length}).`,
    [38, 39],
  );
};
