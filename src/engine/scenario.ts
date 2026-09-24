import type { Vec3 } from './math/vec3.js';
import { normalize, scale } from './math/vec3.js';
import { createRng } from './math/random.js';
import { LEAD_IDS, createLeadSystem, projectDipole, type LeadId, type Placement } from './leads.js';
import { territoryById } from './territories.js';
import {
  generateBeatDipole,
  qrsDurationMs,
  SHAPES,
  type BeatOverrides,
  type BeatParams,
  type ConductionSpec,
  type ShapeName,
} from './beat.js';
import { generateBeatSchedule, type BeatEvent, type RhythmSpec } from './rhythm.js';
import { effectiveSource, type TimelineEvent } from './timeline.js';
import { addNoise, highPass, lowPass, type AcquisitionSpec } from './acquisition.js';

/**
 * Scenario assembly: `Scenario` → `Ecg12` (MODEL.md §0, §6, §7).
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
  conduction: ConductionSpec;
  /** Injury sources (§3–§4). */
  sources: InjurySource[];
  /** Timeline events (§6). */
  timeline?: TimelineEvent[];
  /** Acquisition noise/filters (§7). `placement` lives inside. */
  acquisition?: AcquisitionSpec & { placement?: Placement };
  /** Per-beat overrides (§2 helpers). */
  beatOverrides?: BeatOverrides;
}

/** Fiducial points of one beat, as sample indices (§8 input). */
export interface Fiducials {
  pOnset: number;
  qrsOnset: number;
  j: number;
  tEnd: number;
  type: BeatEvent['type'];
}

/** Generated 12-lead+ ECG (§0, §8). `leads` = dirty, `clean` = truth. */
export interface Ecg12 {
  fs: number;
  /** Signal after noise + filters (§7). */
  leads: Record<LeadId, Float32Array>;
  /** Clean projected signal (no noise/filters) — "ground truth" (§7). */
  clean: Record<LeadId, Float32Array>;
  beats: Fiducials[];
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
  };
}

const U_P = normalize([0.35, 0.85, -0.15]);

/**
 * Generate the full ECG for `scenario` evaluated at `tMin` (default
 * `tMinStart`). Pipeline (§7): dipole → projection → noise → filters;
 * the clean projection is kept in `clean`.
 */
export function generateEcg(scenario: Scenario, tMin?: number): Ecg12 {
  const fs = scenario.fs ?? 500;
  const t = tMin ?? scenario.tMin ?? scenario.tMinStart ?? 0;
  const n = Math.round(scenario.durationS * fs);
  const rng = createRng(scenario.seed);

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

  // Beat schedule (§5.1).
  const beats = generateBeatSchedule(scenario.rhythm, scenario.durationS, rng);

  // Dipole signal.
  const hx = new Float32Array(n);
  const hy = new Float32Array(n);
  const hz = new Float32Array(n);
  const fiducials: Fiducials[] = [];

  for (const beat of beats) {
    const ventricular = beat.type === 'pvc' || beat.type === 'aivr' || beat.type === 'escape';
    const params: BeatParams = {
      prMs: beat.prMs > 0 ? beat.prMs : 160,
      rrMs: beat.rrMs,
      conduction:
        scenario.conduction === 'paced' || beat.type === 'paced' ? 'paced' : scenario.conduction,
      injuries,
      ...(ventricular && beat.type !== 'escape'
        ? { ventricularOrigin: normalize([-0.6, -0.6, 0.4]) }
        : {}),
      ...(scenario.beatOverrides ? { overrides: scenario.beatOverrides } : {}),
    };
    const dur = qrsDurationMs(params);
    const start = beat.tMs - params.prMs - 90; // cover P
    const end = beat.tMs + (dur + 500) * 1.2 + 120;
    const i0 = Math.max(0, Math.floor((start / 1000) * fs));
    const i1 = Math.min(n, Math.ceil((end / 1000) * fs));
    for (let i = i0; i < i1; i++) {
      const tSampleMs = (i / fs) * 1000;
      const tau = tSampleMs - beat.tMs;
      // Dissociated P (prMs = −1): draw a random offset per beat (§5.1).
      const p = generateBeatDipole(params, tau);
      hx[i]! += p[0];
      hy[i]! += p[1];
      hz[i]! += p[2];
    }
    const qrsOnset = Math.round((beat.tMs / 1000) * fs);
    const qtc = scenario.beatOverrides?.qtc ?? 400;
    const qtMs = qtc * Math.sqrt(beat.rrMs / 1000);
    fiducials.push({
      pOnset: qrsOnset - Math.round((params.prMs / 1000) * fs),
      qrsOnset,
      j: qrsOnset + Math.round((dur / 1000) * fs),
      // QT is measured from Q onset to T end (includes the QRS).
      tEnd: qrsOnset + Math.round((qtMs / 1000) * fs),
      type: beat.type,
    });
  }

  // AFib fibrillatory baseline: f waves 5–8 Hz, 0.03 mV along û_P (§5.1).
  if (scenario.rhythm.type === 'afib') {
    const fHz = 6;
    for (let i = 0; i < n; i++) {
      const tt = i / fs;
      const f =
        0.03 * Math.sin(2 * Math.PI * fHz * tt + 1.7) +
        0.015 * Math.sin(2 * Math.PI * 7.3 * tt + 0.4);
      hx[i]! += f * U_P[0];
      hy[i]! += f * U_P[1];
      hz[i]! += f * U_P[2];
    }
  }

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

  return { fs, leads, clean, beats: fiducials, durationS: scenario.durationS };
}
