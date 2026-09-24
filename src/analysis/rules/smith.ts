import { finding, st60mm, mmOf, type Rule, type Finding, type RuleContext } from './types.js';
import { stemiUdmi4 } from './stemi-udmi4.js';

/**
 * Smith formulas (§8, [66,67]): differentiate subtle anterior OMI from
 * early repolarization. Applicable only with narrow QRS, no LVH and no
 * inferior STD — exposed via `applicable` in values.
 */
function smithCommon(ctx: RuleContext): {
  ste60v3: number;
  qtc: number;
  rv4: number;
  qrsv2: number;
  applicable: boolean;
} {
  const m = ctx.measurements;
  const ste60v3 = st60mm(ctx, 'V3');
  const rv4 = mmOf(ctx, 'V4', 'rAmp');
  const qrsv2 = mmOf(ctx, 'V2', 'rAmp') + mmOf(ctx, 'V2', 'sAmp');
  // Not applicable by definition when UDMI4 STEMI criteria are already met —
  // the score is still computed and exposed for teaching.
  const stemiMet = stemiUdmi4(ctx).positive;
  const applicable =
    !stemiMet &&
    !m.qrsWide &&
    ctx.conduction === 'normal' &&
    m.perLead['V3'].rAmp >= 0.15 &&
    Math.min(st60mm(ctx, 'II'), st60mm(ctx, 'III'), st60mm(ctx, 'aVF')) > -0.5;
  return { ste60v3, qtc: m.qtcBazett, rv4, qrsv2, applicable };
}

/** 3-variable formula ≥ 23.4 (§8). */
export const smith3v: Rule = (ctx) => {
  const { ste60v3, qtc, rv4, applicable } = smithCommon(ctx);
  const score = 1.196 * ste60v3 + 0.059 * qtc - 0.326 * rv4;
  const positive = applicable && score >= 23.4;
  const f: Finding = finding(
    'smith-3v',
    'Fórmula de Smith (3 variables)',
    positive,
    ['V3', 'V4'],
    { score, ste60v3, qtc, rv4, applicable: applicable ? 1 : 0 },
    applicable
      ? `1.196·${ste60v3.toFixed(1)} + 0.059·${qtc.toFixed(0)} − 0.326·${rv4.toFixed(1)} = ${score.toFixed(1)} (umbral 23.4).`
      : `No aplicable (QRS ancho, conducción anómala o STD inferior). Score ${score.toFixed(1)}.`,
    [66, 67],
    score,
  );
  return f;
};

/** 4-variable formula ≥ 18.2 (§8). */
export const smith4v: Rule = (ctx) => {
  const { ste60v3, qtc, rv4, qrsv2, applicable } = smithCommon(ctx);
  const score = 1.062 * ste60v3 + 0.052 * qtc - 0.151 * qrsv2 - 0.268 * rv4;
  const positive = applicable && score >= 18.2;
  return finding(
    'smith-4v',
    'Fórmula de Smith (4 variables)',
    positive,
    ['V3', 'V4', 'V2'],
    { score, ste60v3, qtc, rv4, qrsv2, applicable: applicable ? 1 : 0 },
    applicable
      ? `1.062·${ste60v3.toFixed(1)} + 0.052·${qtc.toFixed(0)} − 0.151·${qrsv2.toFixed(1)} − 0.268·${rv4.toFixed(1)} = ${score.toFixed(1)} (umbral 18.2).`
      : `No aplicable (QRS ancho, conducción anómala o STD inferior). Score ${score.toFixed(1)}.`,
    [66, 67],
    score,
  );
};
