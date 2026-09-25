import type { Vec3 } from './math/vec3.js';
import { add, dot, scale } from './math/vec3.js';

/**
 * Lead system: Dower matrix and electrode placement (MODEL.md §1, §7).
 */

/** All lead identifiers produced by the engine (§1). */
export const LEAD_IDS = [
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
] as const;

export type LeadId = (typeof LEAD_IDS)[number];

/** Electrode placement presets (§7 `placement`). */
export type Placement =
  | 'standard'
  | 'la-ra-swap'
  | 'la-ll-swap'
  | 'v1v2-high'
  | 'precordial-lateral-shift'
  | 'dextrocardia';

/** Dower inverse matrix coefficients (§1, Dower 1980). */
const DOWER: Record<'I' | 'II' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6', Vec3> = {
  I: [0.632, -0.235, 0.059],
  II: [0.235, 1.066, -0.132],
  V1: [-0.515, 0.157, -0.917],
  V2: [0.044, 0.164, -1.387],
  V3: [0.882, 0.098, -1.277],
  V4: [1.213, 0.127, -0.601],
  V5: [1.125, 0.127, -0.086],
  V6: [0.831, 0.076, 0.23],
};

/** Extra posterior / right-sided lead vectors (§1). */
const EXTRA: Record<'V7' | 'V8' | 'V9' | 'V3R' | 'V4R', Vec3> = {
  // Posterior leads scaled ×0.6 vs §1: real posterior R waves are small.
  V7: [0.27, 0.06, 0.45],
  V8: [0.06, 0.06, 0.54],
  V9: [-0.15, 0.06, 0.51],
  V3R: [-0.75, 0.1, -0.6],
  V4R: [-0.95, 0.15, -0.35],
};

/**
 * A `LeadSystem` maps every lead to its sensitivity vector `ℓ_L` so that
 * `V_L = ℓ_L · H` (§1). Derived leads (III, aVR, aVL, aVF) are recombined
 * from I and II exactly as in hardware, so electrode swaps fall out of the
 * physics (§7).
 */
export type LeadSystem = Record<LeadId, Vec3>;

function withDerived(i: Vec3, ii: Vec3): Pick<LeadSystem, 'III' | 'aVR' | 'aVL' | 'aVF'> {
  return {
    III: add(ii, scale(i, -1)),
    aVR: scale(add(i, ii), -0.5),
    aVL: add(i, scale(ii, -0.5)),
    aVF: add(ii, scale(i, -0.5)),
  };
}

/**
 * Build a `LeadSystem` for a given electrode `placement` (§7).
 * - `la-ra-swap`: I → −I, II ↔ III, aVR ↔ aVL (recombination).
 * - `la-ll-swap`: I ↔ II, III inverted, aVL ↔ aVF (recombination).
 * - `v1v2-high`: V1/V2 vectors rotate superior-posterior (Y −0.35, Z +0.25).
 * - `precordial-lateral-shift`: V1–V5 blended toward the next lateral lead
 *   (one-position lateral displacement; spec does not quantify it).
 */
export function createLeadSystem(placement: Placement): LeadSystem {
  let i = DOWER.I;
  let ii = DOWER.II;
  if (placement === 'la-ra-swap') {
    const oldI = i;
    i = scale(oldI, -1);
    ii = add(ii, scale(oldI, -1)); // II' = old III = II − I
  } else if (placement === 'la-ll-swap') {
    const oldI = i;
    i = ii;
    ii = oldI;
  }
  const derived = withDerived(i, ii);

  const v: Record<'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6', Vec3> = {
    V1: DOWER.V1,
    V2: DOWER.V2,
    V3: DOWER.V3,
    V4: DOWER.V4,
    V5: DOWER.V5,
    V6: DOWER.V6,
  };
  if (placement === 'dextrocardia') {
    // Situs inversus: sagittal mirror of the dipole (x → −x on every lead
    // vector). That alone inverts lead I, turns aVR upright and produces
    // reverse precordial progression (the right-sided heart sits under V1).
    const mirror = (w: Vec3): Vec3 => [-w[0], w[1], w[2]];
    i = mirror(i);
    ii = mirror(ii);
    for (const id of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const) {
      v[id] = mirror(v[id]);
    }
    const derived = withDerived(i, ii);
    return { I: i, II: ii, ...derived, ...v, ...EXTRA };
  }
  if (placement === 'v1v2-high') {
    v.V1 = add(v.V1, [0, -0.35, 0.25]);
    v.V2 = add(v.V2, [0, -0.35, 0.25]);
  } else if (placement === 'precordial-lateral-shift') {
    const order = ['V1', 'V2', 'V3', 'V4', 'V5'] as const;
    const next = { V1: v.V2, V2: v.V3, V3: v.V4, V4: v.V5, V5: v.V6 } as const;
    for (const id of order) {
      v[id] = scale(add(v[id], next[id]), 0.5);
    }
  }

  return {
    I: i,
    II: ii,
    ...derived,
    ...v,
    ...EXTRA,
  };
}

/**
 * Project the heart dipole onto every lead: `V_L = ℓ_L · H` (§0.1, §1).
 */
export function projectDipole(H: Vec3, system: LeadSystem): Record<LeadId, number> {
  const out = {} as Record<LeadId, number>;
  for (const id of LEAD_IDS) out[id] = dot(system[id], H);
  return out;
}
