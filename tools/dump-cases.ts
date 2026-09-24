/**
 * Per-case compact table of ST(J+60) / R / T amplitudes (mm at 10 mm/mV) for the 12 standard leads,
 * measured on the clean signal at each case's `ecgAtMin`. For visual-fidelity audits.
 * Usage: `npx tsx tools/dump-cases.ts [caseId ...]`
 */
import { generateEcg } from '../src/engine/index.js';
import { analyzeEcg, measureEcg } from '../src/analysis/index.js';
import { CASES } from '../src/cases/index.js';

const LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;
const f = (x: number) => (x * 10).toFixed(1).padStart(6);
const ids = process.argv.slice(2);

for (const c of CASES) {
  if (ids.length && !ids.includes(c.id)) continue;
  const ecg = generateEcg(c.scenario, c.ecgAtMin ?? 0);
  const m = measureEcg(ecg, 'clean');
  console.log(
    `\n${c.id} ${c.title} @${c.ecgAtMin ?? 0}min  HR ${m.hrBpm.toFixed(0)} QRS ${m.perLead.V2.qrsDurMs.toFixed(0)}ms QTc ${m.qtcBazett.toFixed(0)}`,
  );
  console.log('      ' + LEADS.map((l) => l.padStart(6)).join(''));
  console.log('STJ   ' + LEADS.map((l) => f(m.perLead[l].stJ)).join(''));
  console.log('ST60  ' + LEADS.map((l) => f(m.perLead[l].st60)).join(''));
  console.log('R     ' + LEADS.map((l) => f(m.perLead[l].rAmp)).join(''));
  console.log('S     ' + LEADS.map((l) => f(-m.perLead[l].sAmp)).join(''));
  console.log('T     ' + LEADS.map((l) => f(m.perLead[l].tAmp)).join(''));
  const rep = analyzeEcg(ecg, {
    sex: c.vignette.sex,
    age: c.vignette.age,
    conduction: c.scenario.conduction,
  });
  const pos = rep.findings.filter((x) => x.positive).map((x) => x.id);
  console.log(`POS   ${pos.join(', ') || '—'}`);
}
