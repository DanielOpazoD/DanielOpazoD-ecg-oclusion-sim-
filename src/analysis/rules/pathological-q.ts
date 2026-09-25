import type { LeadId } from '../../engine/index.js';
import { finding, type Rule } from './types.js';

/**
 * Pathological Q waves (§8, [1]): Q ≥ 30 ms and ≥ 1 mm, or Q/R ≥ 0.25, in
 * ≥ 2 contiguous leads of the SAME territory. aVR is excluded; an isolated
 * Q in III or aVL alone is never positive.
 */
const TERRITORIES: { name: string; leads: LeadId[] }[] = [
  { name: 'inferior', leads: ['II', 'III', 'aVF'] },
  { name: 'lateral', leads: ['I', 'aVL', 'V5', 'V6'] },
  { name: 'anterior', leads: ['V1', 'V2', 'V3', 'V4'] },
];

export const pathologicalQ: Rule = (ctx) => {
  // QS in V1–V3 is expected morphology in LBBB/paced — skip.
  const qrsOk = ctx.conduction !== 'lbbb' && ctx.conduction !== 'paced';
  const hasQ = (l: LeadId) => {
    const m = ctx.measurements.perLead[l];
    if (!qrsOk || !m) return false;
    // QS complex (R lost to necrosis): counts as pathological Q.
    if (m.rAmp < 0.15) return m.qAmp >= 0.15 && m.qDurMs >= 40;
    if (m.qAmp < 0.1 || m.qDurMs < 30) return false;
    return m.qAmp >= 0.1 || m.qAmp / Math.max(m.rAmp, 0.01) >= 0.25;
  };
  const hits: LeadId[] = [];
  const territories: string[] = [];
  for (const t of TERRITORIES) {
    const n = t.leads.filter(hasQ);
    if (n.length >= 2) {
      hits.push(...n);
      territories.push(t.name);
    }
  }
  const positive = hits.length >= 2;
  return finding(
    'pathological-q',
    'Ondas Q patológicas',
    positive,
    hits,
    { count: hits.length },
    positive
      ? `Q patológica en territorio ${territories.join('+')}: ${hits.join(', ')}.`
      : 'Sin ondas Q patológicas (≥30 ms y ≥1 mm, o ≥25 % R) en 2+ derivaciones del mismo territorio.',
    [1],
  );
};
