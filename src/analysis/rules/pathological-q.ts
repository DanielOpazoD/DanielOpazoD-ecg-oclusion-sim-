import type { LeadId } from '../../engine/index.js';
import { anyContiguousPair, finding, type Rule } from './types.js';

const SET: LeadId[] = [
  'I',
  'II',
  'III',
  'aVF',
  'aVL',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
  'V7',
  'V8',
  'V9',
];

/**
 * Pathological Q waves (§8, [1]): Q ≥ 40 ms or ≥ 25 % of R in 2 contiguous.
 */
export const pathologicalQ: Rule = (ctx) => {
  // QS in V1–V3 is expected morphology in LBBB/paced — skip.
  const qrsOk = ctx.conduction !== 'lbbb' && ctx.conduction !== 'paced';
  const hits = anyContiguousPair(ctx, SET, (l) => {
    const m = ctx.measurements.perLead[l];
    if (!qrsOk) return false;
    // QS complex (R lost to necrosis): counts as pathological Q.
    if (m.rAmp < 0.15) return m.qAmp >= 0.15 && m.qDurMs >= 40;
    // Small physiologic septal dips are not pathological: require a
    // meaningful R (≥3 mm) and q ≥ 0.8 mm before applying the spec criteria.
    if (m.rAmp < 0.3 || m.qAmp < 0.08) return false;
    return m.qDurMs >= 40 || m.qAmp / m.rAmp >= 0.25;
  });
  const positive = hits.length >= 2;
  return finding(
    'pathological-q',
    'Ondas Q patológicas',
    positive,
    hits,
    { count: hits.length },
    positive
      ? `Q patológica (≥40 ms o ≥25 % R) en contiguas: ${hits.join(', ')}.`
      : 'Sin ondas Q patológicas en derivaciones contiguas.',
    [1],
  );
};
