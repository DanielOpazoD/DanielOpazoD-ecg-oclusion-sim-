import { describe, expect, it } from 'vitest';
import { generateEcg } from '../engine/index.js';
import type { Scenario } from '../engine/index.js';
import {
  hypokalemiaOverrides,
  lowVoltageOverrides,
  longQtOverrides,
  shortQtOverrides,
  severeHyperkalemiaOverrides,
} from '../engine/index.js';
import { analyzeEcg } from './index.js';

const base: Scenario = {
  seed: 3,
  durationS: 12,
  rhythm: { type: 'sinus', hrBpm: 72 },
  conduction: 'normal',
  sources: [],
  variability: false,
};

const run = (sc: Partial<Scenario>, sex: 'M' | 'F' = 'M') =>
  analyzeEcg(generateEcg({ ...base, ...sc }), { sex }).findings;
const pos = (sc: Partial<Scenario>, id: string, sex: 'M' | 'F' = 'M') =>
  run(sc, sex).find((f) => f.id === id)?.positive;

const allIds = [
  'heart-rate',
  'rr-irregular',
  'wide-qrs',
  'bundle-branch-morphology',
  'pr-prolonged',
  'pr-short',
  'av-dissociation',
  'qtc-prolonged',
  'qtc-short',
  'axis-deviation',
  'lvh-voltage',
  'low-voltage',
  'peaked-t',
  'u-wave',
  'pacing',
  'flutter-waves',
];

describe('general rules', () => {
  it('heart-rate: tachy >100 and brady <50', () => {
    expect(pos({ rhythm: { type: 'sinus', hrBpm: 110 } }, 'heart-rate')).toBe(true);
    expect(pos({ rhythm: { type: 'sinus', hrBpm: 45 } }, 'heart-rate')).toBe(true);
    expect(pos({}, 'heart-rate')).toBe(false);
  });
  it('rr-irregular: AF positive, sinus negative', () => {
    expect(pos({ rhythm: { type: 'afib', hrBpm: 95 } }, 'rr-irregular')).toBe(true);
    expect(pos({}, 'rr-irregular')).toBe(false);
  });
  it('wide-qrs + bundle-branch morphology on LBBB/RBBB', () => {
    expect(pos({ conduction: 'lbbb' }, 'wide-qrs')).toBe(true);
    expect(pos({ conduction: 'rbbb' }, 'wide-qrs')).toBe(true);
    const r = run({ conduction: 'rbbb' }).find((f) => f.id === 'bundle-branch-morphology');
    expect(r?.positive).toBe(true);
    expect(r?.values.rbbb).toBe(1);
    expect(pos({}, 'wide-qrs')).toBe(false);
  });
  it('pr-prolonged and pr-short', () => {
    expect(pos({ rhythm: { type: 'av-block-1', hrBpm: 70, prMs: 230 } }, 'pr-prolonged')).toBe(
      true,
    );
    expect(pos({ conduction: 'wpw' }, 'pr-short')).toBe(true);
    expect(pos({}, 'pr-prolonged')).toBe(false);
    expect(pos({}, 'pr-short')).toBe(false);
  });
  it('av-dissociation on complete block', () => {
    expect(
      pos(
        {
          rhythm: { type: 'av-block-3', atrialBpm: 80, escapeBpm: 38, escapeOrigin: 'junctional' },
        },
        'av-dissociation',
      ),
    ).toBe(true);
    expect(pos({}, 'av-dissociation')).toBe(false);
  });
  it('qtc-prolonged and qtc-short', () => {
    expect(pos({ beatOverrides: longQtOverrides() }, 'qtc-prolonged')).toBe(true);
    expect(pos({ beatOverrides: shortQtOverrides() }, 'qtc-short')).toBe(true);
    expect(pos({}, 'qtc-prolonged')).toBe(false);
    expect(pos({}, 'qtc-short')).toBe(false);
  });
  it('axis-deviation on lafb/lpfb', () => {
    expect(pos({ conduction: 'lafb' }, 'axis-deviation')).toBe(true);
    expect(pos({ conduction: 'lpfb' }, 'axis-deviation')).toBe(true);
    expect(pos({}, 'axis-deviation')).toBe(false);
  });
  it('lvh-voltage and low-voltage', () => {
    expect(pos({ conduction: 'lvh' }, 'lvh-voltage')).toBe(true);
    expect(pos({ beatOverrides: lowVoltageOverrides() }, 'low-voltage')).toBe(true);
    expect(pos({}, 'lvh-voltage')).toBe(false);
    expect(pos({}, 'low-voltage')).toBe(false);
  });
  it('peaked-t in severe hyperK and u-wave in hypoK', () => {
    expect(pos({ beatOverrides: severeHyperkalemiaOverrides() }, 'peaked-t')).toBe(true);
    expect(pos({ beatOverrides: hypokalemiaOverrides() }, 'u-wave')).toBe(true);
    expect(pos({}, 'peaked-t')).toBe(false);
    expect(pos({}, 'u-wave')).toBe(false);
  });
  it('pacing and flutter-waves', () => {
    expect(pos({ rhythm: { type: 'paced', mode: 'VVI', rateBpm: 60 } }, 'pacing')).toBe(true);
    expect(pos({ rhythm: { type: 'flutter', atrialBpm: 300, ratio: 2 } }, 'flutter-waves')).toBe(
      true,
    );
    expect(pos({}, 'pacing')).toBe(false);
    expect(pos({}, 'flutter-waves')).toBe(false);
  });
  it('normal sinus is negative for every general rule', () => {
    const f = run({});
    for (const id of allIds) expect(f.find((x) => x.id === id)?.positive, id).toBe(false);
  });
});
