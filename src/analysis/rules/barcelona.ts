import { finding, stJmm, type Rule } from './types.js';

/**
 * BARCELONA algorithm (§8, [63]): in LBBB/paced, any STE concordant ≥ 1 mm,
 * or any ST deviation (STE or STD) ≥ 1 mm in a lead with |QRS| ≤ 6 mm.
 */
export const barcelona: Rule = (ctx) => {
  const applicable = ctx.qrsContext === 'lbbb' || ctx.qrsContext === 'paced';
  const m = ctx.measurements.perLead;
  const leads = [
    'I',
    'II',
    'III',
    'aVR',
    'aVL',
    'aVF',
    'V1',
    'V2',
    'V3',
    'V4',
    'V5',
    'V6',
  ] as const;
  const concordant = leads.filter((l) => stJmm(ctx, l) >= 1 && m[l].rAmp > m[l].sAmp);
  const lowQrs = leads.filter((l) => Math.abs(stJmm(ctx, l)) >= 1 && m[l].rAmp + m[l].sAmp <= 0.6);
  const positive = applicable && (concordant.length > 0 || lowQrs.length > 0);
  return finding(
    'barcelona',
    'Algoritmo BARCELONA',
    positive,
    [...concordant, ...lowQrs],
    { concordant: concordant.length, lowQrsDeviation: lowQrs.length },
    applicable
      ? `STE concordante ${concordant.length}, desviación ≥1 mm con |QRS|≤6 mm ${lowQrs.length} derivaciones.`
      : 'No aplicable: requiere BRI o marcapasos.',
    [63],
  );
};
