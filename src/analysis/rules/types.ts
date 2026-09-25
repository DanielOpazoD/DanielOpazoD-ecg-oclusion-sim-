import type { LeadId, ConductionSpec } from '../../engine/index.js';
import type { Measurements } from '../measure.js';
import type { Delineation } from '../delineate/delineate.js';
import { mm } from '../measure.js';

/**
 * Rule engine types and contiguity helpers (MODEL.md §8).
 */

/** A rule result (§8). `label`/`rationale` are user-facing Spanish. */
export interface Finding {
  id: string;
  label: string;
  positive: boolean;
  score?: number;
  leads: LeadId[];
  values: Record<string, number>;
  rationale: string;
  refs: number[];
}

/** Context handed to every rule (§8). */
export interface RuleContext {
  measurements: Measurements;
  delineation: Delineation;
  patient: { sex: 'M' | 'F'; age: number };
  /** Leads actually acquired (V7–V9/V3R–V4R optional). */
  leadsAvailable: readonly LeadId[];
  /** Conduction variant (for Sgarbossa family). */
  conduction: ConductionSpec;
  /** QRS context derived from the schedule (paced/ventricular beats) and the
   *  declared conduction. Wide-complex contexts disable plain ST/OMI rules —
   *  only Sgarbossa-family criteria apply. */
  qrsContext: 'narrow' | 'rbbb' | 'lbbb' | 'paced' | 'ventricular';
}

export type Rule = (ctx: RuleContext) => Finding;

/** ST at J in mm for a lead. */
export function stJmm(ctx: RuleContext, lead: LeadId): number {
  return mm(ctx.measurements.perLead[lead].stJ);
}
/** ST at J+60 in mm. */
export function st60mm(ctx: RuleContext, lead: LeadId): number {
  return mm(ctx.measurements.perLead[lead].st60);
}
/** Any metric in mm. */
export function mmOf(
  ctx: RuleContext,
  lead: LeadId,
  key: 'stJ' | 'st60' | 'st80' | 'tAmp' | 'tTerminal' | 'rAmp' | 'sAmp' | 'qAmp' | 'uAmp',
): number {
  return mm(ctx.measurements.perLead[lead][key]);
}
export function has(ctx: RuleContext, lead: LeadId): boolean {
  return ctx.leadsAvailable.includes(lead);
}

/** Precordial contiguity sequence (V7–V9 extend it laterally). */
const PRECORDIAL: LeadId[] = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9'];
/** Anatomically contiguous lead groups (§8). */
const GROUPS: LeadId[][] = [
  ['II', 'III', 'aVF'],
  ['I', 'aVL'],
  ['I', 'aVL', 'V5', 'V6'],
  ['V3R', 'V4R', 'V1'],
];

/** Two leads are contiguous (same anatomical group or adjacent precordials). */
export function contiguous(a: LeadId, b: LeadId): boolean {
  const ia = PRECORDIAL.indexOf(a);
  const ib = PRECORDIAL.indexOf(b);
  if (ia >= 0 && ib >= 0) return Math.abs(ia - ib) === 1;
  for (const g of GROUPS) {
    if (g.includes(a) && g.includes(b)) return true;
  }
  // V5–V6 ↔ limb lateral leads are contiguous via the lateral group above.
  return false;
}

/** True if ≥2 leads in `set` satisfying `pred` include a contiguous pair. */
export function anyContiguousPair(
  ctx: RuleContext,
  set: readonly LeadId[],
  pred: (l: LeadId) => boolean,
): LeadId[] {
  const ok = set.filter((l) => has(ctx, l) && pred(l));
  for (const a of ok) {
    for (const b of ok) {
      if (a !== b && contiguous(a, b)) return ok;
    }
  }
  return [];
}

export function finding(
  id: string,
  label: string,
  positive: boolean,
  leads: LeadId[],
  values: Record<string, number>,
  rationale: string,
  refs: number[],
  score?: number,
): Finding {
  return {
    id,
    label,
    positive,
    leads,
    values,
    rationale,
    refs,
    ...(score !== undefined ? { score } : {}),
  };
}
