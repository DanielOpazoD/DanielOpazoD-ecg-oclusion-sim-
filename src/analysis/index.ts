import type { Ecg12, LeadId, ConductionSpec } from '../engine/index.js';
import { LEAD_IDS } from '../engine/index.js';
import { measureEcg, type Measurements } from './measure.js';
import { delineate, type Delineation } from './delineate/delineate.js';
import { auditDelineation } from './audit.js';
import { GENERAL_RULES } from './rules/general.js';
import type { Finding, RuleContext } from './rules/types.js';
import { stemiUdmi4 } from './rules/stemi-udmi4.js';
import { posteriorStd } from './rules/posterior-std.js';
import { deWinter } from './rules/de-winter.js';
import { hyperacuteT } from './rules/hyperacute-t.js';
import { aslanger } from './rules/aslanger.js';
import { rvInvolvement } from './rules/rv-involvement.js';
import { avrDiffuseStd } from './rules/avr-diffuse-std.js';
import { southAfricanFlag } from './rules/south-african-flag.js';
import { reciprocalAvl } from './rules/reciprocal-avl.js';
import { sgarbossa } from './rules/sgarbossa.js';
import { sgarbossaModified } from './rules/sgarbossa-modified.js';
import { barcelona } from './rules/barcelona.js';
import { smith3v, smith4v } from './rules/smith.js';
import { terminalQrsDistortion } from './rules/terminal-qrs-distortion.js';
import { wellens } from './rules/wellens.js';
import { pathologicalQ } from './rules/pathological-q.js';
import { omiComposite } from './rules/omi-composite.js';

/**
 * Analysis entry point (MODEL.md §8): measurements + rule findings.
 */

/** All rules in evaluation order. */
const RULES = [
  stemiUdmi4,
  posteriorStd,
  deWinter,
  hyperacuteT,
  aslanger,
  rvInvolvement,
  avrDiffuseStd,
  southAfricanFlag,
  reciprocalAvl,
  sgarbossa,
  sgarbossaModified,
  barcelona,
  smith3v,
  smith4v,
  terminalQrsDistortion,
  wellens,
  pathologicalQ,
];

const GENERAL = GENERAL_RULES;

/** Full analysis report. */
export interface AnalysisReport {
  measurements: Measurements;
  findings: Finding[];
  /** Independent sample delineation, optionally audited against generator truth. */
  delineation: Delineation;
  /** Composite OMI verdict (§8 `omi-composite`). */
  omi: Finding;
}

/** Options: patient demographics and which extra leads were acquired. */
export interface AnalyzeOptions {
  sex?: 'M' | 'F';
  age?: number;
  /** Default: all leads the engine produced. */
  leadsAvailable?: LeadId[];
  /** Default: 'normal'. */
  conduction?: ConductionSpec;
  /** Signal to measure: 'clean' ground truth (default) or 'acquired'
   *  (post noise/filters — noise and filters are a display layer). */
  source?: 'clean' | 'acquired';
}

/** Run the full analysis on an ECG (§8). */
export function analyzeEcg(ecg: Ecg12, opts: AnalyzeOptions = {}): AnalysisReport {
  const source = opts.source ?? 'clean';
  const rawDelineation = delineate({
    fs: ecg.fs,
    leads: source === 'acquired' ? ecg.leads : ecg.clean,
  });
  const ctx: RuleContext = {
    measurements: measureEcg(ecg, source),
    delineation: ecg.schedule
      ? auditDelineation(rawDelineation, {
          fiducials: ecg.beats,
          schedule: ecg.schedule,
          fs: ecg.fs,
        })
      : rawDelineation,
    patient: { sex: opts.sex ?? 'M', age: opts.age ?? 60 },
    leadsAvailable: opts.leadsAvailable ?? [...LEAD_IDS],
    conduction: opts.conduction ?? 'normal',
  };
  const omiFindings = RULES.map((r) => r(ctx));
  const findings = [...omiFindings, ...GENERAL.map((r) => r(ctx))];
  const omi = omiComposite(omiFindings);
  return { measurements: ctx.measurements, delineation: ctx.delineation, findings, omi };
}

export { measureEcg, mm } from './measure.js';
export type { Measurements, LeadMeasurement } from './measure.js';
export type { Finding, RuleContext } from './rules/types.js';
export { delineate } from './delineate/delineate.js';
export type { Delineation, DelineatedBeat } from './delineate/delineate.js';
export { auditDelineation } from './audit.js';
export type { Evidence, EvidenceStatus } from './delineate/evidence.js';
export * from './rules/stemi-udmi4.js';
export * from './rules/posterior-std.js';
export * from './rules/de-winter.js';
export * from './rules/hyperacute-t.js';
export * from './rules/aslanger.js';
export * from './rules/rv-involvement.js';
export * from './rules/avr-diffuse-std.js';
export * from './rules/south-african-flag.js';
export * from './rules/reciprocal-avl.js';
export * from './rules/sgarbossa.js';
export * from './rules/sgarbossa-modified.js';
export * from './rules/barcelona.js';
export * from './rules/smith.js';
export * from './rules/terminal-qrs-distortion.js';
export * from './rules/wellens.js';
export * from './rules/pathological-q.js';
export { omiComposite } from './rules/omi-composite.js';
export * from './rules/general.js';
