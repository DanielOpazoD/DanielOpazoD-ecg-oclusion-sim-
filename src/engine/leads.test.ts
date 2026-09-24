import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createLeadSystem, projectDipole, LEAD_IDS } from './leads.js';
import type { Vec3 } from './math/vec3.js';

const vec3Arb = fc.tuple(
  fc.double({ min: -5, max: 5, noNaN: true }),
  fc.double({ min: -5, max: 5, noNaN: true }),
  fc.double({ min: -5, max: 5, noNaN: true }),
) as fc.Arbitrary<Vec3>;

describe('leads — §9.1 Einthoven/Goldberger', () => {
  it('I + III = II and aVR + aVL + aVF = 0 for random dipoles (< 1e-9)', () => {
    const sys = createLeadSystem('standard');
    fc.assert(
      fc.property(vec3Arb, (h) => {
        const p = projectDipole(h, sys);
        expect(Math.abs(p.I + p.III - p.II)).toBeLessThan(1e-9);
        expect(Math.abs(p.aVR + p.aVL + p.aVF)).toBeLessThan(1e-9);
      }),
      { numRuns: 200 },
    );
  });

  it('projection is linear in H', () => {
    const sys = createLeadSystem('standard');
    fc.assert(
      fc.property(vec3Arb, vec3Arb, fc.double({ min: -3, max: 3, noNaN: true }), (a, b, k) => {
        const pa = projectDipole(a, sys);
        const pb = projectDipole(b, sys);
        const sum = projectDipole([a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]], sys);
        for (const id of LEAD_IDS) {
          expect(Math.abs(sum[id] - (pa[id] + k * pb[id]))).toBeLessThan(1e-9);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('la-ra-swap: I inverted, aVR ≈ aVL standard (§9.10)', () => {
    const std = createLeadSystem('standard');
    const swp = createLeadSystem('la-ra-swap');
    const h: Vec3 = [0.5, 0.8, -0.3];
    const p0 = projectDipole(h, std);
    const p1 = projectDipole(h, swp);
    expect(p1.I).toBeCloseTo(-p0.I, 9);
    expect(p1.aVR).toBeCloseTo(p0.aVL, 9);
    expect(p1.II).toBeCloseTo(p0.III, 9);
  });

  it('la-ll-swap: I↔II, III inverted, aVL≈aVF', () => {
    const std = createLeadSystem('standard');
    const swp = createLeadSystem('la-ll-swap');
    const h: Vec3 = [0.3, 0.9, -0.2];
    const p0 = projectDipole(h, std);
    const p1 = projectDipole(h, swp);
    expect(p1.I).toBeCloseTo(p0.II, 9);
    expect(p1.III).toBeCloseTo(-p0.III, 9);
    expect(p1.aVL).toBeCloseTo(p0.aVF, 9);
  });
});
