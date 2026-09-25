import type { LeadId } from '../engine/index.js';
import { median } from './delineate/statistics.js';
import type { Delineation } from './delineate/delineate.js';
import { measureSignal, type BeatFiducials, type Measurements } from './measure.js';

/**
 * Blind measurement adapter (MODEL.md §8): converts the independent,
 * sample-domain `Delineation` into fiducials for `measureSignal`. Beat
 * selection uses no generator truth: dominant morphology is inferred from
 * per-beat QRS width and preceding RR — a premature (RR < 0.85·median) AND
 * wide (w > median + 20 ms) beat is ectopic and is excluded, as is any beat
 * whose width deviates > 40 ms from the median. If fewer than 2 beats
 * survive the filter, all delineated beats are used — unless a large beat
 * set (> 6) filtered down that far, which means there is no dominant
 * morphology at all (e.g. VF): then there is nothing measurable and the
 * fiducial set is empty (all-zero measurements).
 */
export function measureFromDelineation(
  d: Delineation,
  leads: Partial<Record<LeadId, Float32Array>>,
  fs: number,
): Measurements {
  // Per-beat width (ms) and preceding RR (ms) from delineated times.
  const widths = d.beats.map((b) => (b.qrsEndS - b.qrsOnsetS) * 1000);
  const rrs = d.beats.map((b, i) => (i === 0 ? NaN : (b.rOnsetS - d.beats[i - 1]!.rOnsetS) * 1000));
  const wMed = median(widths);
  const rrMed = median(d.beats.map((b, i) => rrs[i]!).filter((r) => Number.isFinite(r)));

  const keep = d.beats.map((b, i) => {
    const ectopic = rrs[i]! < 0.85 * rrMed && widths[i]! > wMed + 20;
    const offWidth = Math.abs(widths[i]! - wMed) > 40;
    return !ectopic && !offWidth;
  });
  const kept = d.beats.filter((_, i) => keep[i]);
  const selected = kept.length >= 2 ? kept : d.beats.length <= 6 ? d.beats : [];
  // Dominant-morphology check: an irregular rhythm whose QRS segments do not
  // correlate with the median segment (coarse VF, chaotic rhythms) has no
  // measurable ST/QRS — return empty fiducials rather than measuring noise.
  let measurable = selected;
  if (d.rhythmRegularity === 'irregular' && selected.length >= 4) {
    const pad = Math.round(0.01 * fs);
    const corr = (a: number[], b: number[]) => {
      const len = Math.min(a.length, b.length);
      const ma = a.slice(0, len).reduce((s, x) => s + x, 0) / len;
      const mb = b.slice(0, len).reduce((s, x) => s + x, 0) / len;
      let xy = 0;
      let xx = 0;
      let yy = 0;
      for (let i = 0; i < len; i++) {
        xy += (a[i]! - ma) * (b[i]! - mb);
        xx += (a[i]! - ma) ** 2;
        yy += (b[i]! - mb) ** 2;
      }
      return xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0;
    };
    // Median per-beat/median-segment correlation across all leads: a chaotic
    // rhythm decorrelates everywhere; organized AF/VT correlates ~1.
    const leadCorrs: number[] = [];
    for (const l of Object.keys(leads) as LeadId[]) {
      const sig = leads[l]!;
      const segs = selected
        .map((b) =>
          Array.from(
            sig.slice(
              Math.max(0, Math.round(b.qrsOnsetS * fs) - pad),
              Math.min(sig.length, Math.round(b.qrsEndS * fs) + pad),
            ),
          ),
        )
        .filter((s) => s.length >= 4);
      if (segs.length < 4) continue;
      const len = Math.min(...segs.map((s) => s.length));
      const med = Array.from({ length: len }, (_, i) => median(segs.map((s) => s[i]!)));
      leadCorrs.push(median(segs.map((s) => corr(s, med))));
    }
    // Coarse VF decorrelates strongly in the limb leads while staying
    // quasi-coherent in precordials — either a low median correlation or ≥4
    // decorrelated leads means no dominant organized complex.
    const chaotic =
      leadCorrs.length > 0 &&
      (median(leadCorrs) < 0.6 || leadCorrs.filter((c) => c < 0.4).length >= 4);
    if (chaotic) measurable = [];
  }

  // Representative tEnd: median duration among beats that delineated a T.
  const tDur = measurable
    .filter((b) => b.tEndS !== undefined)
    .map((b) => (b.tEndS! - b.qrsOnsetS) * 1000);
  const tMed = tDur.length ? median(tDur) : null;

  const beats: BeatFiducials[] = measurable.map((b) => {
    const qrsOnset = Math.round(b.qrsOnsetS * fs);
    const j = Math.round(b.qrsEndS * fs);
    const tEnd =
      b.tEndS !== undefined
        ? Math.round(b.tEndS * fs)
        : tMed !== null
          ? qrsOnset + Math.round((tMed * fs) / 1000)
          : j + Math.round(0.32 * fs);
    return {
      pOnset: b.pOnsetS !== undefined ? Math.round(b.pOnsetS * fs) : -1,
      qrsOnset,
      j,
      tEnd,
    };
  });

  return measureSignal({
    fs,
    leads,
    beats,
    rrMs: d.rrMs.length ? median(d.rrMs) : null,
    prMs: d.prMs,
    qtMs: d.qtMs,
    qrsAxisDeg: d.axisDeg.qrs,
    tAxisDeg: d.axisDeg.t,
  });
}
