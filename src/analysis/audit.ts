import type { Fiducials, LeadId, Schedule } from '../engine/index.js';
import { LEAD_IDS } from '../engine/index.js';
import type { Delineation } from './delineate/delineate.js';
import { unavailable, type EvidenceStatus } from './delineate/evidence.js';
import type { Measurements } from './measure.js';

export interface AuditTruth {
  fiducials: Fiducials[];
  schedule: Schedule;
  fs: number;
  /** Frontal QRS axis of the fiducial reference measurement (degrees). */
  qrsAxisDeg?: number | null;
}

/** Per-lead agreement between the blind measurement and the reference. */
export interface MeasurementAudit {
  stDiscordant: LeadId[];
  maxStDeltaMv: number;
  tDiscordant: LeadId[];
  status: EvidenceStatus;
  note: string;
}

/**
 * Compare the blind (delineated-signal) measurements against the fiducial
 * reference. Informative only — never alters measurements or findings.
 */
export function auditMeasurements(blind: Measurements, ref: Measurements): MeasurementAudit {
  const stDiscordant: LeadId[] = [];
  const tDiscordant: LeadId[] = [];
  let maxStDeltaMv = 0;
  for (const l of LEAD_IDS) {
    const b = blind.perLead[l];
    const r = ref.perLead[l];
    const dSt = Math.abs(b.stJ - r.stJ);
    if (dSt > maxStDeltaMv) maxStDeltaMv = dSt;
    if (dSt > 0.05) stDiscordant.push(l);
    const signFlip =
      Math.sign(b.tAmp) !== Math.sign(r.tAmp) && (Math.abs(b.tAmp) > 0.1 || Math.abs(r.tAmp) > 0.1);
    if (Math.abs(b.tAmp - r.tAmp) > 0.1 || signFlip) tDiscordant.push(l);
  }
  const discordant = new Set([...stDiscordant, ...tDiscordant]).size;
  const status: EvidenceStatus =
    discordant === 0 ? 'usable' : discordant <= 2 ? 'review' : 'unavailable';
  const note =
    status === 'usable'
      ? 'Medición ciega concordante con la referencia sintética.'
      : `Medición ciega discordante con la referencia sintética en ${[...stDiscordant, ...tDiscordant.filter((l) => !stDiscordant.includes(l))].join(', ')} — revisa el punto J y la amplitud T.`;
  return { stDiscordant, maxStDeltaMv, tDiscordant, status, note };
}

/**
 * Simulator QA after independent sample delineation. Metrics outside the
 * stated tolerance are withdrawn, never replaced with generator values.
 */
export function auditDelineation(d: Delineation, truth: AuditTruth): Delineation {
  const out = structuredClone(d);
  const setUnavailable = (key: 'hr' | 'pr' | 'qrs' | 'qt' | 'axis', note: string) => {
    out.evidence[key] = unavailable(note);
    if (key === 'hr') out.hrBpm = null;
    if (key === 'pr') out.prMs = null;
    if (key === 'qrs') out.qrsMs = null;
    if (key === 'qt') {
      out.qtMs = null;
      out.qtc = { bazett: null, fridericia: null, framingham: null, hodges: null };
    }
    if (key === 'axis') out.axisDeg.qrs = null;
  };
  const trueBeats = truth.fiducials;
  const trueRr = trueBeats
    .slice(1)
    .map((b, i) => ((b.qrsOnset - trueBeats[i]!.qrsOnset) * 1000) / truth.fs);
  const trueHr = trueRr.length ? 60000 / (trueRr.reduce((a, b) => a + b, 0) / trueRr.length) : null;
  if (out.hrBpm !== null && trueHr !== null && Math.abs(out.hrBpm - trueHr) > trueHr * 0.05)
    setUnavailable(
      'hr',
      'Frecuencia retirada: discrepa >5% de la referencia sintética; revisa con calibres.',
    );
  const truthPr = trueBeats
    .filter((b) => b.pOnset >= 0)
    .map((b) => ((b.qrsOnset - b.pOnset) * 1000) / truth.fs);
  const truePr = truthPr.length ? truthPr.reduce((a, b) => a + b, 0) / truthPr.length : null;
  if (out.prMs !== null && truePr !== null && Math.abs(out.prMs - truePr) > 25)
    setUnavailable('pr', 'PR retirado: discrepa >25 ms de la referencia sintética.');
  const trueQrs = trueBeats.length
    ? trueBeats.map((b) => ((b.j - b.qrsOnset) * 1000) / truth.fs)
    : [];
  const qrs = trueQrs.length ? trueQrs.reduce((a, b) => a + b, 0) / trueQrs.length : null;
  if (out.qrsMs !== null && qrs !== null && Math.abs(out.qrsMs - qrs) > 20)
    setUnavailable('qrs', 'QRS retirado: discrepa >20 ms de la referencia sintética.');
  const trueQt = trueBeats.length
    ? trueBeats.map((b) => ((b.tEnd - b.qrsOnset) * 1000) / truth.fs)
    : [];
  const qt = trueQt.length ? trueQt.reduce((a, b) => a + b, 0) / trueQt.length : null;
  if (out.qtMs !== null && qt !== null && Math.abs(out.qtMs - qt) > 40)
    setUnavailable('qt', 'QT retirado: discrepa >40 ms de la referencia sintética.');
  if (out.axisDeg.qrs !== null && truth.qrsAxisDeg != null) {
    const diff = Math.abs(((out.axisDeg.qrs - truth.qrsAxisDeg + 540) % 360) - 180);
    if (diff > 25)
      setUnavailable('axis', 'Eje retirado: discrepa >25° de la referencia sintética.');
  }
  return out;
}
