import { spread } from './statistics.js';

/** Per-metric evidence status for delineated figures. */
export type EvidenceStatus = 'usable' | 'review' | 'unavailable';
export interface Evidence {
  status: EvidenceStatus;
  /** Spanish user-facing note. */
  note: string;
}

/**
 * Evidence from a set of per-beat candidates: 'usable' when there are enough
 * values (≥3 and ≥60% of eligible beats) and they are stable (spread ≤ limit).
 */
export function evidence(
  values: readonly number[],
  total: number,
  limit: number,
  note: string,
): Evidence {
  const dispersion = values.length > 1 ? spread(values) : null;
  const enough = values.length >= 3 && values.length >= total * 0.6;
  const stable = dispersion !== null && dispersion <= limit;
  const status: EvidenceStatus =
    enough && stable ? 'usable' : values.length ? 'review' : 'unavailable';
  return {
    status,
    note: !values.length
      ? note
      : !enough
        ? 'Pocos latidos con límites reconocibles.'
        : !stable
          ? 'Dispersión entre latidos: revisa el trazado.'
          : note,
  };
}

export const unavailable = (note: string): Evidence => ({
  status: 'unavailable',
  note,
});
