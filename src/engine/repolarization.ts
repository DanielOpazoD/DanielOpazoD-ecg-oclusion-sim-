/**
 * QT adaptation to RR history (ported from ECG Lab v1.3 repolarization.ts):
 * first-order exponential memory with τ = 40 s, then a Fridericia rate law.
 * Not cellular restitution — an engineering approximation.
 */

/** RR-memory time constant: reaches 63% of a step in 40 s. */
export const QT_ADAPTATION_MS = 40000;

/** One adaptation step: history moves toward `rrMs` over `elapsedMs`. */
export function adaptRR(previousMs: number, rrMs: number, elapsedMs: number): number {
  return (
    previousMs + (1 - Math.exp(-Math.max(0, elapsedMs) / QT_ADAPTATION_MS)) * (rrMs - previousMs)
  );
}

/** QT (ms) from the adapted RR via the Fridericia cube-root law. */
export function qtFromAdaptedRR(qtcMs: number, qtScale: number, adaptedRrMs: number): number {
  return qtcMs * qtScale * Math.cbrt(Math.max(200, adaptedRrMs) / 1000);
}
