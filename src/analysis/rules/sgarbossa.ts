import { finding, stJmm, type Rule } from './types.js';

/**
 * Sgarbossa criteria (§8, [61]): only applicable in LBBB/paced.
 * +5 concordant STE ≥ 1 mm; +3 STD ≥ 1 mm in V1–V3; +2 discordant STE ≥ 5 mm.
 * Positive (original) at score ≥ 3.
 */
export const sgarbossa: Rule = (ctx) => {
  const applicable = ctx.conduction === 'lbbb' || ctx.conduction === 'paced';
  const m = ctx.measurements.perLead;
  const concordant = (['I', 'aVL', 'V5', 'V6', 'II', 'III', 'aVF'] as const).filter(
    (l) => stJmm(ctx, l) >= 1 && m[l].rAmp > m[l].sAmp, // STE where QRS positive
  );
  const stdV1V3 = (['V1', 'V2', 'V3'] as const).filter((l) => stJmm(ctx, l) <= -1);
  const discordant = (['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const).filter(
    (l) => stJmm(ctx, l) >= 5 && m[l].sAmp > m[l].rAmp,
  );
  const score =
    (concordant.length > 0 ? 5 : 0) +
    (stdV1V3.length > 0 ? 3 : 0) +
    (discordant.length > 0 ? 2 : 0);
  const positive = applicable && score >= 3;
  return finding(
    'sgarbossa',
    'Sgarbossa (original)',
    positive,
    [...concordant, ...stdV1V3, ...discordant],
    { concordant: concordant.length, stdV1V3: stdV1V3.length, discordant: discordant.length },
    applicable
      ? `Score ${score}: STE concordante ${concordant.length ? 'sí (5)' : 'no'}, STD V1–V3 ${stdV1V3.length ? 'sí (3)' : 'no'}, discordante ≥5 mm ${discordant.length ? 'sí (2)' : 'no'}.`
      : 'No aplicable: requiere BRI o marcapasos.',
    [61],
    score,
  );
};
