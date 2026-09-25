import type { Ecg12, LeadId } from '../engine/index.js';
import { LEAD_IDS } from '../engine/index.js';
import { median } from './delineate/statistics.js';

/**
 * Measurements on the dominant beat (MODEL.md §8).
 * `measureSignal` works on a plain lead record + a caller-selected list of
 * beat fiducials (sample indices) — it is agnostic about where those
 * fiducials came from (generator truth or independent delineation).
 * `measureEcg` is the fiducial-based reference path, kept for auditing only;
 * it is never fed to the rule engine.
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

/** Beat fiducials in sample indices. `pOnset` is −1 when there is no P. */
export interface BeatFiducials {
  pOnset: number;
  qrsOnset: number;
  j: number;
  tEnd: number;
}

/** Inputs for the fiducial-agnostic measurement path. */
export interface MeasureInput {
  fs: number;
  leads: Partial<Record<LeadId, Float32Array>>;
  beats: BeatFiducials[];
  rrMs: number | null;
  prMs: number | null;
  qtMs: number | null;
  qrsAxisDeg: number | null;
  tAxisDeg: number | null;
}

function msToSamples(ms: number, fs: number): number {
  return Math.round((ms / 1000) * fs);
}

const ZERO_LEAD: LeadMeasurement = {
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

/**
 * Median-average all given beats of `sig` over a window relative to each
 * beat's QRS onset; returns the averaged waveform and the representative
 * fiducials (median offsets relative to the averaged onset).
 */
function dominantBeat(
  sig: Float32Array,
  fs: number,
  beats: BeatFiducials[],
): { wave: Float32Array; qrsOnset: number; j: number; tEnd: number; pOnset: number } | null {
  const pre = msToSamples(220, fs);
  const post = msToSamples(700, fs);
  let segs: number[][] = [];
  let kept: BeatFiducials[] = [];
  for (const b of beats) {
    const start = b.qrsOnset - pre;
    if (start < 0 || b.qrsOnset + post > sig.length) continue;
    const seg: number[] = [];
    for (let i = 0; i < pre + post; i++) seg.push(sig[start + i]!);
    segs.push(seg);
    kept.push(b);
  }
  if (segs.length === 0) return null;
  const wave = new Float32Array(pre + post);
  for (let i = 0; i < wave.length; i++) wave[i] = median(segs.map((s) => s[i]!));
  // Re-align each segment on the lag that best matches the first-pass median
  // wave (bounded ±20 ms): delineated onsets jitter by a few ms, which
  // smears sharp R peaks under median averaging.
  const jMed0 = Math.round(median(kept.map((b) => b.j - b.qrsOnset)));
  const wLo = pre - msToSamples(20, fs);
  const wHi = Math.min(wave.length, pre + jMed0 + msToSamples(60, fs));
  const segCorr = (seg: number[], shift: number) => {
    let xy = 0;
    let xx = 0;
    let yy = 0;
    for (let i = wLo; i < wHi; i++) {
      const s = seg[i];
      const w = wave[i - shift];
      if (s === undefined || w === undefined) continue;
      xy += s * w;
      xx += s * s;
      yy += w * w;
    }
    return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : -1;
  };
  const maxLag = msToSamples(20, fs);
  const segs2: number[][] = [];
  const kept2: BeatFiducials[] = [];
  for (const b of kept) {
    const start = b.qrsOnset - pre;
    const base: number[] = [];
    for (let i = 0; i < pre + post; i++) base.push(sig[start + i]!);
    let bestLag = 0;
    let bestC = -Infinity;
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      const c = segCorr(base, lag);
      if (c > bestC) {
        bestC = c;
        bestLag = lag;
      }
    }
    const shifted: number[] = [];
    const s0 = b.qrsOnset - pre - bestLag;
    if (s0 < 0 || s0 + pre + post > sig.length) continue;
    for (let i = 0; i < pre + post; i++) shifted.push(sig[s0 + i]!);
    segs2.push(shifted);
    kept2.push(b);
  }
  if (segs2.length > 0) {
    segs = segs2;
    kept = kept2;
    for (let i = 0; i < wave.length; i++) wave[i] = median(segs.map((s) => s[i]!));
  }
  // Representative fiducials: median durations relative to qrsOnset.
  const jMed = Math.round(median(kept.map((b) => b.j - b.qrsOnset)));
  const tMed = Math.round(median(kept.map((b) => b.tEnd - b.qrsOnset)));
  const pDeltas = kept.filter((b) => b.pOnset >= 0).map((b) => b.qrsOnset - b.pOnset);
  const pMed = pDeltas.length ? Math.round(median(pDeltas)) : -1;
  return {
    wave,
    qrsOnset: pre,
    j: pre + jMed,
    tEnd: pre + tMed,
    pOnset: pMed < 0 ? -1 : pre - pMed,
  };
}

function measureLead(sig: Float32Array, fs: number, beats: BeatFiducials[]): LeadMeasurement {
  const dom = dominantBeat(sig, fs, beats);
  if (!dom) {
    return { ...ZERO_LEAD };
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

  // QRS amplitudes: measured per beat on the raw signal (median across
  // beats) — onset jitter smears sharp deflections on the averaged wave,
  // which would collapse the R of paced/wide complexes.
  const beatR: number[] = [];
  const beatS: number[] = [];
  for (const b of beats) {
    let r = 0;
    let s = 0;
    for (
      let i = Math.max(0, b.qrsOnset - msToSamples(10, fs));
      i <= Math.min(b.j, sig.length - 1);
      i++
    ) {
      const x = sig[i]! - baseline;
      if (x > r) r = x;
      if (x < -s) s = -x;
    }
    beatR.push(r);
    beatS.push(s);
  }
  let rAmp = beatR.length ? median(beatR) : 0;
  let sAmp = beatS.length ? median(beatS) : 0;
  let rIdx = qrsOnset;
  let qAmp = 0;
  let qIdx = qrsOnset;
  {
    let wR = 0;
    for (let i = qrsOnset; i <= j; i++) {
      const x = rel(i);
      if (x > wR) {
        wR = x;
        rIdx = i;
      }
    }
    if (rAmp <= 0 && wR > 0) rAmp = wR;
    if (sAmp <= 0) {
      for (let i = qrsOnset; i <= j; i++) {
        const x = rel(i);
        if (x < -sAmp) sAmp = -x;
      }
    }
  }
  // A Q wave is negativity before the FIRST positive deflection — in an
  // rSR′ complex (RBBB) the S between r and R′ must not count as Q.
  let firstR = rIdx;
  for (let i = qrsOnset; i < rIdx; i++) {
    if (rel(i) > Math.max(0.04, rAmp * 0.1)) {
      firstR = i;
      break;
    }
  }
  for (let i = qrsOnset; i < firstR; i++) {
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
  // Per-lead J refinement: the shared J fiducial can land inside this lead's
  // terminal-QRS slur (multi-lead delineation; wide/paced/ventricular
  // complexes). Walk forward — up to +40 ms — until the slope decays to the
  // ST-segment slope level (estimated 60–100 ms after off) and holds.
  const slopeAt = (i: number) => Math.abs(v(i + 2) - v(i - 2)) / 4;
  let stSlopeEst = 0.001;
  {
    const ss: number[] = [];
    const lo = j + msToSamples(60, fs);
    const hi = Math.min(j + msToSamples(100, fs), wave.length - 2, tEnd);
    for (let i = lo; i < hi; i++) ss.push(slopeAt(i));
    if (ss.length) stSlopeEst = median(ss);
  }
  const slopeTol = Math.max(2.5 * stSlopeEst, 0.003);
  const holdN = msToSamples(10, fs);
  // Collect every sustained-quiet candidate in [j−5, j+40] ms; the J is the
  // one closest in level to the shared fiducial — a very wide complex keeps
  // walking to the ST slur's end, a late multi-lead off stays near home.
  // J is the descent→plateau corner: among sustained-quiet candidates pick
  // the one with the steepest slope in the 15 ms just before it — mid-descent
  // noise flats lose to the real corner, wide slurs still walk forward.
  let jSt = j;
  let corner = 0;
  const preN = msToSamples(15, fs);
  for (let i = Math.max(qrsOnset + 1, j - msToSamples(2, fs)); i <= j + msToSamples(40, fs); i++) {
    let ok = true;
    for (let k = i; k < Math.min(i + holdN, wave.length - 2); k++)
      if (slopeAt(k) > slopeTol) {
        ok = false;
        break;
      }
    if (!ok) continue;
    let pre = 0;
    for (let k = Math.max(0, i - preN); k < i; k++) pre = Math.max(pre, slopeAt(k));
    if (pre > corner) {
      corner = pre;
      jSt = i;
    }
  }
  const stJ = rel(jSt);
  const st60 = rel(jSt + msToSamples(60, fs));
  const st80 = rel(jSt + msToSamples(80, fs));
  const stSlope = (st80 - stJ) / 0.08;

  // T metrics over [junction, tEnd]; junction ≈ 1/3 of the way (§8).
  const junction = Math.round(jSt + (tEnd - jSt) * (110 / 340));
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
  // Anchor the U window to the T peak, not T end: when the delineated T end
  // runs late (T–U fusion in hypokalaemia), a window relative to tEnd
  // misses the U wave entirely.
  const uLo = Math.min(wave.length - 1, tPeak + msToSamples(150, fs));
  const uHi = Math.min(wave.length - 1, tEnd + msToSamples(220, fs));
  for (let i = uLo; i <= uHi; i++) {
    const x = rel(i);
    if (Math.abs(x) > Math.abs(uAmp)) uAmp = x;
  }
  // Per-beat T/U amplitudes (median across beats): alternans and onset
  // jitter damp the averaged wave, which would shrink or inflate these.
  {
    const tAmps: number[] = [];
    for (const b of beats) {
      let ta = 0;
      for (let i = Math.max(0, b.j); i <= Math.min(b.tEnd, sig.length - 1); i++) {
        const x = sig[i]! - baseline;
        if (Math.abs(x) > ta) ta = x;
      }
      tAmps.push(ta);
    }
    if (tAmps.length) tAmp = median(tAmps);
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
 * Measure a lead record given beat fiducials and global interval hints.
 * The fiducial source (generator truth vs independent delineation) is
 * irrelevant — this is the path the rule engine reads.
 */
export function measureSignal(input: MeasureInput): Measurements {
  const perLead = {} as Record<LeadId, LeadMeasurement>;
  for (const id of LEAD_IDS) {
    const sig = input.leads[id];
    perLead[id] = sig ? measureLead(sig, input.fs, input.beats) : { ...ZERO_LEAD };
  }

  const rrMs = input.rrMs ?? 0;
  const hrBpm = rrMs > 0 ? 60000 / rrMs : 60;
  const qt = input.qtMs ?? 0;
  const qtcBazett = rrMs > 0 ? qt / Math.sqrt(rrMs / 1000) : qt;
  const prMs = input.prMs ?? -1;
  const qrsWide = LEAD_IDS.some((l) => perLead[l].qrsDurMs >= 120);

  const net = (l: LeadId) => perLead[l].rAmp - perLead[l].sAmp;
  const qrsAxisDeg = input.qrsAxisDeg ?? (Math.atan2(net('aVF'), net('I')) * 180) / Math.PI;
  const tAxisDeg = input.tAxisDeg ?? (Math.atan2(perLead.aVF.tAmp, perLead.I.tAmp) * 180) / Math.PI;

  return { perLead, qt, qtcBazett, prMs, hrBpm, qrsAxisDeg, tAxisDeg, qrsWide };
}

/**
 * Fiducial-based reference measurement — used ONLY as the audit reference
 * for the blind path; never fed to the rule engine.
 */
export function measureEcg(ecg: Ecg12, source: 'clean' | 'acquired' = 'clean'): Measurements {
  // Dominant morphology: most frequent non-PVC kind (escape/aivr rhythms are
  // measured on their own beats, §8).
  const counts = new Map<string, number>();
  for (const b of ecg.beats) {
    if (b.kind === 'pvc') continue;
    counts.set(b.kind, (counts.get(b.kind) ?? 0) + 1);
  }
  const dominantType = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'sinus';
  const sinus = ecg.beats.filter((b) => b.kind === dominantType);
  const beats: BeatFiducials[] = sinus.map((b) => ({
    pOnset: b.pOnset,
    qrsOnset: b.qrsOnset,
    j: b.j,
    tEnd: b.tEnd,
  }));
  const leads = source === 'acquired' ? ecg.leads : ecg.clean;
  const rrMs = median(
    sinus.slice(1).map((b, i) => (b.qrsOnset - sinus[i]!.qrsOnset) / (ecg.fs / 1000)),
  );
  const rep = sinus[Math.floor(sinus.length / 2)] ?? ecg.beats[0];
  const qtMs = rep ? ((rep.tEnd - rep.qrsOnset) / ecg.fs) * 1000 : 0;
  const prMs = rep && rep.pOnset >= 0 ? ((rep.qrsOnset - rep.pOnset) / ecg.fs) * 1000 : -1;
  return measureSignal({
    fs: ecg.fs,
    leads,
    beats,
    rrMs: rrMs > 0 ? rrMs : null,
    prMs: prMs >= 0 ? prMs : null,
    qtMs,
    qrsAxisDeg: null,
    tAxisDeg: null,
  });
}
