import { finding, mmOf, stJmm, type Rule } from './types.js';

/**
 * Posterior MI mirror pattern (§8, [46,47]): max STD in V1–V4 ≥ 0.5 mm with
 * upright terminal T and no anterior STE.
 */
export const posteriorStd: Rule = (ctx) => {
  const set = ['V1', 'V2', 'V3', 'V4'] as const;
  const st = set.map((l) => stJmm(ctx, l));
  const minSt = Math.min(...st);
  const leads = set.filter((l) => stJmm(ctx, l) <= -0.5);
  const terminalUp = leads.some((l) => mmOf(ctx, l, 'tTerminal') > 0);
  const anteriorSte = set.some((l) => stJmm(ctx, l) >= 0.5);
  // Diffuse subendocardial STD also depresses V1–V4: exclude when ≥2 leads
  // outside the precordial mirror (inferior/lateral) are depressed ≥ 1 mm.
  const nonMirror = (['II', 'III', 'aVF', 'V5', 'V6', 'I', 'aVL'] as const).filter(
    (l) => stJmm(ctx, l) <= -0.5,
  );
  const positive = minSt <= -0.5 && terminalUp && !anteriorSte && nonMirror.length < 2;
  return finding(
    'posterior-std',
    'Oclusión posterior (STD V1–V4 espejo)',
    positive,
    [...leads],
    { stdMaxMm: -minSt },
    positive
      ? `STD máx ${(-minSt).toFixed(1)} mm en ${leads.join(', ')} con T terminal positiva y sin STE anterior.`
      : `Sin patrón espejo posterior (STD máx ${(-minSt).toFixed(1)} mm).`,
    [46, 47],
  );
};
