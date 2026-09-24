import { CORE_LEADS, type DelineationInput } from './impulses.js';

/**
 * Ventricular candidate detector — sample-domain only. Port of ECG Lab v1.3
 * analysis/ventricular-candidates.ts adapted to the OMI lead set (uses I, II,
 * V1, V5 when present). Return peaks are sample indices.
 */
const quant = (a: number[], p: number) =>
  a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] ?? 0;

function shape(s: DelineationInput, i: number, names: readonly (keyof typeof s.leads)[]) {
  const fs = s.fs;
  const n = s.leads[names[0]!]!.length;
  const mat: number[][] = Array.from({ length: names.length }, () =>
    Array<number>(names.length).fill(0),
  );
  let vel = 0;
  let acc = 0;
  const radius = Math.round(0.08 * fs);
  const half = Math.max(1, Math.round(0.004 * fs));
  for (let j = Math.max(half, i - radius); j < Math.min(n - half, i + radius); j++) {
    const v = names.map((l) => s.leads[l]![j + half]! - s.leads[l]![j - half]!);
    for (let a = 0; a < names.length; a++) {
      for (let b = 0; b < names.length; b++) mat[a]![b]! += v[a]! * v[b]!;
    }
    vel += Math.hypot(...v);
    acc += Math.hypot(
      ...names.map((l) => s.leads[l]![j + half]! - 2 * s.leads[l]![j]! + s.leads[l]![j - half]!),
    );
  }
  let q = names.map(() => 0.5);
  for (let k = 0; k < 25; k++) {
    const v = mat.map((row) => row.reduce((sum, x, j) => sum + x * q[j]!, 0));
    const norm = Math.hypot(...v);
    q = v.map((x) => x / (norm || 1));
  }
  const eigen = q.reduce(
    (sum, x, i2) => sum + x * mat[i2]!.reduce((s2, x2, j) => s2 + x2 * q[j]!, 0),
    0,
  );
  const trace = mat.reduce((s2, row, i2) => s2 + row[i2]!, 0);
  if (!trace || !vel) return { rank: 1, rough: Infinity };
  return { rank: 1 - eigen / trace, rough: acc / vel };
}

export function detectVentricularCandidates(
  s: DelineationInput,
  { medianWidth = 0.014, candidateFraction = 0.35, tReject = true } = {},
) {
  const fs = s.fs;
  const names = CORE_LEADS.filter((l) => s.leads[l] !== undefined);
  const n = names.length ? Math.min(s.leads[names[0]!]!.length, Math.round(10 * fs)) : 0;
  const empty = { peaks: [] as number[], energy: new Float64Array(0), threshold: 0 };
  if (names.length < 2 || n < fs) return empty;
  let short = 0;
  let long = 0;
  const shortSlope = new Float64Array(n);
  const longSlope = new Float64Array(n);
  for (let j = Math.round(0.02 * fs); j < n - Math.round(0.02 * fs); j++) {
    const f = Math.max(1, Math.round(0.002 * fs));
    const b = Math.max(1, Math.round(0.008 * fs));
    short = Math.max(
      short,
      (shortSlope[j] = Math.hypot(
        ...names.map((l) => ((s.leads[l]![j + f]! - s.leads[l]![j - f]!) * fs) / (2 * f)),
      )),
    );
    long = Math.max(
      long,
      (longSlope[j] = Math.hypot(
        ...names.map((l) => ((s.leads[l]![j + b]! - s.leads[l]![j - b]!) * fs) / (2 * b)),
      )),
    );
  }
  const r = short > 3.5 * long ? Math.round(medianWidth * fs) : 0;
  const leads = Object.fromEntries(
    names.map((l) => [
      l,
      r
        ? Float64Array.from(s.leads[l]!.subarray(0, n), (_, i) =>
            quant(Array.from(s.leads[l]!.slice(Math.max(0, i - r), Math.min(n, i + r + 1))), 0.5),
          )
        : s.leads[l]!,
    ]),
  );
  const slope = Float64Array.from({ length: n }, (_, i) =>
    i ? Math.hypot(...names.map((l) => (leads[l]![i]! - leads[l]![i - 1]!) * fs)) : 0,
  );
  const energy = new Float64Array(n);
  const win = Math.round(0.018 * fs);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += slope[i]!;
    if (i >= win) sum -= slope[i - win]!;
    energy[i] = sum / win;
  }
  const threshold = Math.max(1.9, quant(Array.from(energy), 0.98) * 0.2);
  const candidates: number[] = [];
  for (let i = Math.round(0.15 * fs); i < n - 1; i++) {
    if (energy[i]! <= threshold || energy[i]! < energy[i - 1]! || energy[i]! <= energy[i + 1]!)
      continue;
    if (r) {
      let f = 0;
      let b = 0;
      const h2 = Math.round(0.03 * fs);
      for (let j = Math.max(0, i - h2); j < Math.min(n, i + h2); j++) {
        f = Math.max(f, shortSlope[j]!);
        b = Math.max(b, longSlope[j]!);
      }
      if (f > 3.5 * b) continue;
    }
    const p = candidates.at(-1);
    if (p === undefined || i - p > 0.18 * fs) candidates.push(i);
    else if (energy[i]! > energy[p]!) candidates[candidates.length - 1] = i;
  }
  const high = quant(
    candidates.map((i) => energy[i]!),
    0.8,
  );
  let peaks = candidates.filter((i) => energy[i]! > Math.max(1.9, high * candidateFraction));
  if (tReject) {
    const accepted: number[] = [];
    for (const i of peaks) {
      const p = accepted.at(-1);
      const d = p === undefined ? 9 : (i - p) / fs;
      if (p !== undefined && d >= 0.2 && d <= 0.4 && energy[i]! < 0.72 * energy[p]!) {
        const f2 = shape(s, i, names);
        const g = shape(s, p, names);
        if (f2.rank < 0.001 && g.rank > 0.005 && f2.rough < 0.7 * g.rough) continue;
      }
      accepted.push(i);
    }
    peaks = accepted;
  }
  if ((peaks.at(-1) ?? 0) > n - 0.18 * fs) peaks.pop();
  return { peaks, energy, threshold };
}
