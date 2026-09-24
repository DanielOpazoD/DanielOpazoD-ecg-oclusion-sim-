import type { Vec3 } from './math/vec3.js';
import { add, normalize, scale } from './math/vec3.js';
import { gaussian, hermiteVec3 } from './math/spline.js';

/**
 * Beat-level dipole trajectory `H(τ)` (MODEL.md §2), injury sources (§3)
 * and conduction variants (§5.2). `τ` is ms since QRS onset.
 */

/** ST morphology coefficients `s_J, s_40, s_jn, s_T` (§3.2). */
export interface ShapeCoeffs {
  sJ: number;
  s40: number;
  sJn: number;
  sT: number;
}

/** Shape table (§3.2). */
export const SHAPES = {
  concave: { sJ: 0.6, s40: 0.8, sJn: 1.0, sT: 0.6 },
  straight: { sJ: 0.9, s40: 1.0, sJn: 1.0, sT: 0.5 },
  convex: { sJ: 1.0, s40: 1.15, sJn: 1.0, sT: 0.3 },
  tombstone: { sJ: 1.3, s40: 1.25, sJn: 1.0, sT: 0.0 },
  'depression-upsloping': { sJ: 0.6, s40: 1.0, sJn: 0.9, sT: -1.6 },
} as const satisfies Record<string, ShapeCoeffs>;

export type ShapeName = keyof typeof SHAPES;

/**
 * An injury source with its direction resolved and magnitude already scaled
 * so that `ℓ_refLead · stVector = st` mV (§3.2 refLead convention).
 */
export interface EffectiveInjury {
  /** Unit injury direction `d` (§3.1). */
  direction: Vec3;
  /** `d` scaled to produce `st` mV in the reference lead (§3.2). */
  stVector: Vec3;
  /** ST morphology coefficients (§3.2). */
  shape: ShapeCoeffs;
  /** Hyperacute T multiplier 0–2.5 (§3.3). */
  hyperacuteT: number;
  /** T-wave inversion 0–1 (§3.5). */
  tInversion: number;
  /** Necrosis / Q-wave loss 0–1 (§3.4). */
  qLoss: number;
  /** Terminal QRS distortion 0–1 (§3.4). */
  terminalDistortion: number;
  /** Transmural vs subendocardial (§3.1). */
  profile: 'transmural' | 'subendocardial';
}

/** Conduction variants (§5.2). `wpw` adds a delta wave; `hyperkalemia` is a
 * BeatOverrides preset (narrow tall T) used by the case library. */
export type ConductionSpec =
  | 'normal'
  | 'lbbb'
  | 'rbbb'
  | 'paced'
  | 'lvh'
  | 'lvh-strain'
  | 'wpw';

/** Optional per-beat overrides applied on top of the base morphology. */
export interface BeatOverrides {
  /** Multiplier on `a_T` (e.g. hyperkalemia, early repol). */
  aTScale?: number;
  /** Multiplier on effective T width (e.g. hyperkalemia narrows T). */
  tSigmaScale?: number;
  /** QTc target in ms (default 400, §2.3). */
  qtc?: number;
  /** PR-segment depression amplitude in mV (pericarditis), applied along −û_P. */
  prDepression?: number;
  /** J-notch (early repolarization) amplitude in mV along +û_T. */
  jNotch?: number;
  /** Multiplier on the free-wall QRS amplitude (e.g. low voltage). */
  rScale?: number;
}

/** Parameters needed to evaluate one beat's dipole trajectory. */
export interface BeatParams {
  /** PR interval in ms (positions the P wave, §2.1). */
  prMs: number;
  /** RR interval in ms (Bazett QT scaling, §2.3). */
  rrMs: number;
  /** QTc target in ms (default 400). */
  qtcMs?: number;
  /** Conduction variant (§5.2). */
  conduction: ConductionSpec;
  /** Ectopic ventricular origin direction for PVC/AIVR beats (§5.1). */
  ventricularOrigin?: Vec3;
  /** Effective injury sources (§3). */
  injuries: readonly EffectiveInjury[];
  /** Beat overrides. */
  overrides?: BeatOverrides;
}

/** Hyperkalemia override preset: narrow, tall, symmetric T (case D05/D12). */
export function hyperkalemiaOverrides(): BeatOverrides {
  return { aTScale: 1.5, tSigmaScale: 0.6 };
}

// ---------------------------------------------------------------------------
// Calibrated constants (§2)
// ---------------------------------------------------------------------------

/** P amplitude, calibrated for 0.10–0.15 mV in II (§2.1). */
export const A_P = 0.12;
/** Global QRS gain, calibrated by tests for §2.2 ranges. */
export const A_QRS = 1.6;
/** T amplitude, calibrated for §2.3 ranges. */
export const A_T = 0.65;

const U_P = normalize([0.35, 0.85, -0.15]);
const U_T = normalize([0.7, 0.45, -0.25]);

interface QrsComponent {
  mu: number;
  sigma: number;
  dir: Vec3;
  gain: number;
}

/** Baseline QRS components (§2.2 McSharry extended to 3D). */
function normalQrs(): QrsComponent[] {
  return [
    { mu: 12, sigma: 7, dir: normalize([-0.55, 0.15, -0.6]), gain: 0.22 },
    { mu: 40, sigma: 12, dir: normalize([0.72, 0.62, 0.3]), gain: 1.0 },
    { mu: 70, sigma: 8, dir: normalize([-0.3, -0.45, 0.65]), gain: 0.28 },
  ];
}

/** QRS components per conduction variant (§5.2). */
function qrsComponents(params: BeatParams): QrsComponent[] {
  const rScale = params.overrides?.rScale ?? 1;
  switch (params.conduction) {
    case 'normal':
      return normalQrs().map((c) => ({ ...c, gain: c.gain * rScale }));
    case 'lbbb':
      return [
        { mu: 12, sigma: 7, dir: normalize([0.55, -0.15, 0.6]), gain: 0.22 },
        { mu: 60, sigma: 22, dir: normalize([0.72, 0.62, 0.3]), gain: 1.0 * rScale },
        { mu: 95, sigma: 25, dir: normalize([-0.3, -0.45, 0.65]), gain: 0.35 },
      ];
    case 'rbbb':
      return [
        ...normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
        { mu: 85, sigma: 18, dir: normalize([-0.8, 0.1, -0.55]), gain: 0.55 },
      ];
    case 'paced':
      // LBBB-like morphology with superior axis (§5.2).
      return [
        { mu: 55, sigma: 22, dir: normalize([0.5, -0.85, 0.1]), gain: 1.0 * rScale },
        { mu: 95, sigma: 25, dir: normalize([-0.3, 0.45, 0.65]), gain: 0.3 },
      ];
    case 'lvh':
    case 'lvh-strain':
      return normalQrs().map((c, i) => ({
        ...c,
        gain: i === 1 ? c.gain * 1.8 * rScale : c.gain,
      }));
    case 'wpw':
      return [
        { mu: 8, sigma: 18, dir: normalize([0.4, 0.3, -0.7]), gain: 0.35 },
        ...normalQrs().map((c) => ({ ...c, gain: c.gain * rScale * 0.85 })),
      ];
  }
}

/** Effective T direction per conduction variant (§5.2 discordance). */
function tDirection(params: BeatParams): Vec3 {
  switch (params.conduction) {
    case 'lbbb':
    case 'paced':
      return normalize([-0.72, -0.62, -0.3]); // −dominant QRS (discordant)
    case 'rbbb': {
      // Discordant T only in V1–V2: blend −(right-anterior) component.
      return normalize(add(U_T, scale(normalize([-0.8, 0.1, -0.55]), -0.35)));
    }
    case 'lvh-strain':
      return normalize(add(U_T, scale(normalize([0.72, 0.62, 0.3]), -0.9)));
    default:
      return U_T;
  }
}

/** Discordant ST offset at J (§5.2, ≈ 0.10–0.15 × S). */
function discordantSt(params: BeatParams): Vec3 {
  switch (params.conduction) {
    case 'lbbb':
    case 'paced':
      return scale(normalize([-0.72, -0.62, -0.3]), 0.15 * A_QRS);
    case 'lvh-strain':
      return scale(normalize([-0.72, -0.62, -0.3]), 0.08 * A_QRS * 1.8);
    default:
      return [0, 0, 0];
  }
}

/** QRS duration (ms) for fiducials, per variant (§2.2, §5.2). */
export function qrsDurationMs(params: Pick<BeatParams, 'conduction' | 'ventricularOrigin'>): number {
  if (params.ventricularOrigin) return 140;
  switch (params.conduction) {
    case 'lbbb':
      return 150;
    case 'paced':
      return 150;
    case 'rbbb':
      return 125;
    case 'wpw':
      return 110;
    default:
      return 90;
  }
}

/**
 * Evaluate the heart dipole `H(τ)` for one beat (§2–§3, §5.2).
 * Pure function; deterministic.
 */
export function generateBeatDipole(params: BeatParams, tauMs: number): Vec3 {
  const qtc = params.overrides?.qtc ?? params.qtcMs ?? 400;
  const qtMs = qtc * Math.sqrt(params.rrMs / 1000); // Bazett inverse (§2.3)
  const baseQtMs = 430; // J(90) + T-end(340) control-point span
  const qtScale = qtMs / baseQtMs;
  const aT = A_T * (params.overrides?.aTScale ?? 1);
  const uT = tDirection(params);

  let h: Vec3 = [0, 0, 0];

  // --- P wave (§2.1): gaussian centered at −PR + 55, σ 22 ---
  const prEff = params.conduction === 'wpw' ? Math.min(params.prMs, 90) : params.prMs;
  h = add(h, scale(U_P, A_P * gaussian(tauMs, -prEff + 55, 22)));

  // --- QRS (§2.2, §5.2) ---
  for (const c of qrsComponents(params)) {
    h = add(h, scale(c.dir, A_QRS * c.gain * gaussian(tauMs, c.mu, c.sigma)));
  }
  // Ectopic ventricular beat (PVC/AIVR): single wide bizarre component (§5.1).
  if (params.ventricularOrigin) {
    h = add(
      h,
      scale(params.ventricularOrigin, A_QRS * 1.2 * gaussian(tauMs, 55, 25)),
    );
  }

  // Paced spike (§5.2): 2 ms, arbitrary direction.
  if (params.conduction === 'paced') {
    h = add(h, scale([0.4, 0.8, -0.4], 1.2 * gaussian(tauMs, -2, 0.8)));
  }

  // --- Injuries (§3) ---
  let maxHyper = 0;
  for (const inj of params.injuries) {
    const { direction: d, stVector } = inj;
    // Necrosis: initial forces opposite to d (§3.4).
    if (inj.qLoss > 0) {
      h = add(h, scale(d, -inj.qLoss * 0.9 * A_QRS * gaussian(tauMs, 18, 9)));
      h = add(
        h,
        scale(d, -inj.qLoss * 0.35 * A_QRS * gaussian(tauMs, 40, 12)),
      );
    }
    // Terminal QRS distortion: injury vector ramps in from τ=60 (§3.4).
    if (inj.terminalDistortion > 0) {
      const r = Math.min(1, Math.max(0, (tauMs - 60) / 35));
      const w = r * r * (3 - 2 * r) * gaussian(tauMs, 82, 30);
      h = add(h, scale(stVector, inj.terminalDistortion * inj.shape.sJ * w));
    }
    if (inj.hyperacuteT > maxHyper) maxHyper = inj.hyperacuteT;
  }

  // --- ST-T (§2.3 control points + §3.1–3.5 modifications) ---
  const jAtMs = qrsDurationMs(params);
  const widen = (1 + 0.25 * maxHyper) * (params.overrides?.tSigmaScale ?? 1);
  // Base control times relative to J (§2.3); T segment widened by hyperacuteT
  // (§3.3 — implemented as stretching the post-junction time axis, which also
  // recentres the peak and symmetrizes T; deviation noted vs analytic σ).
  const tJ = 0;
  const t40 = 40;
  const tJn = 110;
  const tPeak = 110 + (220 - 110) * widen;
  const tEnd = 110 + (340 - 110) * widen;

  let vJFull: Vec3 = discordantSt(params);
  let v40Full: Vec3 = scale(uT, 0.02);
  let vJnFull: Vec3 = scale(uT, 0.1);
  let vPeakFull: Vec3 = scale(uT, aT);
  const vEnd: Vec3 = [0, 0, 0];

  for (const inj of params.injuries) {
    const { stVector, direction: d, shape: s } = inj;
    vJFull = add(vJFull, scale(stVector, s.sJ));
    v40Full = add(v40Full, scale(stVector, s.s40));
    vJnFull = add(vJnFull, scale(stVector, s.sJn));
    vPeakFull = add(
      vPeakFull,
      add(scale(stVector, s.sT), scale(d, inj.hyperacuteT * aT)),
    );
    // T inversion displaces the T-peak vector (§3.5).
    if (inj.tInversion > 0) {
      const ti = Math.min(1, inj.tInversion);
      vPeakFull = add(vPeakFull, scale(uT, -ti * aT));
      vPeakFull = add(vPeakFull, scale(d, -ti * aT * 1.2));
      // Wellens A biphasic: junction stays positive when st≈0 (§3.5).
      const stMag = Math.abs(stVector[0]) + Math.abs(stVector[1]) + Math.abs(stVector[2]);
      if (stMag < 0.05) {
        vJnFull = add(vJnFull, scale(uT, 0.1 * aT * 0.6));
      }
    }
  }

  // PR-segment depression (overrides; pericarditis) — small negative bump
  // along −û_P just before QRS.
  if (params.overrides?.prDepression) {
    h = add(
      h,
      scale(U_P, -params.overrides.prDepression * gaussian(tauMs, -15, 25)),
    );
  }

  // ST-T contribution via Hermite spline (§2.3).
  const stt = hermiteVec3([
    [tJ * qtScale + jAtMs, vJFull],
    [t40 * qtScale + jAtMs, v40Full],
    [tJn * qtScale + jAtMs, vJnFull],
    [tPeak * qtScale + jAtMs, vPeakFull],
    [tEnd * qtScale + jAtMs, vEnd],
  ]);
  if (tauMs >= jAtMs - 20 && tauMs <= tEnd * qtScale + jAtMs + 60) {
    h = add(h, stt(tauMs));
  }

  // J notch (early repolarization override).
  if (params.overrides?.jNotch) {
    h = add(
      h,
      scale(uT, params.overrides.jNotch * gaussian(tauMs, jAtMs + 15, 12)),
    );
  }

  return h;
}
