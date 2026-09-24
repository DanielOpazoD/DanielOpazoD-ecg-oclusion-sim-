import type { Vec3 } from './vec3.js';
import { add, scale } from './vec3.js';

/**
 * Smooth envelopes and interpolation (MODEL.md §2, §6).
 */

/** Gaussian envelope `exp(−(t−μ)²/(2σ²))`, peak amplitude 1 (§2.1–§2.2). */
export function gaussian(t: number, mu: number, sigma: number): number {
  const z = (t - mu) / sigma;
  return Math.exp(-0.5 * z * z);
}

/** Smoothstep `3x²−2x³` clamped to [0,1] over [a,b] (§6 ramp helper). */
export function smoothstep(t: number, a: number, b: number): number {
  if (a === b) return t >= b ? 1 : 0;
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}

/** Smooth ramp used by the timeline model (§6). */
export function ramp(t: number, a: number, b: number): number {
  return smoothstep(t, a, b);
}

/**
 * Monotone cubic Hermite spline (Fritsch–Carlson) through scalar control
 * points. Used per-component by `hermiteVec3` (§2.3).
 */
export function hermiteScalar(
  ts: readonly number[],
  ys: readonly number[],
): (t: number) => number {
  const n = ts.length;
  if (n < 2) throw new Error('need ≥2 control points');
  const m = new Array<number>(n).fill(0);
  for (let i = 0; i < n - 1; i++) {
    const dt = ts[i + 1]! - ts[i]!;
    m[i] = dt === 0 ? 0 : (ys[i + 1]! - ys[i]!) / dt;
  }
  // Tangents (Fritsch–Carlson).
  const d = new Array<number>(n).fill(0);
  d[0] = m[0]!;
  d[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    d[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      d[i] = 0;
      d[i + 1] = 0;
    } else {
      const a = d[i]! / m[i]!;
      const b = d[i + 1]! / m[i]!;
      const s = a * a + b * b;
      if (s > 9) {
        const c = 3 / Math.sqrt(s);
        d[i] = c * a * m[i]!;
        d[i + 1] = c * b * m[i]!;
      }
    }
  }
  return (t: number): number => {
    if (t <= ts[0]!) return ys[0]!;
    if (t >= ts[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (i < n - 2 && t > ts[i + 1]!) i++;
    const h = ts[i + 1]! - ts[i]!;
    const x = (t - ts[i]!) / h;
    const x2 = x * x;
    const x3 = x2 * x;
    return (
      (2 * x3 - 3 * x2 + 1) * ys[i]! +
      (x3 - 2 * x2 + x) * h * d[i]! +
      (-2 * x3 + 3 * x2) * ys[i + 1]! +
      (x3 - x2) * h * d[i + 1]!
    );
  };
}

/**
 * Monotone cubic Hermite spline through `(τ, Vec3)` control points (§2.3).
 * Returns an evaluator `f(τ) → Vec3`.
 */
export function hermiteVec3(
  points: readonly (readonly [number, Vec3])[],
): (t: number) => Vec3 {
  const ts = points.map((p) => p[0]);
  const fx = hermiteScalar(
    ts,
    points.map((p) => p[1][0]),
  );
  const fy = hermiteScalar(
    ts,
    points.map((p) => p[1][1]),
  );
  const fz = hermiteScalar(
    ts,
    points.map((p) => p[1][2]),
  );
  return (t: number): Vec3 => [fx(t), fy(t), fz(t)];
}

/** Convenience: linear combination `Σ kᵢ·vᵢ`. */
export function linComb(terms: readonly (readonly [number, Vec3])[]): Vec3 {
  let acc: Vec3 = [0, 0, 0];
  for (const [k, v] of terms) acc = add(acc, scale(v, k));
  return acc;
}
