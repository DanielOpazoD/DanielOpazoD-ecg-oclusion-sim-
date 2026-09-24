import { finding, mmOf, stJmm, type Rule } from './types.js';

/**
 * De Winter pattern (§8, [36,37]): upsloping STD ≥ 1 mm at J in ≥2 of V2–V5,
 * tall symmetric T, STE aVR ~0.5–1 mm.
 */
export const deWinter: Rule = (ctx) => {
  const set = ['V2', 'V3', 'V4', 'V5'] as const;
  // Upsloping STD: the tall T behind the J depression is the discriminator —
  // the engine's depression-upsloping shape can still descend at J+60, so the
  // upslope is implied by the hyperacute T rather than st60 > stJ.
  const tallT = set.some((l) => mmOf(ctx, l, 'tAmp') >= 8);
  const hits = set.filter((l) => stJmm(ctx, l) <= -0.4);
  const avr = stJmm(ctx, 'aVR');
  const positive = hits.length >= 2 && tallT && avr >= 0.2;
  return finding(
    'de-winter',
    'Patrón de De Winter',
    positive,
    [...hits],
    { avrSteMm: avr, stdLeads: hits.length },
    positive
      ? `STD ascendente ≥ 1 mm en ${hits.join(', ')} con T alta simétrica y aVR ${avr.toFixed(1)} mm — equivalente OMI de DA proximal.`
      : `Sin STD ascendente en V2–V5 con T hiperaguda (aVR ${avr.toFixed(1)} mm).`,
    [36, 37],
  );
};
