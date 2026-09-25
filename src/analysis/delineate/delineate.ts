import { detectVentricularCandidates } from './candidates.js';
import type { DelineationInput } from './impulses.js';
import { suppressImpulses, CORE_LEADS } from './impulses.js';
import { circularMedian, median, spreadCv, spread } from './statistics.js';
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
  // Leads/scale for the per-window P score.
  const P_LEADS = ['II', 'aVR', 'V1', 'I'] as const;
  const P_SCALE: Record<string, number> = { I: 0.08, II: 0.12, aVR: 0.1, V1: 0.09 };
  const availP = P_LEADS.filter((l) => signal[l] !== undefined);
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
    // QRS edges: forward/backward from the dominant peak, the first sample
    // where the multi-lead slope energy stays below 8% of the beat's peak
    // energy for ≥12 ms (robust on wide ventricular complexes).
    const quietN = Math.max(2, Math.ceil(0.012 * fs));
    // Smoothed slope energy (~6 ms box) so a single fast sample cannot
    // break the ≥12 ms quiet run.
    const eSmooth = (i: number) => {
      let s = 0;
      let c = 0;
      for (let j = i - Math.round(0.003 * fs); j <= i + Math.round(0.003 * fs); j++) {
        if (j >= 0 && j < n) {
          s += slope(j);
          c++;
        }
      }
      return s / Math.max(1, c);
    };
    const energies: number[] = [];
    for (let i = onsetLo; i < endHi; i++) energies.push(eSmooth(i));
    const ePeak = Math.max(...energies);
    const eFloor = [...energies].sort((a, b) => a - b)[Math.floor(energies.length * 0.1)] ?? 0;
    const quiet = eFloor + 0.08 * (ePeak - eFloor);
    let on = p;
    let off = p;
    for (let i = p; i > onsetLo; i--) {
      let ok = true;
      for (let j = i; j < Math.min(i + quietN, n); j++)
        if (eSmooth(j) >= quiet) {
          ok = false;
          break;
        }
      if (ok) {
        on = i;
        break;
      }
    }
    for (let i = p; i < endHi; i++) {
      let ok = true;
      for (let j = i; j < Math.min(i + quietN, n); j++)
        if (eSmooth(j) >= quiet) {
          ok = false;
          break;
        }
      if (ok) {
        off = i;
        break;
      }
    }
    // Refine each edge to the 12%-of-peak energy crossing — the quiet-run
    // boundary overshoots the true edge while the ST-T slope tail decays.
    const hiOn = eFloor + 0.12 * (ePeak - eFloor);
    let onRef = on + quietN;
    for (let i = on; i < Math.min(on + quietN + Math.round(0.04 * fs), n); i++)
      if (eSmooth(i) >= hiOn) {
        onRef = i;
        break;
      }
    on = onRef;
    // A sustained discordant ST-T tail (LBBB/paced morphologies) keeps the
    // post-crossing energy elevated: use a higher fraction there, and a
    // lower one where the energy decays cleanly after the J point.
    let sustained = 0;
    let tailN = 0;
    for (let i = Math.max(p, off - Math.round(0.06 * fs)); i < off; i++) {
      tailN++;
      if (eSmooth(i) > 0.1 * ePeak) sustained++;
    }
    const offFrac = tailN > 0 && sustained / tailN > 0.7 ? 0.18 : null;
    if (offFrac !== null) {
      const hiOff = eFloor + offFrac * (ePeak - eFloor);
      for (let i = off; i > p; i--)
        if (eSmooth(i) >= hiOff) {
          off = i + 1;
          break;
        }
      // Deep-dip-then-rebound: a ventricular tail that truly goes quiet
      // (<5% peak) then rises again (>12%) belongs to the complex — the
      // true J sits at the end of the tail, cross at 10% instead.
      let dipped = false;
      let rebounded = false;
      for (let i = off; i < Math.min(off + Math.round(0.09 * fs), endHi); i++) {
        if (eSmooth(i) < 0.05 * ePeak) dipped = true;
        if (dipped && eSmooth(i) > 0.12 * ePeak) rebounded = true;
      }
      if (rebounded) {
        const hiOff2 = eFloor + 0.1 * (ePeak - eFloor);
        for (let i = Math.min(off + Math.round(0.09 * fs), endHi); i > p; i--)
          if (eSmooth(i) >= hiOff2) {
            off = i + 1;
            break;
          }
      }
    } else {
      // Clean decay: the quiet run starts ~12 ms before the isoelectric J.
      off += quietN;
    }
    off = Math.min(off, on + Math.round(0.2 * fs));
    on = Math.max(on, off - Math.round(0.2 * fs));
    if (off <= on || (off - on) / fs < 0.035 || (off - on) / fs > 0.3) {
      on = Math.max(onsetLo, p - Math.round(0.04 * fs));
      off = Math.min(endHi, p + Math.round(0.1 * fs));
    }
    const rr = (p - prev) / fs;
    // P search: |signal| scored across II/aVR/V1/I in [on−260, on−60] ms,
    // excluding the previous beat's QRS-onset−40 … tEnd+40 window so a
    // merged STE/hyperacute-T plateau cannot masquerade as a P wave.
    const prevBeat = beats.at(-1);
    const prevEnd = prevBeat?.tEndS ?? prevBeat?.qrsEndS;
    const pLo = Math.max(
      on - Math.round(0.26 * fs),
      prevEnd !== undefined ? Math.round(prevEnd * fs) + Math.round(0.04 * fs) : 0,
      prevBeat !== undefined ? Math.round(prevBeat.qrsOnsetS * fs) - Math.round(0.04 * fs) : 0,
    );
    const pHi = on - Math.round(0.06 * fs);
    // Local floor per P lead over this window: the P bump is scored as a
    // deviation from the window's own baseline, so a sustained STE
    // plateau does not win the argmax.
    const locBase = availP.map((l) => {
      const w = Array.from(signal[l]!.slice(Math.max(0, pLo), Math.max(pLo + 1, pHi))).sort(
        (a, b) => a - b,
      );
      return w[Math.floor(w.length * 0.25)] ?? 0;
    });
    const pScore = (i: number) =>
      Math.hypot(
        ...availP.map((l, k) => Math.abs(signal[l]![i]! - locBase[k]!) / (P_SCALE[l] ?? 0.1)),
      );
    // Largest in-range P score wins; samples scoring above the T-wave
    // ceiling (STE plateau, discordant T) are skipped, not allowed to win.
    let pp = -1;
    for (let i = pLo; i < pHi; i++) {
      const s = pScore(i);
      if (s > 2.9) continue;
      if (pp < 0 || s > pScore(pp)) pp = i;
    }
    const pAmpScore = pp >= 0 && availP.length ? pScore(pp) : 0;
    const pMag = pp >= 0 ? magnitude(pp) : 0;
    const pOn =
      pAmpScore > 0.8 && pMag > 0.035 ? Math.max(pLo, pp - Math.round(0.055 * fs)) : undefined;
    const tLo = off + Math.round(0.04 * fs);
    const tHi = Math.min(
      next - Math.round(0.08 * fs),
      p + Math.round(Math.min(0.85, rr * 0.8) * fs),
    );
    // T peak: the last local maximum of magnitude — under STE the ST
    // plateau is elevated early, so a global argmax lands on the plateau.
    let gMax = 0;
    for (let i = tLo; i < tHi; i++) gMax = Math.max(gMax, magnitude(i));
    let tp = -1;
    for (let i = tHi - 2; i > tLo + 2; i--) {
      if (
        magnitude(i) > 0.45 * gMax &&
        magnitude(i) >= magnitude(i - 1) &&
        magnitude(i) >= magnitude(i + 1)
      ) {
        tp = i;
        break;
      }
    }
    if (tp < 0) {
      tp = tLo;
      for (let i = tLo; i < tHi; i++) if (magnitude(i) > magnitude(tp)) tp = i;
    }
    // T end — tangent method on the T downslope: take the steepest
    // descent after tp, then intersect its slope with the isoelectric
    // baseline. Robust where the T merges with an elevated ST plateau.
    let md = tp;
    let dMin = 0;
    for (let i = tp + 2; i < tHi - 2; i++) {
      const dS = magnitude(i + 2) - magnitude(i - 2); // per 4 samples
      if (dS < dMin) {
        dMin = dS;
        md = i;
      }
    }
    // T foot floor: lowest magnitude between J and the T peak — under STE
    // the tangent must aim at the floor, not absolute zero.
    let floor = Infinity;
    for (let i = tLo; i <= md; i++) floor = Math.min(floor, magnitude(i));
    if (!Number.isFinite(floor)) floor = 0;
    let te = tp;
    if (dMin < 0) {
      const vAboveBase = Math.max(0, magnitude(md) - floor);
      // samples until the tangent crosses the floor: v / slope-per-sample
      te = md + Math.round((4 * vAboveBase) / Math.abs(dMin));
      if (te > tHi) te = tHi;
      if (te < tp) te = tp + Math.round(0.02 * fs);
    } else {
      const tThreshold = Math.max(0.01, magnitude(tp) * 0.16);
      for (let i = tp; i < tHi; i++)
        if (magnitude(i) < tThreshold && slope(i) < 0.08 * fs) {
          te = i;
          break;
        }
      if (te <= tp + 2) te = Math.min(tHi, tp + Math.round(0.2 * fs));
    }
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
  // Regularity: CV < 0.08 regular; ≥ 0.12 irregular; between → 'regular'
  // unless the RR sequence repeats (autocorr lag 2–4 > 0.6 → patterned).
  const rrAuto = (lag: number) => {
    if (rrMs.length <= lag + 2) return 0;
    const m = rrMs.reduce((s, x) => s + x, 0) / rrMs.length;
    let xy = 0;
    let xx = 0;
    for (let i = lag; i < rrMs.length; i++) {
      xy += (rrMs[i]! - m) * (rrMs[i - lag]! - m);
      xx += (rrMs[i - lag]! - m) ** 2;
    }
    return xx > 0 ? xy / xx : 0;
  };
  const cv = spreadCv(rrMs);
  const patterned = rrMs.length >= 5 && [2, 3, 4].some((lag) => Math.abs(rrAuto(lag)) > 0.6);
  const regularity =
    rrMs.length < 2
      ? 'none'
      : cv >= 0.12
        ? 'irregular'
        : cv < 0.08
          ? 'regular'
          : patterned
            ? 'regularly-irregular'
            : 'regular';
  const pr = prs.length ? median(prs) : null;
  const qrs = qrses.length ? median(qrses) : null;
  const qt = qts.length ? median(qts) : null;
  const rr = rrMs.length ? median(rrMs) / 1000 : null;
  // Independent atrial scan: look for repeatable positive activity in II
  // outside ventricular/T-wave windows. This is deliberately separate from
  // the P-to-QRS association above, so complete AV block can expose its P
  // rate while AF remains irregular/unavailable.
  // Independent atrial scan (polarity-agnostic): score |signal| normalised by
  // a typical P amplitude per lead so inverted P (dextrocardia, ectopic
  // atria) still counts, while T waves (~2× P in every lead) fall above the
  // upper bound.
  const ATRIAL_LEADS = ['II', 'aVR', 'V1', 'I'] as const;
  const P_TYP: Record<string, number> = { I: 0.08, II: 0.12, aVR: 0.1, V1: 0.09 };
  const atrialLeads = ATRIAL_LEADS.filter((l) => signal[l] !== undefined);
  const atrialBase = atrialLeads.map((l) => {
    const w = Array.from(signal[l]!.slice(0, Math.min(n, Math.round(0.8 * fs)))).sort(
      (a, b) => a - b,
    );
    return w[Math.floor(w.length * 0.2)] ?? 0;
  });
  const aScore = (i: number) =>
    Math.hypot(
      ...atrialLeads.map((l, k) => Math.abs(signal[l]![i]! - atrialBase[k]!) / (P_TYP[l] ?? 0.1)),
    );
  const atrialPeaks: number[] = [];
  for (let i = Math.round(0.06 * fs); i < n - Math.round(0.06 * fs); i++) {
    if (peaks.some((q) => Math.abs(i - q) < Math.round(0.12 * fs))) continue;
    const av = aScore(i);
    // Mask the QRS–T window for large deflections only: a discordant T
    // (LBBB/ventricular morphologies) outscores the P otherwise and halves
    // the detected atrial interval; a real P landing inside the T window is
    // still small enough to pass.
    if (
      av > 2.2 &&
      beats.some(
        (b) => i >= b.qrsOnsetS * fs - Math.round(0.02 * fs) && i <= (b.tEndS ?? b.qrsEndS) * fs,
      )
    )
      continue;
    if (av <= 0.8 || av > 2.9 || av < aScore(i - 1) || av <= aScore(i + 1)) continue;
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
  // PR evidence tiers: 'usable' needs a P associated in ≥80% of beats and
  // spread (p90−p10) ≤ 30 ms; 'review' for 50–80% coverage or ≤60 ms
  // spread; otherwise 'unavailable' and prMs is null.
  const prCoverage = beats.length ? prs.length / beats.length : 0;
  const prSpread = prs.length > 1 ? spread(prs) : 0;
  const prUsable = prs.length >= 3 && prCoverage >= 0.8 && prSpread <= 30;
  const prReview = !prUsable && prs.length > 0 && (prCoverage >= 0.5 || prSpread <= 60);
  const prEvidence: Evidence = prUsable
    ? { status: 'usable', note: 'P y QRS reproducibles.' }
    : prReview
      ? { status: 'review', note: 'Relación P–QRS parcial: revisa el trazado.' }
      : unavailable('P no reconocible o sin relación AV estable.');
  const ev = {
    hr: evidence(
      rrMs.map((x) => x / 1000),
      rrMs.length,
      0.15,
      'Frecuencia media entre complejos detectados.',
    ),
    pr: prEvidence,
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
    prMs: prUsable || prReview ? pr : null,
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
