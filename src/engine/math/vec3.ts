/**
 * 3D vector utilities (MODEL.md §1 — Frank space, Dower convention).
 * `Vec3 = [X, Y, Z]` with X toward patient's left, Y toward feet, Z toward back.
 */
export type Vec3 = readonly [number, number, number];

/** Component-wise sum `a + b` (§1). */
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Scalar multiplication `k·a` (§1). */
export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

/** Dot product `a · b` (§1). */
export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Euclidean norm `|a|` (§1). */
export function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** Unit vector `a/|a|`; returns [0,0,0] for the zero vector (§1). */
export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  if (n === 0) return [0, 0, 0];
  return [a[0] / n, a[1] / n, a[2] / n];
}
