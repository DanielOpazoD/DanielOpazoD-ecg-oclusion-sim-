import { describe, expect, it } from 'vitest';
import { generateEcg, defaultScenario, type Scenario } from '../engine/index.js';
import { analyzeEcg, type AnalyzeOptions } from './index.js';

/**
 * Rule engine tests — MODEL.md §9 items 5–8 plus positive/negative per rule.
 */

type Patch = Partial<Scenario>;
function run(patch: Patch, opts: AnalyzeOptions = {}) {
  const sc: Scenario = { ...defaultScenario(), seed: 42, durationS: 5, ...patch };
  const rep = analyzeEcg(generateEcg(sc), { conduction: sc.conduction, ...opts });
  return {
    rep,
    pos: (id: string) =>
      rep.findings.find((f) => f.id === id)?.positive ?? (rep.omi.id === id && rep.omi.positive),
    val: (id: string) => rep.findings.find((f) => f.id === id),
  };
}

const normal = run({});

describe('rules — negative baseline', () => {
  it('normal ECG: everything negative', () => {
    for (const f of normal.rep.findings) {
      expect(f.positive, f.id).toBe(false);
    }
    expect(normal.rep.omi.positive).toBe(false);
  });
});

describe('§9.5 subendocardial', () => {
  const r = run({
    sources: [{ territory: 'subendocardial', st: -0.2, refLead: 'V5', shape: 'straight' }],
  });
  it('avr-diffuse-std positive, stemi-udmi4 negative', () => {
    expect(r.pos('avr-diffuse-std')).toBe(true);
    expect(r.pos('stemi-udmi4')).toBe(false);
  });
});

describe('§9.7 lbbb', () => {
  const clean = run({ conduction: 'lbbb' });
  const injured = run({
    conduction: 'lbbb',
    sources: [{ territory: 'anteroseptal', st: 0.15, refLead: 'V2', shape: 'straight' }],
  });
  it('lbbb alone: sgarbossa-modified and barcelona negative', () => {
    expect(clean.pos('sgarbossa-modified')).toBe(false);
    expect(clean.pos('barcelona')).toBe(false);
  });
  it('lbbb + anteroseptal 1.5: positive', () => {
    expect(injured.pos('sgarbossa-modified')).toBe(true);
    expect(injured.pos('barcelona')).toBe(true);
  });
});

describe('§9.8 de-winter', () => {
  const r = run({
    sources: [
      {
        territory: 'anterior',
        st: -0.2,
        refLead: 'V3',
        shape: 'depression-upsloping',
        hyperacuteT: 1.6,
      },
      { territory: 'anteroseptal', st: 0.04, refLead: 'V1', shape: 'straight' },
    ],
  });
  it('de-winter positive, stemi-udmi4 negative', () => {
    expect(r.pos('de-winter')).toBe(true);
    expect(r.pos('stemi-udmi4')).toBe(false);
  });
});

describe('individual rules — positive/negative', () => {
  it('stemi-udmi4: anterior 2.5@V3 positive; sex/age thresholds respected', () => {
    const p = run({
      sources: [{ territory: 'anterior', st: 0.28, refLead: 'V3', shape: 'straight' }],
    });
    expect(p.pos('stemi-udmi4')).toBe(true);
    // Borderline: ~1.7 mm V3 fails in M<40 (2.5) but passes in F (1.5) via V3–V4.
    const thin = {
      sources: [{ territory: 'anterior', st: 0.2, refLead: 'V3', shape: 'straight' }],
    } as Patch;
    const male = run(thin, { sex: 'M', age: 30 });
    const female = run(thin, { sex: 'F', age: 30 });
    expect(male.pos('stemi-udmi4')).toBe(false);
    expect(female.pos('stemi-udmi4')).toBe(true);
  });

  it('posterior-std: posterior 1.4@V8 positive, anterior STEMI negative', () => {
    const p = run({
      sources: [{ territory: 'posterior', st: 0.14, refLead: 'V8', shape: 'straight' }],
    });
    expect(p.pos('posterior-std')).toBe(true);
    const n = run({
      sources: [{ territory: 'anterior', st: 0.3, refLead: 'V3', shape: 'straight' }],
    });
    expect(n.pos('posterior-std')).toBe(false);
  });

  it('hyperacute-t: anterior hT 2.0 positive; normal negative', () => {
    const p = run({
      sources: [
        { territory: 'anterior', st: 0.06, refLead: 'V3', shape: 'concave', hyperacuteT: 2.0 },
      ],
    });
    expect(p.pos('hyperacute-t')).toBe(true);
    expect(normal.pos('hyperacute-t')).toBe(false);
  });

  it('aslanger: III-only STE + lateral STD + V1>V2', () => {
    const p = run({
      sources: [
        { territory: 'inferior-rca', st: 0.24, refLead: 'III', shape: 'straight' },
        { territory: 'subendocardial', st: -0.26, refLead: 'V5', shape: 'straight' },
      ],
    });
    expect(p.pos('aslanger')).toBe(true);
    expect(normal.pos('aslanger')).toBe(false);
  });

  it('rv-involvement: inferior + rv positive', () => {
    const p = run({
      sources: [
        { territory: 'inferior-rca', st: 0.2, refLead: 'III', shape: 'straight' },
        { territory: 'rv', st: 0.12, refLead: 'V4R', shape: 'straight' },
      ],
    });
    expect(p.pos('rv-involvement')).toBe(true);
    expect(normal.pos('rv-involvement')).toBe(false);
  });

  it('south-african-flag: high-lateral 1.5@aVL', () => {
    const p = run({
      sources: [{ territory: 'high-lateral', st: 0.15, refLead: 'aVL', shape: 'straight' }],
    });
    expect(p.pos('south-african-flag')).toBe(true);
    expect(normal.pos('south-african-flag')).toBe(false);
  });

  it('reciprocal-avl: inferior-rca 0.8@III positive; inferior-lcx negative-ish', () => {
    const p = run({
      sources: [{ territory: 'inferior-rca', st: 0.12, refLead: 'III', shape: 'concave' }],
    });
    expect(p.pos('reciprocal-avl')).toBe(true);
    const n = run({
      sources: [{ territory: 'inferior-lcx', st: 0.2, refLead: 'II', shape: 'straight' }],
    });
    expect(n.pos('reciprocal-avl')).toBe(false);
  });

  it('smith-4v: subtle anterior positive; normal negative', () => {
    const p = run({
      sources: [
        { territory: 'anterior', st: 0.12, refLead: 'V3', shape: 'straight', hyperacuteT: 0.8 },
      ],
      beatOverrides: { qtc: 420 },
    });
    expect(p.pos('smith-4v')).toBe(true);
    expect(normal.pos('smith-4v')).toBe(false);
  });

  it('terminal-qrs-distortion: anterior with terminalDistortion positive', () => {
    const p = run({
      sources: [
        {
          territory: 'anterior',
          st: 0.14,
          refLead: 'V3',
          shape: 'convex',
          terminalDistortion: 0.9,
        },
      ],
    });
    expect(p.pos('terminal-qrs-distortion')).toBe(true);
    expect(normal.pos('terminal-qrs-distortion')).toBe(false);
  });

  it('wellens: reperfused anterior at 24 h positive', () => {
    // generate at t=2000 min (tInversion high)
    const sc: Scenario = {
      ...defaultScenario(),
      seed: 42,
      durationS: 5,
      sources: [{ territory: 'anterior', st: 0.3, refLead: 'V3', shape: 'straight' }],
      timeline: [
        { atMin: 0, kind: 'occlusion' },
        { atMin: 60, kind: 'reperfusion' },
      ],
    };
    const rep = analyzeEcg(generateEcg(sc, 2000));
    expect(rep.findings.find((f) => f.id === 'wellens')?.positive).toBe(true);
    expect(normal.pos('wellens')).toBe(false);
  });

  it('pathological-q: anterior with qLoss 1 positive', () => {
    const p = run({
      sources: [{ territory: 'anterior', st: 0.15, refLead: 'V3', shape: 'straight', qLoss: 1 }],
    });
    expect(p.pos('pathological-q')).toBe(true);
    expect(normal.pos('pathological-q')).toBe(false);
  });
});

describe('measurements sanity (§8)', () => {
  it('normal: hr ~70, QTc ~400, axis ~40°', () => {
    const m = normal.rep.measurements;
    expect(m.hrBpm).toBeGreaterThan(60);
    expect(m.hrBpm).toBeLessThan(85);
    expect(m.qtcBazett).toBeGreaterThan(360);
    expect(m.qtcBazett).toBeLessThan(440);
    expect(m.qrsAxisDeg).toBeGreaterThan(0);
    expect(m.qrsAxisDeg).toBeLessThan(90);
    expect(m.qrsWide).toBe(false);
  });
});
