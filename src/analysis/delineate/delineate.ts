import { detectVentricularCandidates } from './candidates.js';
import type { DelineationInput } from './impulses.js';
import { suppressImpulses, CORE_LEADS } from './impulses.js';
import { circularMedian, median, spreadCv } from './statistics.js';
import { evidence, unavailable, type Evidence } from './evidence.js';

export interface DelineatedBeat {
  rOnsetS: number;
  qrsOnsetS: number;
  qrsEndS: number;
  pOnsetS?: number;
  tEndS?: number;
  paced: boolean;
}

export interface Delineation {
  fs: number;
  beats: DelineatedBeat[];
  rrMs: number[];
  hrBpm: number | null;
  prMs: number | null;
  qrsMs: number | null;
  qtMs: number | null;
  qtc: {
    bazett: number | null;
    fridericia: number | null;
    framingham: number | null;
    hodges: number | null;
  };
  axisDeg: { p: number | null; qrs: number | null; t: number | null };
  atrialRateBpm: number | null;
  rhythmRegularity: 'regular' | 'regularly-irregular' | 'irregular' | 'none';
  pacingSpikes: number[];
  noiseMv: number;
  evidence: {
    hr: Evidence;
    pr: Evidence;
    qrs: Evidence;
    qt: Evidence;
    axis: Evidence;
    atrialRate: Evidence;
  };
  quality: string;
}

const empty = (
  fs: number,
  note = 'No se reconocen suficientes complejos para medir.',
): Delineation => ({
  fs,
  beats: [],
  rrMs: [],
  hrBpm: null,
  prMs: null,
  qrsMs: null,
  qtMs: null,
  qtc: { bazett: null, fridericia: null, framingham: null, hodges: null },
  axisDeg: { p: null, qrs: null, t: null },
  atrialRateBpm: null,
  rhythmRegularity: 'none',
  pacingSpikes: [],
  noiseMv: 0,
  evidence: {
    hr: unavailable(note),
    pr: unavailable('P no reconocible o sin relación AV estable.'),
    qrs: unavailable('Límites QRS no reconocibles.'),
    qt: unavailable('Final de T no reconocible.'),
    axis: unavailable('QRS no delineable.'),
    atrialRate: unavailable('No hay tres ondas P regulares.'),
  },
  quality: note,
});

function axis(i: number, ii: number): number {
  return (Math.atan2(ii, i) * 180) / Math.PI;
}

/** Independent sample-domain delineator. It never reads schedule/fiducials. */
export function delineate(input: DelineationInput, opts: { windowS?: number } = {}): Delineation {
  const fs = input.fs;
  const names = CORE_LEADS.filter((l) => input.leads[l] !== undefined);
  if (names.length < 2) return empty(fs, 'No hay suficientes derivaciones para delinear.');
  const n = Math.min(input.leads[names[0]!]!.length, Math.round((opts.windowS ?? 10) * fs));
  const limited: DelineationInput = { fs, leads: { ...input.leads } };
  const suppressed = suppressImpulses(limited);
  const candidates = detectVentricularCandidates(suppressed.signal);
  const peaks = candidates.peaks.filter((p) => p < n);
  if (peaks.length < 2) {
    const d = empty(fs);
    d.pacingSpikes = suppressed.spikes;
    return d;
  }
  const beats: DelineatedBeat[] = [];
  const prs: number[] = [];
  const qrses: number[] = [];
  const qts: number[] = [];
  const qrsAxes: number[] = [];
  const pAxes: number[] = [];
  const tAxes: number[] = [];
  const signal = suppressed.signal.leads;
  const magnitude = (i: number) =>
    Math.hypot(...names.map((l) => signal[l]![Math.max(0, Math.min(n - 1, i))]!));
  const slope = (i: number) =>
    Math.hypot(
      ...names.map(
        (l) => ((signal[l]![Math.min(n - 1, i + 2)]! - signal[l]![Math.max(0, i - 2)]!) * fs) / 4,
      ),
    );
  const baseline = (center: number) =>
    names.map((l) => {
      const lo = Math.max(0, center - Math.round(0.06 * fs));
      const hi = Math.max(lo + 1, center - Math.round(0.02 * fs));
      return median(Array.from(signal[l]!.slice(lo, hi)));
    });
  for (let k = 1; k < peaks.length - 1; k++) {
    const p = peaks[k]!;
    const prev = peaks[k - 1]!;
    const next = peaks[k + 1]!;
    const b = baseline(p);
    const onsetLo = Math.max(prev + Math.round(0.1 * fs), p - Math.round(0.2 * fs));
    const endHi = Math.min(next - Math.round(0.12 * fs), p + Math.round(0.25 * fs));
    let on = p;
    let off = p;
    const amp = Math.max(
      ...Array.from({ length: Math.max(1, endHi - onsetLo) }, (_, j) => magnitude(onsetLo + j)),
    );
    const threshold = Math.max(0.015, amp * 0.06);
    for (let i = p; i > onsetLo; i--)
      if (magnitude(i) < threshold * 1.7 && slope(i) < 0.12 * fs) {
        on = i;
        break;
      }
    for (let i = p; i < endHi; i++)
      if (magnitude(i) < threshold && slope(i) < 0.12 * fs) {
        off = i;
        break;
      }
    if (off <= on || (off - on) / fs < 0.035 || (off - on) / fs > 0.3) {
      on = Math.max(onsetLo, p - Math.round(0.04 * fs));
      off = Math.min(endHi, p + Math.round(0.1 * fs));
    }
    const rr = (p - prev) / fs;
    const pLo = Math.max(
      prev + Math.round(0.06 * fs),
      on - Math.round(Math.min(0.35, rr * 0.45) * fs),
    );
    const pHi = on - Math.round(0.03 * fs);
    let pp = pLo;
    for (let i = pLo; i < pHi; i++) if (magnitude(i) > magnitude(pp)) pp = i;
    const pAmp = magnitude(pp);
    const pOn =
      pAmp > Math.max(0.035, amp * 0.035) ? Math.max(pLo, pp - Math.round(0.055 * fs)) : undefined;
    const tLo = off + Math.round(0.04 * fs);
    const tHi = Math.min(
      next - Math.round(0.08 * fs),
      p + Math.round(Math.min(0.85, rr * 0.8) * fs),
    );
    let tp = tLo;
    for (let i = tLo; i < tHi; i++) if (magnitude(i) > magnitude(tp)) tp = i;
    let te = tp;
    const tThreshold = Math.max(0.01, magnitude(tp) * 0.16);
    for (let i = tp; i < tHi; i++)
      if (magnitude(i) < tThreshold && slope(i) < 0.08 * fs) {
        te = i;
        break;
      }
    if (te <= tp + 2) te = Math.min(tHi, tp + Math.round(0.2 * fs));
    const iVal = signal.I![p]! - b[0]!;
    const iiVal = signal.II![p]! - b[1]!;
    qrsAxes.push(axis(iVal, iiVal));
    if (pOn !== undefined) {
      prs.push(((on - pOn) * 1000) / fs);
      pAxes.push(axis(signal.I![pp]! - b[0]!, signal.II![pp]! - b[1]!));
    }
    qrses.push(((off - on) * 1000) / fs);
    qts.push(((te - on) * 1000) / fs);
    tAxes.push(axis(signal.I![tp]! - b[0]!, signal.II![tp]! - b[1]!));
    beats.push({
      rOnsetS: p / fs,
      qrsOnsetS: on / fs,
      qrsEndS: off / fs,
      ...(pOn !== undefined ? { pOnsetS: pOn / fs } : {}),
      ...(te > tp ? { tEndS: te / fs } : {}),
      paced: suppressed.spikes.some((s) => Math.abs(s - p / fs) < 0.04),
    });
  }
  const rrMs = peaks.slice(1).map((p, i) => ((p - peaks[i]!) * 1000) / fs);
  const hr = rrMs.length ? 60000 / median(rrMs) : null;
  const regularity =
    rrMs.length < 2
      ? 'none'
      : spreadCv(rrMs) < 0.06
        ? 'regular'
        : spreadCv(rrMs) >= 0.12
          ? 'irregular'
          : 'regularly-irregular';
  const pr = prs.length ? median(prs) : null;
  const qrs = qrses.length ? median(qrses) : null;
  const qt = qts.length ? median(qts) : null;
  const rr = rrMs.length ? median(rrMs) / 1000 : null;
  // Independent atrial scan: look for repeatable positive activity in II
  // outside ventricular/T-wave windows. This is deliberately separate from
  // the P-to-QRS association above, so complete AV block can expose its P
  // rate while AF remains irregular/unavailable.
  const atrialLead = signal.II;
  const initialAtrial = Array.from(atrialLead!.slice(0, Math.min(n, Math.round(0.8 * fs)))).sort(
    (a, b) => a - b,
  );
  const atrialBaseline = initialAtrial[Math.floor(initialAtrial.length * 0.2)] ?? 0;
  const atrialPeaks: number[] = [];
  for (let i = Math.round(0.06 * fs); i < n - Math.round(0.06 * fs); i++) {
    if (peaks.some((q) => Math.abs(i - q) < Math.round(0.12 * fs))) continue;
    const av = Math.abs(atrialLead![i]! - atrialBaseline);
    const avPrev = Math.abs(atrialLead![i - 1]! - atrialBaseline);
    const avNext = Math.abs(atrialLead![i + 1]! - atrialBaseline);
    if (av <= 0.025 || av > 0.22 || av < avPrev || av <= avNext) continue;
    const last = atrialPeaks.at(-1);
    if (last === undefined || i - last > Math.round(0.18 * fs)) atrialPeaks.push(i);
  }
  const atrialPs = atrialPeaks.map((x) => x / fs);
  const pIntervals = atrialPs.slice(1).map((x, i) => x - atrialPs[i]!);
  const intervalBins = new Map<number, number>();
  for (const interval of pIntervals) {
    const bin = Math.round(interval / 0.05);
    intervalBins.set(bin, (intervalBins.get(bin) ?? 0) + 1);
  }
  const dominantBin = [...intervalBins.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  // In complete AV block every other P may fall inside the ventricular mask,
  // so the surviving histogram can be centred on 2×PP. Prefer the smallest
  // well-supported bin when the dominant one looks like a multiple of it.
  const sortedBins = [...intervalBins.entries()].sort((a, b) => a[0] - b[0]);
  let chosenBin = dominantBin;
  if (dominantBin) {
    for (const [bin, count] of sortedBins) {
      if (bin >= dominantBin[0]) break;
      if (count < 3) continue;
      const ratio = dominantBin[0] / bin;
      if (Math.abs(ratio - Math.round(ratio)) < 0.15 && Math.round(ratio) >= 2) {
        chosenBin = [bin, count];
        break;
      }
    }
  }
  const dominantP = chosenBin && chosenBin[1] >= 2 ? chosenBin[0] * 0.05 : null;
  let atrialRateBpm =
    dominantP !== null &&
    dominantP > 0 &&
    (spreadCv(pIntervals) < 0.2 || dominantBin![1] >= Math.max(2, pIntervals.length * 0.4))
      ? 60 / dominantP
      : null;
  if (atrialRateBpm === null) {
    let bestLag = 0;
    let bestCorr = 0;
    const lead = signal.II!;
    for (let lag = Math.round(0.14 * fs); lag <= Math.round(0.3 * fs); lag += 2) {
      let xy = 0;
      let xx = 0;
      let yy = 0;
      for (let i = lag; i < n; i += 3) {
        const x = lead[i]!;
        const y = lead[i - lag]!;
        xy += x * y;
        xx += x * x;
        yy += y * y;
      }
      const corr = xy / Math.sqrt(xx * yy || 1);
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }
    const spectralRate = bestLag ? (60 * fs) / bestLag : 0;
    if (bestCorr > 0.55 && spectralRate >= 240 && spectralRate <= 350) atrialRateBpm = spectralRate;
  }
  const noiseVals: number[] = [];
  for (const b of beats) {
    const i = Math.round(b.qrsOnsetS * fs);
    for (let j = Math.max(1, i - Math.round(0.15 * fs)); j < i - Math.round(0.08 * fs); j++)
      noiseVals.push(
        ...names.map((l) => signal[l]![j]! - 2 * signal[l]![j - 1]! + signal[l]![j - 2]!),
      );
  }
  const noiseMv = noiseVals.length
    ? Math.sqrt(noiseVals.reduce((s, x) => s + x * x, 0) / noiseVals.length)
    : 0;
  const ev = {
    hr: evidence(
      rrMs.map((x) => x / 1000),
      rrMs.length,
      0.15,
      'Frecuencia media entre complejos detectados.',
    ),
    pr: evidence(prs, beats.length, 25, 'P y QRS reproducibles.'),
    qrs: evidence(qrses, beats.length, 20, 'Límites QRS reproducibles.'),
    qt: evidence(qts, beats.length, 40, 'Final de T reconocible.'),
    axis: evidence(qrsAxes, beats.length, 25, 'Eje QRS reproducible.'),
    atrialRate:
      atrialRateBpm === null
        ? unavailable('No hay tres ondas P regulares.')
        : evidence(pIntervals, atrialPs.length, 0.08, 'Ondas P regulares.'),
  };
  return {
    fs,
    beats,
    rrMs,
    hrBpm: hr,
    prMs: pr,
    qrsMs: qrs,
    qtMs: qt,
    qtc: {
      bazett: qt !== null && rr !== null ? qt / Math.sqrt(rr) : null,
      fridericia: qt !== null && rr !== null ? qt / Math.cbrt(rr) : null,
      framingham: qt !== null && rr !== null ? qt + 154 * (1 - rr) : null,
      hodges: qt !== null && hr !== null ? qt + 1.75 * (hr - 60) : null,
    },
    axisDeg: {
      p: pAxes.length ? circularMedian(pAxes) : null,
      qrs: qrsAxes.length ? circularMedian(qrsAxes) : null,
      t: tAxes.length ? circularMedian(tAxes) : null,
    },
    atrialRateBpm,
    rhythmRegularity: regularity,
    pacingSpikes: suppressed.spikes,
    noiseMv,
    evidence: ev,
    quality:
      beats.length >= 3
        ? 'Delineación independiente de muestras; revisa métricas en trazados ruidosos.'
        : 'Pocos complejos para una delineación robusta.',
  };
}
