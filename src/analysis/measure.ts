import type { Ecg12, LeadId } from '../engine/index.js';
import { LEAD_IDS } from '../engine/index.js';

/**
 * Measurements on the dominant sinus beat (MODEL.md §8).
 * Beats are located with engine fiducials — no detection — and the dominant
 * sinus beats are median-averaged per lead; pvc/aivr/escape beats excluded.
 */

/** 1 mV = 10 mm. */
export const MV_PER_MM = 0.1;

/** mV → mm. */
export function mm(mv: number): number {
  return mv / MV_PER_MM;
}

/** Per-lead measurements on the averaged dominant beat (§8). */
export interface LeadMeasurement {
  /** PR baseline (mean of qrsOnset−60…−20 ms), mV. */
  baseline: number;
  /** ST level at J / J+60 / J+80 relative to baseline, mV (§8). */
  stJ: number;
  st60: number;
  st80: number;
  /** ST slope J→J+80, mV/s. */
  stSlope: number;
  /** Pathologic-Q candidates (§8): duration ms and depth mV. */
  qDurMs: number;
  qAmp: number;
  /** R and S amplitudes (mV; sAmp positive depth). */
  rAmp: number;
  sAmp: number;
  qrsDurMs: number;
  /** stJ / rAmp (§8). */
  jToR: number;
  /** T extremum in [J, tEnd], mV (signed). */
  tAmp: number;
  /** T area ∫|v| from junction to T end, mV·s. */
  tArea: number;
  /** T symmetry: min(rise,fall)/max(rise,fall) of peak-centred halves, [0,1]. */
  tSym: number;
  /** ∫T / ∫|QRS| (§8). */
  tQrsAreaRatio: number;
  /** T width at half amplitude, ms. */
  tWidth50Ms: number;
  /** Terminal T (max |v| in last 120 ms of T), signed mV. */
  tTerminal: number;
  /** U-wave peak after T end, signed mV. */
  uAmp: number;
  /** Early-T positive deflection before a negative peak (Wellens A), mV (0 if none). */
  tBiphasic: number;
  /** Minimum value in the terminal 30 ms of QRS relative to baseline, mV.
   *  If ≥ −0.05 the terminal QRS never returns below baseline → distortion. */
  terminalMin: number;
}

/** Global rhythm/interval measurements (§8). */
export interface Measurements {
  perLead: Record<LeadId, LeadMeasurement>;
  /** QT of the dominant beat, ms. */
  qt: number;
  qtcBazett: number;
  /** Dominant PR, ms (−1 if no sinus P). */
  prMs: number;
  /** Dominant RR→HR, bpm. */
  hrBpm: number;
  /** Frontal QRS axis, degrees (−90…180). */
  qrsAxisDeg: number;
  /** Frontal T axis, degrees. */
  tAxisDeg: number;
  /** QRS ≥ 120 ms in any lead. */
  qrsWide: boolean;
}

function msToSamples(ms: number, fs: number): number {
  return Math.round((ms / 1000) * fs);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Median-average the dominant sinus beats of `lead` over a window relative to
 * QRS onset; returns the averaged waveform and the representative fiducials.
 */
function dominantBeat(
  ecg: Ecg12,
  lead: LeadId,
  source: 'clean' | 'acquired',
): { wave: Float32Array; qrsOnset: number; j: number; tEnd: number; pOnset: number } | null {
  // Dominant morphology: most frequent non-PVC type (escape/aivr rhythms are
  // measured on their own beats, §8).
  const counts = new Map<string, number>();
  for (const b of ecg.beats) {
    if (b.kind === 'pvc') continue;
    counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
  }
  const dominantType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const beats = ecg.beats.filter((b) => b.kind === dominantType);
  if (beats.length === 0) return null;
  const fs = ecg.fs;
  const pre = msToSamples(220, fs);
  const post = msToSamples(700, fs);
  const sig = source === 'acquired' ? ecg.leads[lead] : ecg.clean[lead];
  const segs: number[][] = [];
  for (const b of beats) {
    const start = b.qrsOnset - pre;
    if (start < 0 || b.qrsOnset + post > sig.length) continue;
    const seg: number[] = [];
    for (let i = 0; i < pre + post; i++) seg.push(sig[start + i]!);
    segs.push(seg);
  }
  if (segs.length === 0) return null;
  const wave = new Float32Array(pre + post);
  for (let i = 0; i < wave.length; i++) wave[i] = median(segs.map((s) => s[i]!));
  // Representative fiducials: median durations relative to qrsOnset.
  const jMed = Math.round(median(beats.map((b) => b.j - b.qrsOnset)));
  const tMed = Math.round(median(beats.map((b) => b.tEnd - b.qrsOnset)));
  const pDeltas = beats.filter((b) => b.pOnset >= 0).map((b) => b.qrsOnset - b.pOnset);
  const pMed = pDeltas.length ? Math.round(median(pDeltas)) : -1;
  return {
    wave,
    qrsOnset: pre,
    j: pre + jMed,
    tEnd: pre + tMed,
    pOnset: pMed < 0 ? -1 : pre - pMed,
  };
}

function measureLead(ecg: Ecg12, lead: LeadId, source: 'clean' | 'acquired'): LeadMeasurement {
  const fs = ecg.fs;
  const dom = dominantBeat(ecg, lead, source);
  if (!dom) {
    return {
      baseline: 0,
      stJ: 0,
      st60: 0,
      st80: 0,
      stSlope: 0,
      qDurMs: 0,
      qAmp: 0,
      rAmp: 0,
      sAmp: 0,
      qrsDurMs: 0,
      jToR: 0,
      tAmp: 0,
      tArea: 0,
      tSym: 0,
      tQrsAreaRatio: 0,
      tWidth50Ms: 0,
      tTerminal: 0,
      uAmp: 0,
      tBiphasic: 0,
      terminalMin: 0,
    };
  }
  const { wave, qrsOnset, j, tEnd } = dom;
  const clamp = (i: number) => Math.min(wave.length - 1, Math.max(0, i));
  const v = (i: number) => wave[clamp(i)]!;

  // PR baseline (§8).
  let baseline = 0;
  let cnt = 0;
  for (let i = qrsOnset - msToSamples(60, fs); i <= qrsOnset - msToSamples(20, fs); i++) {
    baseline += v(i);
    cnt++;
  }
  baseline /= Math.max(1, cnt);
  const rel = (i: number) => v(i) - baseline;

  // QRS amplitudes.
  let rAmp = 0;
  let rIdx = qrsOnset;
  let sAmp = 0;
  let qAmp = 0;
  let qIdx = qrsOnset;
  for (let i = qrsOnset; i <= j; i++) {
    const x = rel(i);
    if (x > rAmp) {
      rAmp = x;
      rIdx = i;
    }
    if (x < -sAmp) sAmp = -x;
  }
  for (let i = qrsOnset; i < rIdx; i++) {
    const x = rel(i);
    if (x < -qAmp) {
      qAmp = -x;
      qIdx = i;
    }
  }
  // Q duration: contiguous deflection < −0.02 mV around the trough.
  let qDurMs = 0;
  if (qAmp > 0.02) {
    let a = qIdx;
    let b = qIdx;
    while (a > qrsOnset && rel(a - 1) < -0.02) a--;
    while (b < j && rel(b + 1) < -0.02) b++;
    qDurMs = ((b - a) / fs) * 1000;
  }
  // QS complex (no R): the whole-complex negativity counts as a Q wave.
  if (rAmp < 0.15 && sAmp > 0.15) {
    qAmp = Math.max(qAmp, sAmp);
    const t = -0.2 * sAmp;
    let a = qrsOnset;
    let b = j;
    while (a <= j && rel(a) >= t) a++;
    while (b >= a && rel(b) >= t) b--;
    qDurMs = Math.max(qDurMs, ((b - a) / fs) * 1000);
  }
  const qrsDurMs = ((j - qrsOnset) / fs) * 1000;
  const stJ = rel(j);
  const st60 = rel(j + msToSamples(60, fs));
  const st80 = rel(j + msToSamples(80, fs));
  const stSlope = (st80 - stJ) / 0.08;

  // T metrics over [junction, tEnd]; junction ≈ 1/3 of the way (§8).
  const junction = Math.round(j + (tEnd - j) * (110 / 340));
  let tAmp = 0;
  let tPeak = junction;
  for (let i = j; i <= tEnd; i++) {
    const x = rel(i);
    if (Math.abs(x) > Math.abs(tAmp)) {
      tAmp = x;
      tPeak = i;
    }
  }
  let tArea = 0;
  let qrsArea = 0;
  for (let i = junction; i <= tEnd; i++) tArea += Math.abs(rel(i)) / fs;
  for (let i = qrsOnset; i <= j; i++) qrsArea += Math.abs(rel(i)) / fs;
  const rise = tPeak - junction;
  const fall = tEnd - tPeak;
  const tSym =
    Math.abs(tAmp) < 0.02 || rise <= 0 || fall <= 0
      ? 0.5
      : Math.min(rise, fall) / Math.max(rise, fall);
  const half = Math.abs(tAmp) / 2;
  let wStart = junction;
  let wEnd = tEnd;
  while (wStart < tPeak && Math.abs(rel(wStart)) < half) wStart++;
  while (wEnd > tPeak && Math.abs(rel(wEnd)) < half) wEnd--;
  const tWidth50Ms = ((wEnd - wStart) / fs) * 1000;
  let uAmp = 0;
  const uLo = Math.min(wave.length - 1, tEnd + msToSamples(40, fs));
  const uHi = Math.min(wave.length - 1, tEnd + msToSamples(220, fs));
  for (let i = uLo; i <= uHi; i++) {
    const x = rel(i);
    if (Math.abs(x) > Math.abs(uAmp)) uAmp = x;
  }
  let tTerminal = 0;
  for (let i = Math.max(junction, tEnd - msToSamples(120, fs)); i <= tEnd; i++) {
    const x = rel(i);
    if (Math.abs(x) > Math.abs(tTerminal)) tTerminal = x;
  }
  // Biphasic T (Wellens A): positive early lobe, negative terminal extremum.
  let earlyPos = 0;
  for (let i = junction; i < tPeak; i++) earlyPos = Math.max(earlyPos, rel(i));
  const tBiphasic = tAmp < 0 && earlyPos > 0.05 ? earlyPos : 0;

  // Terminal QRS minimum (§8 terminal-qrs-distortion).
  let terminalMin = 0;
  for (let i = Math.max(qrsOnset, j - msToSamples(30, fs)); i <= j; i++) {
    terminalMin = Math.min(terminalMin, rel(i));
  }

  return {
    baseline,
    stJ,
    st60,
    st80,
    stSlope,
    qDurMs,
    qAmp,
    rAmp,
    sAmp,
    qrsDurMs,
    jToR: rAmp > 0 ? stJ / rAmp : 0,
    tAmp,
    tArea,
    tSym,
    tQrsAreaRatio: qrsArea > 1e-6 ? tArea / qrsArea : 0,
    tWidth50Ms,
    tTerminal,
    uAmp,
    tBiphasic,
    terminalMin,
  };
}

/**
 * Measure the whole ECG (§8). Averages the dominant sinus beats per lead,
 * then derives intervals, rates and frontal axes.
 */
export function measureEcg(ecg: Ecg12, source: 'clean' | 'acquired' = 'clean'): Measurements {
  const perLead = {} as Record<LeadId, LeadMeasurement>;
  for (const id of LEAD_IDS) perLead[id] = measureLead(ecg, id, source);

  const counts = new Map<string, number>();
  for (const b of ecg.beats) {
    if (b.kind === 'pvc') continue;
    counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
  }
  const dominantType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'sinus';
  const sinus = ecg.beats.filter((b) => b.kind === dominantType);
  const rrMs = median(
    sinus.slice(1).map((b, i) => (b.qrsOnset - sinus[i]!.qrsOnset) / (ecg.fs / 1000)),
  );
  const hrBpm = rrMs > 0 ? 60000 / rrMs : 60;
  const rep = sinus[Math.floor(sinus.length / 2)] ?? ecg.beats[0];
  const qt = rep ? ((rep.tEnd - rep.qrsOnset) / ecg.fs) * 1000 : 0;
  const qtcBazett = rrMs > 0 ? qt / Math.sqrt(rrMs / 1000) : qt;
  const prMs = rep && rep.pOnset >= 0 ? ((rep.qrsOnset - rep.pOnset) / ecg.fs) * 1000 : -1;
  const qrsWide = LEAD_IDS.some((l) => perLead[l].qrsDurMs >= 120);

  const net = (l: LeadId) => perLead[l].rAmp - perLead[l].sAmp;
  const qrsAxisDeg = (Math.atan2(net('aVF'), net('I')) * 180) / Math.PI;
  const tAxisDeg = (Math.atan2(perLead.aVF.tAmp, perLead.I.tAmp) * 180) / Math.PI;

  return { perLead, qt, qtcBazett, prMs, hrBpm, qrsAxisDeg, tAxisDeg, qrsWide };
}
