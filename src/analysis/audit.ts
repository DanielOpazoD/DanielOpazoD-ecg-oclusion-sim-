import type { Fiducials, Schedule } from '../engine/index.js';
import type { Delineation } from './delineate/delineate.js';
import { unavailable } from './delineate/evidence.js';

export interface AuditTruth {
  fiducials: Fiducials[];
  schedule: Schedule;
  fs: number;
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
  return out;
}
