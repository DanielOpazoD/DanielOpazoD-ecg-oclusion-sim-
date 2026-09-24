import { finding, mmOf, stJmm, type Rule } from './types.js';
import type { LeadId } from '../../engine/index.js';

/**
 * Aslanger pattern (§8, [45]): STE III without STE II/aVF, STD in ≥1 of
 * V4–V6 with positive terminal T, and ST(V1) > ST(V2).
 */
export const aslanger: Rule = (ctx) => {
  const stIII = stJmm(ctx, 'III');
  const stII = stJmm(ctx, 'II');
  const stAVF = stJmm(ctx, 'aVF');
  const stV1 = stJmm(ctx, 'V1');
  const stV2 = stJmm(ctx, 'V2');
  const stdLateral = (['V4', 'V5', 'V6'] as const).filter(
    (l) => stJmm(ctx, l) <= -0.5 && mmOf(ctx, l, 'tTerminal') > 0,
  );
  const positive =
    stIII >= 0.3 && stIII > stII && stIII > stAVF && stdLateral.length >= 1 && stV1 > stV2;
  return finding(
    'aslanger',
    'Patrón de Aslanger',
    positive,
    ['III', ...stdLateral] as LeadId[],
    { stIII, stII, stAVF, stV1, stV2 },
    positive
      ? `STE III ${stIII.toFixed(1)} mm sin STE II/aVF, STD ${stdLateral.join(', ')} y ST V1 ${stV1.toFixed(1)} > V2 ${stV2.toFixed(1)} mm.`
      : `No cumple patrón Aslanger (III ${stIII.toFixed(1)} mm, STD lat ${stdLateral.length}).`,
    [45],
  );
};
