import type { BeatEvent, EctopySpec, RhythmSpec, Schedule } from './schedule.js';

/**
 * Declared domain of the additive event model (ported from ECG Lab v1.3
 * constraints.ts). Violations throw; nothing is silently moved or clamped.
 * These are simulator limits, not clinical refractory-period estimates.
 */

export type ModelScopeCode = 'qrs-overlap' | 'premature-before-t' | 'unsupported-combination';

export class ModelScopeError extends Error {
  constructor(
    public readonly code: ModelScopeCode,
    message: string,
  ) {
    super(`Fuera del alcance del modelo: ${message}`);
    this.name = 'ModelScopeError';
  }
}

/** Rhythms whose own event law is incompatible with an ectopy overlay. */
const ECTOPY_BANNED = new Set<RhythmSpec['type']>(['vt', 'vf', 'asystole', 'torsades', 'paced']);

/** Nominal J-point offset per beat kind (ms), for the prematurity check. */
function qrsSupportMs(b: BeatEvent): number {
  return b.ventricular ? 140 : 90;
}

/**
 * Validate a schedule before synthesis.
 * - two QRS onsets closer than 200 ms → 'qrs-overlap' (no fusion model)
 * - an ectopic activation before the previous beat's J+120 ms →
 *   'premature-before-t' (no restitution/interaction model)
 * - ectopy over vt/vf/asystole/torsades/paced → 'unsupported-combination'
 */
export function assertRepresentableSchedule(
  schedule: Schedule,
  rhythm: RhythmSpec,
  ectopy: EctopySpec | undefined,
): void {
  if (ectopy && ECTOPY_BANNED.has(rhythm.type)) {
    throw new ModelScopeError(
      'unsupported-combination',
      'la ectopia no se combina con ritmos ventriculares, asistolia, torsades ni marcapasos.',
    );
  }
  const beats = schedule.beats;
  for (let i = 1; i < beats.length; i++) {
    const prev = beats[i - 1]!;
    const cur = beats[i]!;
    const interval = cur.tMs - prev.tMs;
    if (cur.kind === 'pvc' || cur.kind === 'pac') {
      if (interval < qrsSupportMs(prev) + 120) {
        throw new ModelScopeError(
          'premature-before-t',
          `la extrasístole comienza ${Math.round(interval)} ms tras el QRS previo; ` +
            'cae dentro del segmento ST del latido anterior y este motor no representa ' +
            'su interacción con la repolarización. Aumenta el acoplamiento.',
        );
      }
      continue;
    }
    if (interval < 200) {
      throw new ModelScopeError(
        'qrs-overlap',
        `se superponen activaciones QRS (${Math.round(interval)} ms) y este motor ` +
          'no representa su fusión. Reduce la frecuencia o revisa la combinación.',
      );
    }
  }
}
