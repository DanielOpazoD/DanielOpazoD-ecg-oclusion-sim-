import { describe, expect, it } from 'vitest';
import { CASES } from './index.js';
import { generateEcg } from '../engine/index.js';
import { ecgSignature } from '../engine/signature.js';
import { analyzeEcg } from '../analysis/index.js';

/** Engine + analysis regression snapshots. Update intentionally via `npm run test:update`. */

describe('signal signature snapshots', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const ecg = generateEcg(c.scenario, c.ecgAtMin);
    expect(ecgSignature(ecg)).toMatchSnapshot(c.id);
  });
});

describe('analysis snapshots', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const ecg = generateEcg(c.scenario, c.ecgAtMin);
    const report = analyzeEcg(ecg, {
      sex: c.vignette.sex,
      age: c.vignette.age,
      conduction: c.scenario.conduction,
      ...(c.leadsAvailable ? { leadsAvailable: c.leadsAvailable } : {}),
    });
    expect({
      omi: report.omi.positive,
      positives: report.findings
        .filter((f) => f.positive)
        .map((f) => f.id)
        .sort(),
      hr: Math.round(report.measurements.hrBpm),
    }).toMatchSnapshot(c.id);
  });
});
