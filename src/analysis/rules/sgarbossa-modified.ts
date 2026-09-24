import { finding, stJmm, mmOf, type Rule } from './types.js';

/**
 * Modified Sgarbossa (§8, [62]): original criteria plus ST/S ratio ≤ −0.25
 * (3 pts). Positive at score ≥ 3. Only in LBBB/paced.
 */
export const sgarbossaModified: Rule = (ctx) => {
  const applicable = ctx.conduction === 'lbbb' || ctx.conduction === 'paced';
  const m = ctx.measurements.perLead;
  const concordant = (['I', 'aVL', 'V5', 'V6', 'II', 'III', 'aVF'] as const).filter(
    (l) => stJmm(ctx, l) >= 1 && m[l].rAmp > m[l].sAmp,
  );
  const stdV1V3 = (['V1', 'V2', 'V3'] as const).filter((l) => stJmm(ctx, l) <= -1);
  const discordant5 = (['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const).filter(
    (l) => stJmm(ctx, l) >= 5 && m[l].sAmp > m[l].rAmp,
  );
  // Modified criterion: discordant STE ≥ 25 % of the S depth (J/S ≤ −0.25
  // convention reads ST/S in predominantly negative leads).
  const propDiscordant = (['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const).filter((l) => {
    const s = mmOf(ctx, l, 'sAmp');
    return s >= 1 && stJmm(ctx, l) / s >= 0.25;
  });
  const score =
    (concordant.length > 0 ? 5 : 0) +
    (stdV1V3.length > 0 ? 3 : 0) +
    (discordant5.length > 0 ? 2 : 0) +
    (propDiscordant.length > 0 ? 3 : 0);
  const positive = applicable && score >= 3;
  return finding(
    'sgarbossa-modified',
    'Sgarbossa modificado',
    positive,
    [...concordant, ...stdV1V3, ...discordant5, ...propDiscordant],
    { score, propDiscordant: propDiscordant.length },
    applicable
      ? `Score ${score} (incluye razón ST/S ≤ −0.25 en ${propDiscordant.length} derivaciones).`
      : 'No aplicable: requiere BRI o marcapasos.',
    [62],
    score,
  );
};
