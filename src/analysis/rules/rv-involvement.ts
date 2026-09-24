import { finding, has, stJmm, type Rule } from './types.js';

/**
 * RV involvement (§8, [48,49]): STE V4R ≥ 1 mm, or STE V1 with STE III > II
 * in an inferior MI.
 */
export const rvInvolvement: Rule = (ctx) => {
  const v4r = has(ctx, 'V4R') ? stJmm(ctx, 'V4R') : 0;
  const v1 = stJmm(ctx, 'V1');
  const stII = stJmm(ctx, 'II');
  const stIII = stJmm(ctx, 'III');
  // Requires an inferior-RCA context: STE III ≥ 0.5 mm AND III > II.
  const inferior = stIII >= 0.5 && stIII > stII;
  // Discordant V1/V4R elevation in LBBB/paced is not RV infarction.
  const qrsOk = ctx.conduction !== 'lbbb' && ctx.conduction !== 'paced';
  const positive = qrsOk && inferior && (v4r >= 1 || v1 >= 1);
  return finding(
    'rv-involvement',
    'Afectación del ventrículo derecho',
    positive,
    v4r >= 1 ? ['V4R', 'III'] : ['V1', 'III'],
    { v4r, v1, stII, stIII },
    positive
      ? v4r >= 1
        ? `STE V4R ${v4r.toFixed(1)} mm en contexto de IAM inferior.`
        : `STE V1 ${v1.toFixed(1)} mm con STE III ${stIII.toFixed(1)} > II ${stII.toFixed(1)} mm.`
      : `Sin datos de VD (V4R ${v4r.toFixed(1)} mm, III ${stIII.toFixed(1)} vs II ${stII.toFixed(1)} mm).`,
    [48, 49],
  );
};
