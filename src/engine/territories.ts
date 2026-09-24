import type { Vec3 } from './math/vec3.js';
import { normalize } from './math/vec3.js';
import type { LeadId } from './leads.js';

/**
 * Myocardial territories and culprit arteries (MODEL.md §4).
 * `direction` is the transmural injury vector (unit, toward the affected
 * epicardium); directions may be refined by calibration tests (§9).
 */
export interface Territory {
  /** Territory identifier. */
  id: string;
  /** Unit injury direction in Frank space (§3.1, §4). */
  direction: Vec3;
  /** Leads that "look at" this wall (§4). */
  looksAt: readonly LeadId[];
  /** Typical culprit vessel(s) (§4). */
  artery: string;
  /** Injury profile (§3.1). */
  profile: 'transmural' | 'subendocardial';
}

/** Territory table (§4). */
export const TERRITORIES: readonly Territory[] = [
  {
    id: 'anteroseptal',
    direction: normalize([-0.1, -0.15, -0.95]),
    looksAt: ['V1', 'V2', 'V3', 'V4', 'aVR'],
    artery: 'DA proximal (pre-S1)',
    profile: 'transmural',
  },
  {
    id: 'anterior',
    direction: normalize([0.3, 0.2, -0.9]),
    looksAt: ['V2', 'V3', 'V4', 'V5'],
    artery: 'DA media',
    profile: 'transmural',
  },
  {
    id: 'anteroapical',
    direction: normalize([0.55, 0.45, -0.65]),
    looksAt: ['V3', 'V4', 'V5', 'V6', 'II'],
    artery: 'DA distal',
    profile: 'transmural',
  },
  {
    id: 'high-lateral',
    direction: normalize([0.8, -0.5, -0.25]),
    looksAt: ['I', 'aVL', 'V2'],
    artery: 'D1 / OM alta',
    profile: 'transmural',
  },
  {
    id: 'lateral',
    direction: normalize([0.9, 0.2, 0.3]),
    looksAt: ['I', 'aVL', 'V5', 'V6'],
    artery: 'CX / OM',
    profile: 'transmural',
  },
  {
    id: 'inferior-rca',
    direction: normalize([-0.15, 0.92, 0.35]),
    looksAt: ['II', 'III', 'aVF'],
    artery: 'CD',
    profile: 'transmural',
  },
  {
    id: 'inferior-lcx',
    direction: normalize([0.45, 0.8, 0.4]),
    looksAt: ['II', 'aVF', 'V5', 'V6'],
    artery: 'CX',
    profile: 'transmural',
  },
  {
    id: 'posterior',
    direction: normalize([0.3, 0.2, 0.93]),
    looksAt: ['V7', 'V8', 'V9'],
    artery: 'CX / CD-DP',
    profile: 'transmural',
  },
  {
    id: 'rv',
    direction: normalize([-0.7, 0.4, -0.55]),
    looksAt: ['V1', 'V3R', 'V4R', 'III'],
    artery: 'CD proximal',
    profile: 'transmural',
  },
  {
    id: 'subendocardial',
    direction: normalize([-0.6, -0.55, 0.45]),
    looksAt: ['aVR'],
    artery: 'demanda / TCI / 3 vasos',
    profile: 'subendocardial',
  },
];

/** Look up a territory by `id` (§4). */
export function territoryById(id: string): Territory {
  const t = TERRITORIES.find((x) => x.id === id);
  if (!t) throw new Error(`unknown territory: ${id}`);
  return t;
}
