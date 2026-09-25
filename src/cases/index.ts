import type { CaseDefinition } from './types.js';
import { GROUP_A } from './groupA.js';
import { GROUP_B } from './groupB.js';
import { GROUP_C } from './groupC.js';
import { GROUP_D } from './groupD.js';
import { GROUP_E } from './groupE.js';
import { GROUP_F } from './groupF.js';
import { GROUP_G } from './groupG.js';
import { GROUP_H } from './groupH.js';
import { GROUP_I } from './groupI.js';
import { GROUP_J } from './groupJ.js';
import { GROUP_K } from './groupK.js';
import { GROUP_L } from './groupL.js';
import { GROUP_M } from './groupM.js';
import { GROUP_N } from './groupN.js';

/** Case library barrel (docs/CASES.md). */
export type { CaseDefinition, CaseExpected } from './types.js';
export { GROUP_A, GROUP_B, GROUP_C, GROUP_D, GROUP_E, GROUP_F };
export { GROUP_G, GROUP_H, GROUP_I, GROUP_J, GROUP_K, GROUP_L, GROUP_M, GROUP_N };

/** All cases, ordered A01…N06. */
export const CASES: CaseDefinition[] = [
  ...GROUP_A,
  ...GROUP_B,
  ...GROUP_C,
  ...GROUP_D,
  ...GROUP_E,
  ...GROUP_F,
  ...GROUP_G,
  ...GROUP_H,
  ...GROUP_I,
  ...GROUP_J,
  ...GROUP_K,
  ...GROUP_L,
  ...GROUP_M,
  ...GROUP_N,
];

/** Look up a case by id (e.g. 'B02'). */
export function getCase(id: string): CaseDefinition | undefined {
  return CASES.find((c) => c.id === id);
}
