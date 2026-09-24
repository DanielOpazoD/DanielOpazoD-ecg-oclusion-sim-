/**
 * Seeded PRNG for deterministic signal generation (MODEL.md §0.3).
 * mulberry32 — fast, good statistical quality for simulation.
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (Box–Muller, cached pair). */
  gaussian(): number;
  /** Uniform in [a, b). */
  uniform(a: number, b: number): number;
}

/** Create a deterministic RNG from a 32-bit seed (§0.3). */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  let spare: number | null = null;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    gaussian(): number {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      let u = 0;
      do {
        u = next();
      } while (u === 0);
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    uniform(a: number, b: number): number {
      return a + (b - a) * next();
    },
  };
}
