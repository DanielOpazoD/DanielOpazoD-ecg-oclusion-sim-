import type { CaseDefinition } from './types.js';
import { GROUP_A } from './groupA.js';
import { GROUP_B } from './groupB.js';
import { GROUP_C } from './groupC.js';
import { GROUP_D } from './groupD.js';
import { GROUP_E } from './groupE.js';
import { GROUP_F } from './groupF.js';

/** Case library barrel (docs/CASES.md). */
export type { CaseDefinition, CaseExpected } from './types.js';
export { GROUP_A, GROUP_B, GROUP_C, GROUP_D, GROUP_E, GROUP_F };

/** All cases, ordered A01…F04. */
export const CASES: CaseDefinition[] = [
  ...GROUP_A,
  ...GROUP_B,
  ...GROUP_C,
  ...GROUP_D,
  ...GROUP_E,
  ...GROUP_F,
];

/** Look up a case by id (e.g. 'B02'). */
export function getCase(id: string): CaseDefinition | undefined {
  return CASES.find((c) => c.id === id);
}
