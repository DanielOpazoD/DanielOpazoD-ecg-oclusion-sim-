/**
 * Dump per-lead measurements of the dominant beat for a given scenario.
 * Usage: `npx tsx tools/dump-beat.ts [preset]`
 * Presets: normal | anteroseptal | inferior-rca | posterior | subendocardial |
 *          lbbb | de-winter | all (default)
 */
import { generateEcg, defaultScenario, LEAD_IDS, type Scenario } from '../src/engine/index.js';
import { measureEcg, mm, analyzeEcg } from '../src/analysis/index.js';
import { getCase } from '../src/cases/index.js';

const PRESETS: Record<string, Partial<Scenario>> = {
  normal: {},
  'anteroseptal 3@V3': {
    sources: [{ territory: 'anteroseptal', st: 0.3, refLead: 'V3', shape: 'straight' }],
  },
  'inferior-rca 3@III': {
    sources: [{ territory: 'inferior-rca', st: 0.3, refLead: 'III', shape: 'straight' }],
  },
  'posterior 2@V8': {
    sources: [{ territory: 'posterior', st: 0.2, refLead: 'V8', shape: 'straight' }],
  },
  'subendocardial 1.5@V5': {
    sources: [
      {
        territory: 'subendocardial',
        st: -0.15,
        refLead: 'V5',
        shape: 'straight',
        profile: 'subendocardial',
      },
    ],
  },
  lbbb: { conduction: 'lbbb' },
  'de-winter': {
    sources: [
      {
        territory: 'anterior',
        st: -0.15,
        refLead: 'V3',
        shape: 'depression-upsloping',
        hyperacuteT: 1.5,
      },
    ],
  },
};

function fmt(x: number): string {
  return (x >= 0 ? ' ' : '') + x.toFixed(2);
}

function dump(
  name: string,
  patch: Partial<Scenario>,
  opts?: { sex?: 'M' | 'F'; age?: number; conduction?: string },
): void {
  const sc: Scenario = { ...defaultScenario(), seed: 7, durationS: 4, ...patch };
  const ecg = generateEcg(sc);
  console.log(`\n=== ${name} ===`);
  console.log('lead |  ST_J  | ST60  |   R   |   S   |   T   (mm)');
  const meas = measureEcg(ecg);
  for (const id of LEAD_IDS) {
    const m = meas.perLead[id];
    console.log(
      `${id.padEnd(4)} | ${fmt(mm(m.stJ))} | ${fmt(mm(m.st60))} | ${fmt(mm(m.rAmp))} | ${fmt(mm(m.sAmp))} | ${fmt(mm(m.tAmp))}`,
    );
  }
  const rep = analyzeEcg(ecg, {
    sex: opts?.sex ?? 'M',
    age: opts?.age ?? 60,
    conduction: (sc.conduction ?? 'normal') as 'normal',
  });
  console.log(`OMI: ${rep.omi.positive ? '✔' : '✘'}`);
  for (const f of rep.findings.filter((x) => x.positive)) {
    console.log(`  + ${f.id}: ${f.rationale}`);
  }
}

const arg = process.argv[2];
const kase = arg ? getCase(arg) : undefined;
if (kase) {
  dump(`${kase.id} ${kase.title}`, kase.scenario, {
    sex: kase.vignette.sex,
    age: kase.vignette.age,
  });
} else if (arg && arg !== 'all') {
  dump(arg, PRESETS[arg] ?? {});
} else {
  for (const [name, patch] of Object.entries(PRESETS)) dump(name, patch);
}
