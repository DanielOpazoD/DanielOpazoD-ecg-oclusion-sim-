import type { LeadId } from '../../engine/index.js';
import { anyContiguousPair, finding, has, stJmm, type Rule } from './types.js';

/**
 * UDMI4 STEMI criteria (§8, ref [1]): STE at J in 2 contiguous leads with
 * sex/age thresholds for V2–V3; V7–V9 ≥ 0.5 mm; V3R–V4R ≥ 0.5 mm (1.0 if M<30).
 */
export const stemiUdmi4: Rule = (ctx) => {
  const { sex, age } = ctx.patient;
  const thr = (lead: LeadId): number => {
    if (lead === 'V2' || lead === 'V3') {
      if (sex === 'F') return 1.5;
      return age < 40 ? 2.5 : 2.0;
    }
    if (lead === 'V7' || lead === 'V8' || lead === 'V9') return 0.5;
    if (lead === 'V3R' || lead === 'V4R') return sex === 'M' && age < 30 ? 1.0 : 0.5;
    return 1.0;
  };
  const all: LeadId[] = (
    [
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
      'V7',
      'V8',
      'V9',
      'V3R',
      'V4R',
    ] as LeadId[]
  ).filter((l) => has(ctx, l));
  // UDMI4 criteria don't apply in LBBB/paced (use Sgarbossa/BARCELONA);
  // RBBB does not hide anterior STEMI.
  const qrsOk = ctx.conduction !== 'lbbb' && ctx.conduction !== 'paced';
  const elevated = all.filter((l) => qrsOk && stJmm(ctx, l) >= thr(l));
  const hits = anyContiguousPair(ctx, elevated, () => true);
  const positive = hits.length >= 2;
  const maxSt = Math.max(0, ...all.map((l) => stJmm(ctx, l)));
  return finding(
    'stemi-udmi4',
    'Criterios STEMI (4ª UDMI)',
    positive,
    hits,
    { steMaxMm: maxSt, elevatedCount: elevated.length },
    positive
      ? `STE en J ≥ umbral en ${hits.join(', ')} (máx ${maxSt.toFixed(1)} mm), derivaciones contiguas.`
      : `Sin STE ≥ umbral en 2 derivaciones contiguas (máx ${maxSt.toFixed(1)} mm).`,
    [1],
  );
};
