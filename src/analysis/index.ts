import type { Ecg12, LeadId, ConductionSpec } from '../engine/index.js';
import { LEAD_IDS } from '../engine/index.js';
import { measureEcg, type Measurements } from './measure.js';
import { measureFromDelineation } from './blindMeasure.js';
import { delineate, type Delineation } from './delineate/delineate.js';
import { auditDelineation, auditMeasurements, type MeasurementAudit } from './audit.js';
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
  /** Blind measurements (delineated fiducials on samples only) — what the
   *  rule engine reads. */
  measurements: Measurements;
  findings: Finding[];
  /** Independent sample delineation, optionally audited against generator truth. */
  delineation: Delineation;
  /** Fiducial-based reference measurement — audit only, never fed to rules. */
  reference: Measurements;
  /** Agreement between blind measurements and the fiducial reference. */
  measurementAudit: MeasurementAudit;
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

/** Derive the QRS context from the schedule truth first, then the declared
 *  conduction. ≥50% paced/ventricular beats wins over the declared conduction. */
function qrsContextOf(ecg: Ecg12, conduction: ConductionSpec): RuleContext['qrsContext'] {
  const beats = ecg.schedule?.beats ?? [];
  if (beats.length > 0) {
    const paced = beats.filter(
      (b) => b.pacedSpike === 'ventricular' || b.pacedSpike === 'both',
    ).length;
    if (paced >= beats.length / 2) return 'paced';
    const ventricular = beats.filter((b) => b.ventricular).length;
    if (ventricular >= beats.length / 2) return 'ventricular';
  }
  if (conduction === 'lbbb') return 'lbbb';
  if (conduction === 'paced') return 'paced';
  if (conduction === 'rbbb' || conduction === 'rbbb-lafb' || conduction === 'rbbb-lpfb')
    return 'rbbb';
  return 'narrow';
}

/** Mark a finding non-applicable (preserves id/label/leads/refs). */
function notApplicable(f: Finding): Finding {
  const out = {
    ...f,
    positive: false,
    rationale:
      'No aplicable: QRS ancho de origen ventricular / BRI / estimulado — use criterios de Sgarbossa/Barcelona.',
  };
  delete out.score;
  return out;
}

/** Run the full analysis on an ECG (§8). Measurements are computed from
 *  samples + the independent delineation only; the fiducial path is the
 *  informative audit reference. */
export function analyzeEcg(ecg: Ecg12, opts: AnalyzeOptions = {}): AnalysisReport {
  const source = opts.source ?? 'clean';
  const signal = source === 'acquired' ? ecg.leads : ecg.clean;
  const rawDelineation = delineate({
    fs: ecg.fs,
    leads: signal,
  });
  const reference = measureEcg(ecg, source);
  const blindMeasurements = measureFromDelineation(rawDelineation, signal, ecg.fs);
  const measurementAudit = auditMeasurements(blindMeasurements, reference);
  const ctx: RuleContext = {
    measurements: blindMeasurements,
    delineation: ecg.schedule
      ? auditDelineation(rawDelineation, {
          fiducials: ecg.beats,
          schedule: ecg.schedule,
          fs: ecg.fs,
          qrsAxisDeg: reference.qrsAxisDeg,
        })
      : rawDelineation,
    patient: { sex: opts.sex ?? 'M', age: opts.age ?? 60 },
    leadsAvailable: opts.leadsAvailable ?? [...LEAD_IDS],
    conduction: opts.conduction ?? 'normal',
    qrsContext: qrsContextOf(ecg, opts.conduction ?? 'normal'),
  };
  // Over a ventricular rhythm a detected "P→QRS association" is at best
  // retrograde coincidence — PR is never usable.
  if (ctx.qrsContext === 'ventricular' && ctx.delineation.evidence.pr.status === 'usable') {
    ctx.delineation.evidence.pr = {
      status: 'review',
      note: 'QRS de origen ventricular: la asociación P–QRS no es fiable.',
    };
  }
  const wide = ['lbbb', 'paced', 'ventricular'].includes(ctx.qrsContext);
  const omiFindings = RULES.map((r) => {
    const f = r(ctx);
    // ST-based OMI rules are not applicable over LBBB / paced / ventricular
    // QRS — the Sgarbossa family owns those contexts (they read qrsContext).
    if (wide && !['sgarbossa', 'sgarbossa-modified', 'barcelona'].includes(f.id)) {
      return notApplicable(f);
    }
    return f;
  });
  const findings = [...omiFindings, ...GENERAL.map((r) => r(ctx))];
  const omi = omiComposite(omiFindings);
  return {
    measurements: ctx.measurements,
    delineation: ctx.delineation,
    reference,
    measurementAudit,
    findings,
    omi,
  };
}

export { measureEcg, measureSignal, mm } from './measure.js';
export type { Measurements, LeadMeasurement, MeasureInput, BeatFiducials } from './measure.js';
export { measureFromDelineation } from './blindMeasure.js';
export { auditMeasurements } from './audit.js';
export type { MeasurementAudit } from './audit.js';
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
