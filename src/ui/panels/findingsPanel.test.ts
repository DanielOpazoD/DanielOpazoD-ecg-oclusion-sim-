import { describe, expect, it } from 'vitest';
import { getCase } from '../../cases/index.js';
import { generateEcg } from '../../engine/index.js';
import { analyzeEcg } from '../../analysis/index.js';
import { verdictSentence, leadRange } from './findingsPanel.js';

function reportFor(id: string) {
  const c = getCase(id)!;
  const ecg = generateEcg(c.scenario, c.ecgAtMin);
  return analyzeEcg(ecg, {
    sex: c.vignette.sex,
    age: c.vignette.age,
    source: 'clean',
  });
}

describe('verdictSentence', () => {
  it('positive: STEMI line + up to two OMI positives supporting oclusión', () => {
    const s = verdictSentence(reportFor('A01'));
    expect(s).toContain('Cumple criterios STEMI.');
    expect(s).toContain('apoyan oclusión.');
  });
  it('negative: no STEMI criteria line', () => {
    // G04 (arritmia sinusal respiratoria) does not meet STEMI criteria.
    const s = verdictSentence(reportFor('G04'));
    expect(s).toContain('No cumple criterios STEMI.');
    expect(s).not.toContain('Cumple criterios STEMI. O');
  });
});

describe('leadRange', () => {
  it('compresses consecutive leads into a range', () => {
    expect(leadRange(['V2', 'V3', 'V4'])).toBe('V2–V4');
    expect(leadRange(['V4', 'V2', 'V3'])).toBe('V2–V4');
  });
  it('comma-lists non-consecutive leads', () => {
    expect(leadRange(['II', 'V5'])).toBe('II, V5');
    expect(leadRange(['I', 'aVL', 'V5', 'V6'])).toBe('I, aVL, V5–V6');
  });
  it('caps at 4 parts with an ellipsis and handles empty', () => {
    expect(leadRange([])).toBe('');
    const many = leadRange(['I', 'aVL', 'V2', 'V4', 'V6']);
    expect(many.split(', ').length).toBeLessThanOrEqual(4);
  });
});
