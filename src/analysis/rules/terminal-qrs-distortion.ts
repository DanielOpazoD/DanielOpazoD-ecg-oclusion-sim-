import { finding, stJmm, type Rule } from './types.js';

/**
 * Terminal QRS distortion (§8, [68]): J/R ≥ 0.5 in a qR lead, or loss of the
 * S wave (RS → single R) in V2–V3.
 */
export const terminalQrsDistortion: Rule = (ctx) => {
  // J/R is meaningless in wide-QRS discordance (LBBB/paced).
  const qrsOk = ctx.conduction !== 'lbbb' && ctx.conduction !== 'paced';
  const hits: string[] = [];
  const vals: Record<string, number> = {};
  for (const l of ['V2', 'V3'] as const) {
    const m = ctx.measurements.perLead[l];
    const jr = m.jToR;
    vals[`jToR_${l}`] = jr;
    // J/R ≥ 0.5 (qR) or loss of S in RS: J-point height ≥ half the R/S
    // complex. QS leads (rAmp < 0.2 mV) are excluded — J/R is undefined there.
    if (qrsOk && jr >= 0.5 && stJmm(ctx, l) >= 0.3 && m.rAmp > 0.2) hits.push(l);
  }
  const positive = hits.length > 0;
  return finding(
    'terminal-qrs-distortion',
    'Distorsión terminal del QRS',
    positive,
    hits as ('V2' | 'V3')[],
    vals,
    positive
      ? `J/R ≥ 0.5 o pérdida de S en ${hits.join(', ')} (J/R V2 ${vals.jToR_V2?.toFixed(2)}, V3 ${vals.jToR_V3?.toFixed(2)}).`
      : `Sin distorsión terminal (J/R V2 ${vals.jToR_V2?.toFixed(2)}, V3 ${vals.jToR_V3?.toFixed(2)}).`,
    [68],
  );
};
