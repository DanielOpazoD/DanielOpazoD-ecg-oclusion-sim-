import type { Vec3 } from './math/vec3.js';
import { normalize, scale } from './math/vec3.js';
import { createRng, type Rng } from './math/random.js';
import { gaussian } from './math/spline.js';
import { LEAD_IDS, createLeadSystem, projectDipole, type LeadId, type Placement } from './leads.js';
import { territoryById } from './territories.js';
import {
  generateBeatDipole,
  generatePDipole,
  qrsDurationMs,
  SHAPES,
  type BeatOverrides,
  type BeatParams,
  type ConductionSpec,
  type ShapeName,
} from './beat.js';
import {
  generateSchedule,
  type BeatEvent,
  type EctopySpec,
  type RhythmSpec,
  type Schedule,
} from './schedule.js';
import { assertRepresentableSchedule } from './constraints.js';
import { adaptRR, qtFromAdaptedRR } from './repolarization.js';
import { effectiveSource, type TimelineEvent } from './timeline.js';
import { addNoise, highPass, lowPass, type AcquisitionSpec } from './acquisition.js';

/**
 * Scenario assembly: `Scenario` → `Ecg12` (MODEL.md §0, §6, §7).
 * Event schedule (rhythm, ectopy, pacing) → per-beat dipoles + atrial dipoles
 * + continuous signals (f/F/VF) + pacing spikes → projection → acquisition.
 */

/** Declarative injury source (§3.1, §4). `territory` resolves `direction`
 * and `profile` from §4; `direction`/`profile` may override explicitly. */
export interface InjurySource {
  /** Optional identifier for timeline targeting. */
  id?: string;
  /** Territory id from §4 (alternative to explicit `direction`). */
  territory?: string;
  /** Explicit unit direction (overrides territory). */
  direction?: Vec3;
  /** ST magnitude in mV measured in `refLead` (§3.2). */
  st: number;
  /** Reference lead for `st` scaling (§3.2). */
  refLead: LeadId;
  /** ST morphology (§3.2). */
  shape: ShapeName;
  /** Hyperacute T 0–2.5 (§3.3). */
  hyperacuteT?: number;
  /** T inversion 0–1 (§3.5). */
  tInversion?: number;
  /** Necrosis 0–1 (§3.4). */
  qLoss?: number;
  /** Terminal QRS distortion 0–1 (§3.4). */
  terminalDistortion?: number;
  /** T-peak gain override (§3.2 `tGain`); defaults to territory or shape. */
  tGain?: number;
  /** Injury profile (§3.1; default from territory or 'transmural'). */
  profile?: 'transmural' | 'subendocardial';
}

/** Full scenario definition (§0–§7). */
export interface Scenario {
  /** PRNG seed — same seed + same scenario ⇒ identical signal (§0.3). */
  seed: number;
  /** Duration in seconds. */
  durationS: number;
  /** Sampling frequency Hz (default 500, §0.4). */
  fs?: number;
  /** Scenario start time in minutes (timeline phase offset). */
  tMinStart?: number;
  /** Beat-generation window in minutes for timeline evaluation (§6). */
  tMin?: number;
  rhythm: RhythmSpec;
  /** Premature atrial/ventricular beats overlaid on the rhythm (§5.1). */
  ectopy?: EctopySpec;
  conduction: ConductionSpec;
  /** Explicit frontal QRS axis override in degrees (normal template only). */
  axisDeg?: number;
  /** Injury sources (§3–§4). */
  sources: InjurySource[];
  /** Timeline events (§6). */
  timeline?: TimelineEvent[];
  /** Acquisition noise/filters (§7). `placement` lives inside. */
  acquisition?: AcquisitionSpec & { placement?: Placement };
  /** Per-beat overrides (§2 helpers). */
  beatOverrides?: BeatOverrides;
  /** Seeded inter-individual jitter (§patient-parameters). ON by default
   * when `seed` is defined and non-zero; set `false` to force baseline
   * morphology (acceptance tests rely on `defaultScenario` having it off). */
  variability?: boolean;
}

/** Fiducial points of one beat, as sample indices (§8 input). */
export interface Fiducials {
  /** P onset sample, or −1 when no conducted P precedes the QRS. */
  pOnset: number;
  qrsOnset: number;
  j: number;
  tEnd: number;
  kind: BeatEvent['kind'];
}

/** Generated 12-lead+ ECG (§0, §8). `leads` = dirty, `clean` = truth. */
export interface Ecg12 {
  fs: number;
  /** Signal after noise + filters (§7). */
  leads: Record<LeadId, Float32Array>;
  /** Clean projected signal (no noise/filters) — "ground truth" (§7). */
  clean: Record<LeadId, Float32Array>;
  beats: Fiducials[];
  /** Event calendar that produced the signal (schedule truth). */
  schedule: Schedule;
  durationS: number;
}

/** Normal sinus rhythm scenario, no injury (§2). */
export function defaultScenario(): Scenario {
  return {
    seed: 1,
    durationS: 5,
    fs: 500,
    rhythm: { type: 'sinus', hrBpm: 70 },
    conduction: 'normal',
    sources: [],
    // Baseline morphology must be reproducible for acceptance tests.
    variability: false,
  };
}

const U_P = normalize([0.35, 0.85, -0.15]);
/** Flutter sawtooth axis: negative in II/III/aVF, positive in V1. */
const U_F = normalize([-0.2, -0.85, -0.5]);
/** Pacing spike direction (arbitrary, visible in all leads). */
const U_SPIKE = normalize([0.3, 0.8, -0.5]);

/** Seeded per-patient morphology jitter (§patient-parameters): a dedicated
 * PRNG stream (independent of the signal/noise rng) draws global QRS gain,
 * frontal-axis rotation, T gain, PR and QT scale. */
function patientVariability(seed: number): NonNullable<BeatParams['patient']> & {
  prMs: number;
} {
  const rng = createRng((seed * 2654435761) % 2147483647);
  return {
    qrsGain: rng.uniform(0.85, 1.15),
    axisRotDeg: rng.uniform(-12, 12),
    tGain: rng.uniform(0.85, 1.15),
    prMs: rng.uniform(140, 190),
    qtScale: rng.uniform(0.95, 1.05),
  };
}

/** Ornstein–Uhlenbeck helper over discrete samples. */
function ouStep(prev: number, keep: number, gain: number, rng: Rng): number {
  return keep * prev + gain * rng.gaussian();
}

/**
 * Generate the full ECG for `scenario` evaluated at `tMin` (default
 * `tMinStart`). Pipeline (§7): schedule → dipole → projection → noise →
 * filters; the clean projection is kept in `clean`.
 */
export function generateEcg(scenario: Scenario, tMin?: number): Ecg12 {
  const fs = scenario.fs ?? 500;
  const t = tMin ?? scenario.tMin ?? scenario.tMinStart ?? 0;
  const n = Math.round(scenario.durationS * fs);
  const rng = createRng(scenario.seed);
  const patient =
    (scenario.variability ?? true) && scenario.seed ? patientVariability(scenario.seed) : undefined;

  // Resolve effective injuries at time t (§3, §6).
  const system = createLeadSystem(scenario.acquisition?.placement ?? 'standard');
  const injuries = scenario.sources.map((src, idx) => {
    const terr = src.territory ? territoryById(src.territory) : undefined;
    const direction = src.direction ?? terr?.direction ?? [0, 0, -1];
    const profile = src.profile ?? terr?.profile ?? 'transmural';
    const evs = (scenario.timeline ?? []).filter(
      (e) => e.sourceId === undefined || e.sourceId === src.id || e.sourceId === idx,
    );
    const eff = effectiveSource(
      {
        st: src.st,
        hyperacuteT: src.hyperacuteT ?? 0,
        tInversion: src.tInversion ?? 0,
      },
      evs,
      t,
    );
    // refLead scaling: ℓ_ref · stVector = st mV (§3.2).
    const proj = projectDipole(direction, system)[src.refLead];
    const k = proj === 0 ? 0 : eff.st / proj;
    return {
      direction,
      stVector: scale(direction, k),
      shape: SHAPES[src.shape],
      tGain: src.tGain ?? terr?.tGain ?? SHAPES[src.shape].sT,
      hyperacuteT: eff.hyperacuteT,
      tInversion: eff.tInversion,
      // Static `qLoss` on the source acts as a floor on top of timeline evolution.
      qLoss: Math.max(eff.qLoss, src.qLoss ?? 0),
      terminalDistortion: src.terminalDistortion ?? 0,
      profile,
    };
  });

  // Event schedule (§5.1) + declared-domain validation.
  const schedule = generateSchedule(
    scenario.rhythm,
    scenario.ectopy,
    scenario.durationS,
    rng,
    patient?.prMs ?? 160,
  );
  assertRepresentableSchedule(schedule, scenario.rhythm, scenario.ectopy);

  // Dipole signal.
  const hx = new Float32Array(n);
  const hy = new Float32Array(n);
  const hz = new Float32Array(n);
  const fiducials: Fiducials[] = [];

  const paint = (fromMs: number, toMs: number, anchorMs: number, fn: (tauMs: number) => Vec3) => {
    const i0 = Math.max(0, Math.floor((fromMs / 1000) * fs));
    const i1 = Math.min(n, Math.ceil((toMs / 1000) * fs));
    for (let i = i0; i < i1; i++) {
      const v = fn((i / fs) * 1000 - anchorMs);
      hx[i]! += v[0];
      hy[i]! += v[1];
      hz[i]! += v[2];
    }
  };

  // Atrial events (sinus / ectopic / retrograde Ps; flutter & AF waves are
  // continuous signals, not events).
  const pGain = 0.12 * (scenario.beatOverrides?.pWaveScale ?? 1);
  const pDurScale = scenario.beatOverrides?.pDurationScale ?? 1;
  for (const a of schedule.atrial) {
    let tOn = a.tMs;
    if (a.conducted && scenario.conduction === 'wpw') {
      // WPW: short PR (≤120) — the P sits closer to the QRS; the delta wave
      // itself is part of the QRS morphology.
      const beat = schedule.beats.find(
        (b) => b.prMs !== undefined && Math.abs(b.tMs - (a.tMs + b.prMs)) < 40,
      );
      if (beat) tOn = beat.tMs - 100;
    }
    paint(tOn - 30, tOn + 160, tOn, (tau) => generatePDipole(tau, a.kind, pGain, pDurScale));
  }

  // Ventricular beats with QT memory (§repolarization).
  const qtc = scenario.beatOverrides?.qtc ?? 400;
  let adaptedRr = schedule.beats[0]?.rrMs ?? 857;
  for (let bi = 0; bi < schedule.beats.length; bi++) {
    const beat = schedule.beats[bi]!;
    adaptedRr = adaptRR(adaptedRr, Math.max(220, beat.rrMs), beat.rrMs);
    const qtMs = qtFromAdaptedRR(qtc, patient?.qtScale ?? 1, adaptedRr);
    const ventricular = beat.ventricular;
    const params: BeatParams = {
      qtMs,
      beatIndex: bi,
      conduction:
        scenario.conduction === 'paced' || (beat.kind === 'paced' && ventricular)
          ? 'paced'
          : scenario.conduction,
      injuries,
      ...(beat.origin && beat.kind !== 'paced'
        ? { ventricularOrigin: normalize(beat.origin) }
        : {}),
      ...(beat.axisRotDeg !== undefined ? { axisRotDeg: beat.axisRotDeg } : {}),
      ...(beat.ampScale !== undefined ? { ampScale: beat.ampScale } : {}),
      ...(scenario.axisDeg !== undefined && !ventricular && scenario.conduction === 'normal'
        ? { axisDeg: scenario.axisDeg }
        : {}),
      ...(scenario.beatOverrides ? { overrides: scenario.beatOverrides } : {}),
      ...(patient ? { patient } : {}),
    };
    const dur = qrsDurationMs(params);
    paint(beat.tMs - 90, beat.tMs + (dur + 500) * 1.2 + 220, beat.tMs, (tau) =>
      generateBeatDipole(params, tau),
    );

    // Pacing spikes (§5.2): biphasic ~4 ms, part of the clean signal.
    const spikeTimes: number[] = [];
    if (beat.pacedSpike === 'ventricular' || beat.pacedSpike === 'both') {
      spikeTimes.push(beat.tMs);
    }
    if (beat.pacedSpike === 'atrial' || beat.pacedSpike === 'both') {
      spikeTimes.push(beat.tMs - (beat.prMs ?? 160));
    }
    for (const ts of spikeTimes) {
      paint(ts - 4, ts + 8, ts, (tau) =>
        scale(U_SPIKE, 2.5 * gaussian(tau, 0, 0.9) - 0.8 * gaussian(tau, 3.2, 1.1)),
      );
    }

    // Fiducials.
    const qrsOnset = Math.round((beat.tMs / 1000) * fs);
    const stShift = scenario.beatOverrides?.stSegmentMs ?? 0;
    fiducials.push({
      pOnset:
        beat.prMs !== undefined
          ? qrsOnset -
            Math.round(
              ((scenario.conduction === 'wpw' ? Math.min(beat.prMs, 100) : beat.prMs) / 1000) * fs,
            )
          : -1,
      qrsOnset,
      j: qrsOnset + Math.round((dur / 1000) * fs),
      tEnd: qrsOnset + Math.round((Math.max(60, qtMs + stShift) / 1000) * fs),
      kind: beat.kind,
    });
  }

  // --- Continuous signals (§5.1) ----------------------------------------
  const rt = scenario.rhythm.type;
  if (rt === 'afib') {
    // Fibrillatory baseline: 3 drifting oscillators 5–8 Hz with OU-modulated
    // amplitude along û_P (~0.05 mV coarse f waves).
    const osc = [5.2, 6.6, 7.8].map((f) => ({ f, phase: 2 * Math.PI * rng.next() }));
    let noise = 0;
    for (let i = 0; i < n; i++) {
      noise = ouStep(noise, 0.97, 0.03, rng);
      let f = 0;
      for (const o of osc) {
        o.phase += (2 * Math.PI * (o.f + 0.4 * noise)) / fs;
        f += Math.sin(o.phase);
      }
      const amp = 0.05 * (f / 3) * (1 + 0.5 * noise);
      hx[i]! += amp * U_P[0];
      hy[i]! += amp * U_P[1];
      hz[i]! += amp * U_P[2];
    }
  } else if (rt === 'flutter') {
    // Sawtooth F waves at atrialBpm along −û_P (−inferior, +V1), ~0.15 mV.
    const atrialBpm = scenario.rhythm.type === 'flutter' ? (scenario.rhythm.atrialBpm ?? 300) : 300;
    const cycMs = 60000 / atrialBpm;
    for (let i = 0; i < n; i++) {
      const u = (((i / fs) * 1000) % cycMs) / cycMs;
      const s = u < 0.75 ? u / 0.75 : 1 - (u - 0.75) / 0.25;
      const amp = 0.15 * (s - 0.5);
      hx[i]! += amp * U_F[0];
      hy[i]! += amp * U_F[1];
      hz[i]! += amp * U_F[2];
    }
  } else if (rt === 'vf') {
    // Chaotic VF: 3 drifting sinusoids 4–7 Hz with OU-modulated amplitude.
    const coarse = scenario.rhythm.type === 'vf' ? (scenario.rhythm.coarse ?? true) : true;
    const amp0 = coarse ? 0.5 : 0.15;
    const comps = [
      { f: 4.7, p: rng.uniform(0, 6.28) },
      { f: 5.9, p: rng.uniform(0, 6.28) },
      { f: 6.8, p: rng.uniform(0, 6.28) },
    ];
    let noise = 0;
    for (let i = 0; i < n; i++) {
      const tt = i / fs;
      noise = ouStep(noise, 0.97, 0.03, rng);
      const env = amp0 * (0.7 + 0.3 * noise);
      hx[i]! +=
        env *
        (Math.sin(tt * 2 * Math.PI * comps[0]!.f + comps[0]!.p + Math.sin(tt * 3)) + 0.3 * noise);
      hy[i]! += 0.6 * env * Math.sin(tt * 2 * Math.PI * comps[1]!.f + comps[1]!.p);
      hz[i]! +=
        0.5 * env * Math.sin(tt * 2 * Math.PI * comps[2]!.f + comps[2]!.p + Math.cos(tt * 1.7));
    }
  }
  // asystole: no organized activity at all (noise/baseline only).

  // Projection (§1, §7).
  const clean = {} as Record<LeadId, Float32Array>;
  for (const id of LEAD_IDS) clean[id] = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const proj = projectDipole([hx[i]!, hy[i]!, hz[i]!], system);
    for (const id of LEAD_IDS) clean[id][i] = proj[id];
  }

  // Noise + filters (§7).
  const leads = {} as Record<LeadId, Float32Array>;
  const acq = scenario.acquisition ?? {};
  for (const id of LEAD_IDS) {
    let s: Float32Array = Float32Array.from(clean[id]);
    addNoise(s, acq, fs, rng);
    if (acq.lowPassHz) s = lowPass(s, fs, acq.lowPassHz);
    if (acq.highPassHz) s = highPass(s, fs, acq.highPassHz, acq.highPassMode ?? 'zero-phase');
    leads[id] = s;
  }

  return { fs, leads, clean, beats: fiducials, schedule, durationS: scenario.durationS };
}
