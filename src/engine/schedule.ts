import type { Vec3 } from './math/vec3.js';
import type { Rng } from './math/random.js';

/**
 * Event schedule: atrial events and ventricular beats are generated as a
 * calendar before dipole synthesis (ported from ECG Lab v1.3 rhythm.ts).
 * Flutter/AF/VF are continuous baseline signals — they produce no atrial
 * events; they are synthesized in scenario.ts.
 */

export type SupraventricularRhythm =
  | { type: 'sinus'; hrBpm: number; hrv?: number; respRateBpm?: number }
  | { type: 'sinus-arrhythmia'; hrBpm: number }
  | { type: 'afib'; hrBpm: number }
  | {
      type: 'flutter';
      atrialBpm?: number;
      ratio: 2 | 3 | 4;
      variableRatio?: boolean;
    }
  | { type: 'svt'; hrBpm: number }
  | { type: 'junctional'; hrBpm: number }
  | { type: 'av-block-1'; hrBpm: number; prMs: number }
  | {
      type: 'av-block-2-mobitz1';
      hrBpm: number;
      ratio: '3:2' | '4:3' | '5:4';
    }
  | {
      type: 'av-block-2-mobitz2';
      hrBpm: number;
      ratio: '3:2' | '4:3' | '2:1' | '3:1';
    }
  | {
      type: 'av-block-3';
      atrialBpm: number;
      escapeBpm: number;
      escapeOrigin: 'junctional' | 'ventricular';
    };

export type VentricularRhythm =
  | { type: 'idioventricular'; hrBpm: number }
  | { type: 'aivr'; hrBpm: number }
  | { type: 'vt'; hrBpm: number; atrialBpm?: number }
  | { type: 'torsades'; hrBpm: number }
  | { type: 'vf'; coarse?: boolean }
  | { type: 'asystole' };

export type PacedRhythm = {
  type: 'paced';
  mode: 'AAI' | 'VVI' | 'DDD';
  rateBpm: number;
  avDelayMs?: number;
  /** DDD tracking: if > rateBpm the ventricle follows atrial rate. */
  underlyingAtrialBpm?: number;
};

export type RhythmSpec = SupraventricularRhythm | VentricularRhythm | PacedRhythm;

export interface EctopySpec {
  kind: 'pac' | 'pvc';
  pattern: 'isolated' | 'bigeminy' | 'trigeminy' | 'couplet';
  /** isolated only: ectopics per minute (default 6). */
  perMin?: number;
  /** coupling after the preceding sinus QRS (default 450 pvc / 400 pac). */
  couplingMs?: number;
  /** rv → LBBB-like morphology with inferior axis; lv → RBBB-like. */
  pvcOrigin?: 'rv' | 'lv';
}

export type BeatKind =
  | 'sinus'
  | 'pac'
  | 'pvc'
  | 'junctional'
  | 'escape-junctional'
  | 'escape-ventricular'
  | 'idioventricular'
  | 'vt'
  | 'paced'
  | 'svt';

export interface BeatEvent {
  /** QRS onset in ms from scenario start. */
  tMs: number;
  kind: BeatKind;
  /** RR interval preceding this beat in ms (QT adaptation input). */
  rrMs: number;
  /** PR interval when a conducted P precedes this QRS. */
  prMs?: number;
  /** Wide-complex (ventricular-origin) beat. */
  ventricular: boolean;
  /** Pacing spikes to draw (A spike at tMs−prMs; V spike at tMs). */
  pacedSpike?: 'atrial' | 'ventricular' | 'both';
  /** Ventricular origin direction (unit vector). */
  origin?: Vec3;
  /** Torsades rotation for this beat (deg, applied to the QRS dipole). */
  axisRotDeg?: number;
  /** Torsades amplitude envelope for this beat. */
  ampScale?: number;
}

export interface AtrialEvent {
  /** P onset in ms from scenario start. */
  tMs: number;
  kind: 'sinus' | 'ectopic' | 'retrograde';
  conducted: boolean;
}

export interface Schedule {
  beats: BeatEvent[];
  atrial: AtrialEvent[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const PVC_ORIGINS: Record<'rv' | 'lv', Vec3> = {
  // RV origin: LBBB-like (dominant negative in V1) with inferior axis.
  rv: [0.55, 0.5, 0.65],
  // LV origin: RBBB-like (dominant positive in V1).
  lv: [-0.5, 0.5, -0.6],
};

const VT_ORIGIN: Vec3 = [0.5, -0.7, 0.5];
const ESCAPE_V_ORIGIN: Vec3 = [-0.5, -0.75, 0.45];

function pushBeat(beats: BeatEvent[], beat: BeatEvent, state: { prev: number }): void {
  beats.push({ ...beat, rrMs: state.prev < -9000 ? beat.rrMs : beat.tMs - state.prev });
  state.prev = beat.tMs;
}

/**
 * Generate the beat + atrial-event calendar for `durationS` seconds.
 * Deterministic given `rng`. `patientPrMs` is the baseline PR used whenever
 * the rhythm does not pin one.
 */
export function generateSchedule(
  rhythm: RhythmSpec,
  ectopy: EctopySpec | undefined,
  durationS: number,
  rng: Rng,
  patientPrMs = 160,
): Schedule {
  const endMs = durationS * 1000;
  const beats: BeatEvent[] = [];
  const atrial: AtrialEvent[] = [];
  const state = { prev: -1e9 };

  const sinusBaseRr = (hr: number) => 60000 / hr;
  const sinusRr = (t: number, base: number, hrv: number, respBpm: number) => {
    const s = t / 1000;
    const respiratory = -Math.sin(((2 * Math.PI * respBpm) / 60) * s);
    const slow = Math.sin(2 * Math.PI * 0.1 * s + 0.3);
    return base * (1 + hrv * (0.8 * respiratory + 0.2 * slow) + 0.012 * rng.gaussian());
  };
  const sinusBeatAt = (
    t: number,
    rr: number,
    pr: number,
    opts: { conducted?: boolean; atrial?: boolean } = {},
  ) => {
    const conducted = opts.conducted ?? true;
    if (opts.atrial !== false && t - pr < endMs) {
      atrial.push({ tMs: t - pr, kind: 'sinus', conducted });
    }
    if (conducted && t < endMs) {
      pushBeat(beats, { tMs: t, kind: 'sinus', rrMs: rr, prMs: pr, ventricular: false }, state);
    }
    return t;
  };

  // Sinus-grid rhythms share one P generator; ectopy is applied after.
  const buildSinusGrid = () => {
    if (
      rhythm.type !== 'sinus' &&
      rhythm.type !== 'sinus-arrhythmia' &&
      rhythm.type !== 'av-block-1'
    ) {
      return;
    }
    const base = sinusBaseRr(rhythm.hrBpm);
    const hrv =
      rhythm.type === 'sinus-arrhythmia'
        ? 0.18
        : rhythm.type === 'sinus'
          ? (rhythm.hrv ?? 0.03)
          : 0.02;
    const resp = 'respRateBpm' in rhythm ? (rhythm.respRateBpm ?? 14) : 14;
    const pr = rhythm.type === 'av-block-1' ? rhythm.prMs : patientPrMs;
    let t = 300;
    while (t < endMs) {
      const rr = sinusRr(t, base, hrv, resp);
      const jitter = rhythm.type === 'av-block-1' ? 0 : 12 * rng.gaussian();
      sinusBeatAt(t, rr, pr + jitter);
      t += rr;
    }
  };

  switch (rhythm.type) {
    case 'vf':
    case 'asystole':
      return { beats, atrial };
    case 'sinus':
    case 'sinus-arrhythmia':
    case 'av-block-1':
      buildSinusGrid();
      break;
    case 'afib': {
      const base = sinusBaseRr(rhythm.hrBpm);
      let t = 350;
      while (t < endMs) {
        const rr =
          base *
          clamp(0.8 + Math.exp(0.42 * rng.gaussian()) * 0.2 + 0.38 * rng.gaussian(), 0.38, 2.15);
        pushBeat(beats, { tMs: t, kind: 'sinus', rrMs: base, ventricular: false }, state);
        t += rr;
      }
      break;
    }
    case 'flutter': {
      const atrialBpm = rhythm.atrialBpm ?? 300;
      let t = 400;
      let k = 0;
      while (t < endMs) {
        // Variable block: alternating 2:1/4:1-style cycle around the base ratio.
        const r =
          rhythm.variableRatio && k % 4 === 3 ? Math.min(4, rhythm.ratio + 1) : rhythm.ratio;
        const rr = (60000 / atrialBpm) * r;
        pushBeat(beats, { tMs: t, kind: 'sinus', rrMs: rr, ventricular: false }, state);
        t += rr;
        k++;
      }
      break;
    }
    case 'svt': {
      const rr = 60000 / clamp(rhythm.hrBpm, 130, 240);
      let t = 300;
      while (t < endMs) {
        pushBeat(beats, { tMs: t, kind: 'svt', rrMs: rr, ventricular: false }, state);
        atrial.push({ tMs: t + 70, kind: 'retrograde', conducted: false });
        t += rr;
      }
      break;
    }
    case 'junctional': {
      const rr = 60000 / clamp(rhythm.hrBpm, 20, 100);
      let t = 300;
      while (t < endMs) {
        pushBeat(beats, { tMs: t, kind: 'junctional', rrMs: rr, ventricular: false }, state);
        atrial.push({ tMs: t + 75, kind: 'retrograde', conducted: false });
        t += rr;
      }
      break;
    }
    case 'av-block-2-mobitz1': {
      const conducted = Number(rhythm.ratio.split(':')[1]);
      const pRr = sinusBaseRr(rhythm.hrBpm);
      let cycleStart = 300;
      while (cycleStart < endMs) {
        let prAcc = patientPrMs;
        for (let k = 0; k < conducted; k++) {
          const t = cycleStart + k * pRr;
          // Wenckebach: PR increments shrink each beat (largest first),
          // so RR shortens and the pause is < 2×PP.
          sinusBeatAt(t, pRr, prAcc);
          prAcc += (80 * (conducted - 1 - k)) / (conducted - 1);
        }
        // Dropped P: non-conducted atrial event, no QRS. Pause < 2×PP.
        const dropped = cycleStart + conducted * pRr;
        if (dropped < endMs) atrial.push({ tMs: dropped, kind: 'sinus', conducted: false });
        cycleStart += (conducted + 1) * pRr;
      }
      break;
    }
    case 'av-block-2-mobitz2': {
      const [a, b] = rhythm.ratio.split(':').map(Number);
      const pRr = sinusBaseRr(rhythm.hrBpm);
      const conducted = (b ?? 1) === a! - 1 ? (b ?? 1) : 1;
      const cycle = (a ?? 2) * pRr;
      let cycleStart = 300;
      while (cycleStart < endMs) {
        for (let k = 0; k < conducted; k++) {
          sinusBeatAt(cycleStart + k * pRr, pRr, patientPrMs);
        }
        for (let k = conducted; k < (a ?? 2); k++) {
          const dropped = cycleStart + k * pRr;
          if (dropped < endMs) atrial.push({ tMs: dropped, kind: 'sinus', conducted: false });
        }
        cycleStart += cycle;
      }
      break;
    }
    case 'av-block-3': {
      const pRr = 60000 / rhythm.atrialBpm;
      for (let t = 200; t < endMs; t += pRr) {
        atrial.push({ tMs: t, kind: 'sinus', conducted: false });
      }
      const rr = 60000 / rhythm.escapeBpm;
      const ventricular = rhythm.escapeOrigin === 'ventricular';
      for (let t = 500; t < endMs; t += rr) {
        pushBeat(
          beats,
          {
            tMs: t,
            kind: ventricular ? 'escape-ventricular' : 'escape-junctional',
            rrMs: rr,
            ventricular,
            ...(ventricular ? { origin: ESCAPE_V_ORIGIN } : {}),
          },
          state,
        );
      }
      break;
    }
    case 'idioventricular':
    case 'aivr':
    case 'vt':
    case 'torsades': {
      const rr = 60000 / rhythm.hrBpm;
      const kind = rhythm.type === 'torsades' || rhythm.type === 'vt' ? 'vt' : 'idioventricular';
      const period = rr * 6; // torsades rotation period ≈ 6 beats
      let t = 400;
      while (t < endMs) {
        const beat: BeatEvent = { tMs: t, kind, rrMs: rr, ventricular: true, origin: VT_ORIGIN };
        if (rhythm.type === 'torsades') {
          const phase = (2 * Math.PI * t) / period;
          beat.axisRotDeg = ((phase % (2 * Math.PI)) * 180) / Math.PI;
          beat.ampScale = 0.55 + 0.65 * ((1 + Math.sin(phase)) / 2);
        }
        pushBeat(beats, beat, state);
        t += rr;
      }
      if (rhythm.type === 'vt') {
        const pRr = 60000 / (rhythm.atrialBpm ?? 75);
        for (let tp = 150; tp < endMs; tp += pRr) {
          atrial.push({ tMs: tp, kind: 'sinus', conducted: false });
        }
      }
      break;
    }
    case 'paced': {
      const avDelay = rhythm.avDelayMs ?? 160;
      const atrialRr =
        rhythm.mode === 'DDD' && (rhythm.underlyingAtrialBpm ?? 0) > rhythm.rateBpm
          ? 60000 / (rhythm.underlyingAtrialBpm ?? rhythm.rateBpm)
          : 60000 / rhythm.rateBpm;
      const vRr = 60000 / rhythm.rateBpm;
      let t = 400;
      while (t < endMs) {
        if (rhythm.mode === 'AAI') {
          pushBeat(
            beats,
            {
              tMs: t + avDelay,
              kind: 'paced',
              rrMs: vRr,
              prMs: avDelay,
              ventricular: false,
              pacedSpike: 'atrial',
            },
            state,
          );
          atrial.push({ tMs: t, kind: 'sinus', conducted: true });
          t += vRr;
        } else if (rhythm.mode === 'VVI') {
          pushBeat(
            beats,
            {
              tMs: t,
              kind: 'paced',
              rrMs: vRr,
              ventricular: true,
              origin: VT_ORIGIN,
              pacedSpike: 'ventricular',
            },
            state,
          );
          t += vRr;
        } else {
          // DDD: atrial spike + P, ventricular spike + paced QRS after avDelay.
          const atrialT = t;
          const beatT = atrialT + avDelay;
          atrial.push({ tMs: atrialT, kind: 'sinus', conducted: true });
          pushBeat(
            beats,
            {
              tMs: beatT,
              kind: 'paced',
              rrMs: vRr,
              prMs: avDelay,
              ventricular: true,
              origin: VT_ORIGIN,
              pacedSpike: 'both',
            },
            state,
          );
          t += atrialRr;
        }
      }
      break;
    }
  }

  // --- Ectopy overlay ----------------------------------------------------
  if (ectopy && !['vt', 'vf', 'asystole', 'torsades', 'paced'].includes(rhythm.type)) {
    const coupling = ectopy.couplingMs ?? (ectopy.kind === 'pvc' ? 450 : 400);
    const origin = PVC_ORIGINS[ectopy.pvcOrigin ?? 'rv'];
    const intervalMs = ectopy.pattern === 'isolated' ? 60000 / (ectopy.perMin ?? 6) : Infinity;
    let nextEctopic = 300 + intervalMs;
    const baseRr = 'hrBpm' in rhythm ? sinusBaseRr(rhythm.hrBpm) : 60000 / 50;
    const out: BeatEvent[] = [];
    let sinusIndex = 0;
    let lastPvc = -1e18;
    for (const b of beats) {
      if (b.ventricular) {
        out.push(b);
        continue;
      }
      // Full compensatory pause: the conducted sinus beat falling inside the
      // post-PVC window is suppressed; its P remains as a non-conducted event.
      if (
        ectopy.kind === 'pvc' &&
        lastPvc > -1e17 &&
        b.tMs - lastPvc < baseRr - 120 &&
        b.tMs - lastPvc < 900
      ) {
        const at = atrial.find(
          (x) => x.kind === 'sinus' && Math.abs(x.tMs - (b.tMs - (b.prMs ?? patientPrMs))) < 30,
        );
        if (at) at.conducted = false;
        continue;
      }
      out.push(b);
      let trigger = false;
      if (ectopy.pattern === 'isolated') trigger = b.tMs >= nextEctopic;
      else if (ectopy.pattern === 'bigeminy') trigger = true;
      else if (ectopy.pattern === 'trigeminy') trigger = sinusIndex % 3 === 1;
      else if (ectopy.pattern === 'couplet') trigger = sinusIndex % 8 === 3;
      sinusIndex++;
      if (!trigger) continue;
      if (ectopy.pattern === 'isolated') nextEctopic += intervalMs;
      const e = b.tMs + coupling;
      if (ectopy.kind === 'pac') {
        // PAC: ectopic P' conducted with a shorter PR; non-compensatory —
        // the sinus grid is unaffected.
        const pr = (b.prMs ?? patientPrMs) * 0.9;
        atrial.push({ tMs: e, kind: 'ectopic', conducted: true });
        out.push({
          tMs: e + pr,
          kind: 'pac',
          rrMs: baseRr,
          prMs: pr,
          ventricular: false,
        });
      } else {
        out.push({ tMs: e, kind: 'pvc', rrMs: baseRr, ventricular: true, origin });
        lastPvc = e;
        if (ectopy.pattern === 'couplet') {
          lastPvc = e + clamp(baseRr * 0.65, 220, 340);
          out.push({
            tMs: lastPvc,
            kind: 'pvc',
            rrMs: baseRr,
            ventricular: true,
            origin,
          });
        }
      }
    }
    beats.length = 0;
    beats.push(...out);
  }

  beats.sort((a, b) => a.tMs - b.tMs);
  // Recompute rrMs after sort (ectopics shorten the preceding interval).
  for (let i = 0; i < beats.length; i++) {
    const b = beats[i]!;
    b.rrMs = i === 0 ? b.rrMs : b.tMs - beats[i - 1]!.tMs;
  }
  atrial.sort((a, b) => a.tMs - b.tMs);
  return { beats, atrial };
}
