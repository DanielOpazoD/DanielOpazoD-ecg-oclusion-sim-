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
  /** T-peak gain of the ST vector; defaults to `shape.sT` (§3.2).
   * Territories like posterior use a low `tGain` so the injury lifts ST
   * without dragging the anterior T below the baseline. */
  tGain: number;
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

/** Conduction variants (§5.2). `wpw` adds a delta wave; electrolyte presets
 * are BeatOverrides helpers used by the case library. */
export type ConductionSpec =
  | 'normal'
  | 'lbbb'
  | 'rbbb'
  | 'irbbb'
  | 'lafb'
  | 'lpfb'
  | 'rbbb-lafb'
  | 'rbbb-lpfb'
  | 'rvh'
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
  /** PR-segment depression in mV (pericarditis), applied along −û_P. */
  prDepressionMv?: number;
  /** J-notch (early repolarization) amplitude in mV along +û_T. */
  jNotchMv?: number;
  /** Osborn J-wave amplitude in mV along +û_T at J (hypothermia). */
  osbornMv?: number;
  /** Multiplier on the free-wall QRS amplitude (e.g. low voltage). */
  rScale?: number;
  /** U-wave amplitude in mV along +û_T, σ 40, centred 180 ms after the T
   *  peak (hypokalaemia). */
  uWaveMv?: number;
  /** Extra flat ST length before the T in ms: positive delays the T without
   *  changing its width (hypocalcaemia +80, hypercalcaemia −40). */
  stSegmentMs?: number;
  /** Digoxin "scooped" ST: downsloping depression along −û_T over J→T onset. */
  stSagMv?: number;
  /** Electrical alternans 0–0.5: QRS+T amplitude alternates ± on odd beats
   *  (requires `BeatParams.beatIndex`). */
  alternans?: number;
  /** P amplitude scale (hyperK flattening 0.2; LAE 1.4). */
  pWaveScale?: number;
  /** P duration scale (LAE widening). */
  pDurationScale?: number;
  /** Widens all QRS components' σ (hyperK 1.4). */
  qrsWidthScale?: number;
}

/** Parameters needed to evaluate one beat's dipole trajectory. */
export interface BeatParams {
  /** QT interval target in ms for this beat (computed in scenario.ts via
   *  the RR-memory model, §repolarization). */
  qtMs: number;
  /** Position of this beat in the schedule (electrical alternans). */
  beatIndex?: number;
  /** Explicit frontal-axis override in degrees, applied to the normal
   *  template only (`Scenario.axisDeg`). */
  axisDeg?: number;
  /** Per-beat QRS-axis rotation about z (torsades, degrees). */
  axisRotDeg?: number;
  /** Per-beat amplitude envelope (torsades). */
  ampScale?: number;
  /** QTc target in ms (default 400). */
  qtcMs?: number;
  /** Seeded inter-individual jitter (§patient-parameters): all optional. */
  patient?: {
    /** Global QRS amplitude gain ∈ [0.85, 1.15]. */
    qrsGain?: number;
    /** Frontal QRS axis rotation about z in degrees ∈ [−12, 12]. */
    axisRotDeg?: number;
    /** T-wave amplitude gain ∈ [0.85, 1.15]. */
    tGain?: number;
    /** QT scale ∈ [0.95, 1.05]. */
    qtScale?: number;
  };
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

/** Hypokalaemia: flat T + U wave + mild scooped ST. */
export function hypokalemiaOverrides(): BeatOverrides {
  return { aTScale: 0.45, uWaveMv: 0.12, stSagMv: 0.05 };
}

/** Hypocalcaemia: long flat ST, normal T width. */
export function hypocalcemiaOverrides(): BeatOverrides {
  return { stSegmentMs: 80 };
}

/** Hypercalcaemia: short ST segment. */
export function hypercalcemiaOverrides(): BeatOverrides {
  return { stSegmentMs: -40 };
}

/** Digoxin effect: scooped ST, short QT, smaller T. */
export function digoxinOverrides(): BeatOverrides {
  return { stSagMv: 0.12, qtc: 360, aTScale: 0.6 };
}

/** Severe hyperkalaemia: tall narrow T, flattened P, wide QRS. */
export function severeHyperkalemiaOverrides(): BeatOverrides {
  return { aTScale: 1.7, tSigmaScale: 0.55, pWaveScale: 0.15, qrsWidthScale: 1.5 };
}

/** Low voltage. */
export function lowVoltageOverrides(): BeatOverrides {
  return { rScale: 0.4, aTScale: 0.5 };
}

/** Long QT. */
export function longQtOverrides(): BeatOverrides {
  return { qtc: 520 };
}

/** Short QT. */
export function shortQtOverrides(): BeatOverrides {
  return { qtc: 315 };
}

// ---------------------------------------------------------------------------
// Calibrated constants (§2)
// ---------------------------------------------------------------------------

/** P amplitude, calibrated for 0.10–0.15 mV in II (§2.1). */
export const A_P = 0.12;
/** Global QRS gain, calibrated by tests for §2.2 ranges. */
export const A_QRS = 1.6;
/** T amplitude, calibrated for §2.3 ranges. */
export const A_T = 0.5;

const U_P = normalize([0.35, 0.85, -0.15]);
// T axis tilted more anterior than §2.3's (0.70,0.45,−0.25) so T(V5) ≤ 0.6
// while T(V2) ≥ 0.3 — calibrated by tests (§9.2).
const U_T = normalize([0.65, 0.45, -0.4]);

interface QrsComponent {
  mu: number;
  sigma: number;
  dir: Vec3;
  gain: number;
  /** Logistic decay mu/sigma applied to this component's gain — makes a
   * terminal force stop inside the stated QRS duration instead of fading
   * over tens of ms (keeps the J point at baseline while the morphology
   * still reads wide to a slope-energy delineator). */
  cut?: [number, number];
}

/** Baseline QRS components (§2.2 McSharry extended to 3D). */
function normalQrs(): QrsComponent[] {
  return [
    // Septal dir/gain tuned: keeps r(V1) small without producing a
    // pseudo-pathologic q in I (§9 pathological-q must stay negative).
    { mu: 12, sigma: 7, dir: normalize([-0.4, 0.2, -0.55]), gain: 0.18 },
    { mu: 40, sigma: 12, dir: normalize([0.72, 0.62, 0.3]), gain: 1.0 },
    // Basal σ 8→6 so its tail does not bleed past the J point (§9 sanity).
    { mu: 70, sigma: 6, dir: normalize([-0.3, -0.45, 0.65]), gain: 0.28 },
  ];
}

/** Rotate all components about z so the gain/σ-weighted net frontal axis
 * equals `targetDeg` (measured from +x toward +y; 0 = left, 90 = inferior).
 * Ported from ECG Lab v1.3 morphology.ts rotate-to-net-axis idea. */
function rotateToFrontalAxis(comps: QrsComponent[], targetDeg: number): QrsComponent[] {
  let nx = 0;
  let ny = 0;
  for (const c of comps) {
    nx += c.dir[0] * c.gain * c.sigma;
    ny += c.dir[1] * c.gain * c.sigma;
  }
  const rot = (targetDeg * Math.PI) / 180 - Math.atan2(ny, nx);
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  return comps.map((c) => ({
    ...c,
    dir: [c.dir[0] * cosR - c.dir[1] * sinR, c.dir[0] * sinR + c.dir[1] * cosR, c.dir[2]] as Vec3,
  }));
}

/** QRS components per conduction variant (§5.2). */
function qrsComponents(params: BeatParams): QrsComponent[] {
  const rScale = params.overrides?.rScale ?? 1;
  const widthScale = params.overrides?.qrsWidthScale ?? 1;
  const scaleSigma = (comps: QrsComponent[]) =>
    comps.map((c) => ({ ...c, sigma: c.sigma * widthScale }));
  switch (params.conduction) {
    case 'normal': {
      const comps = normalQrs().map((c) => ({ ...c, gain: c.gain * rScale }));
      return scaleSigma(
        params.axisDeg !== undefined ? rotateToFrontalAxis(comps, params.axisDeg) : comps,
      );
    }
    case 'irbbb':
      // Small terminal right-anterior-superior vector: rSR' in V1, QRS
      // 100–110 ms. Rightward enough to write R' in V1 / terminal r in aVR,
      // but with small frontal projection so the mean axis stays put and
      // aVL keeps a visible R. Tight σ so the tail ends inside the QRS
      // (J returns to baseline).
      return scaleSigma([
        ...normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
        { mu: 80, sigma: 9, dir: normalize([-0.35, -0.35, -0.85]), gain: 0.3, cut: [101, 3] },
      ]);
    case 'lafb':
      return scaleSigma(
        rotateToFrontalAxis(
          normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
          -50,
        ),
      );
    case 'lpfb':
      return scaleSigma(
        rotateToFrontalAxis(
          normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
          110,
        ),
      );
    case 'rbbb-lafb':
      return scaleSigma(
        rotateToFrontalAxis(
          [
            ...normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
            { mu: 92, sigma: 16, dir: normalize([-0.35, -0.35, -0.85]), gain: 0.55, cut: [120, 3] },
          ],
          -50,
        ),
      );
    case 'rbbb-lpfb':
      return scaleSigma(
        rotateToFrontalAxis(
          [
            ...normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
            { mu: 92, sigma: 16, dir: normalize([-0.35, -0.35, -0.85]), gain: 0.55, cut: [120, 3] },
          ],
          110,
        ),
      );
    case 'rvh':
      // Right axis + dominant R in V1 (right-anterior mid component).
      return scaleSigma([
        ...rotateToFrontalAxis(
          normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
          110,
        ),
        { mu: 35, sigma: 14, dir: normalize([-0.75, 0.1, -0.65]), gain: 0.6 },
      ]);
    case 'lbbb':
      // Terminal vector leftward-superior-posterior so V1–V3 are negative
      // (deep S) and V5–V6 positive — matching real LBBB discordance.
      return [
        { mu: 12, sigma: 7, dir: normalize([0.55, -0.15, 0.6]), gain: 0.22 },
        { mu: 60, sigma: 22, dir: normalize([0.72, 0.62, 0.3]), gain: 0.8 * rScale },
        { mu: 90, sigma: 28, dir: normalize([0.5, -0.2, 0.5]), gain: 0.7 },
      ];
    case 'rbbb':
      return [
        ...normalQrs().map((c) => ({ ...c, gain: c.gain * rScale })),
        { mu: 92, sigma: 16, dir: normalize([-0.35, -0.35, -0.85]), gain: 0.55, cut: [120, 3] },
      ];
    case 'paced':
      // LBBB-like morphology with superior axis (§5.2).
      return [
        { mu: 55, sigma: 22, dir: normalize([0.5, -0.85, 0.1]), gain: 1.0 * rScale },
        { mu: 95, sigma: 25, dir: normalize([-0.3, 0.45, 0.65]), gain: 0.3 },
      ];
    case 'lvh':
    case 'lvh-strain':
      return scaleSigma(
        normalQrs().map((c, i) => ({
          ...c,
          gain: i === 1 ? c.gain * 1.8 * rScale : c.gain,
        })),
      );
    case 'wpw':
      return scaleSigma([
        { mu: 8, sigma: 18, dir: normalize([0.4, 0.3, -0.7]), gain: 0.35 },
        ...normalQrs().map((c) => ({ ...c, gain: c.gain * rScale * 0.85 })),
      ]);
  }
}

/** Effective T direction per conduction variant (§5.2 discordance). */
function tDirection(params: BeatParams): Vec3 {
  // Ventricular beats: T discordant to their own QRS axis.
  if (params.ventricularOrigin) return normalize(scale(params.ventricularOrigin, -0.9));
  switch (params.conduction) {
    case 'lbbb':
    case 'paced':
      // −dominant terminal QRS: discordant ST/T positive in V1–V3,
      // negative in V5–V6.
      return normalize([-0.68, 0.27, -0.68]);
    case 'rbbb': {
      // Secondary repolarization: T points away from the terminal vector,
      // inverting in V1–V2 while lateral T stays upright.
      return normalize(add(U_T, scale(normalize([-0.35, -0.35, -0.85]), -0.7)));
    }
    case 'irbbb':
      // Incomplete RBBB: the secondary T inversion barely reaches V1.
      return normalize(add(U_T, scale(normalize([-0.35, -0.35, -0.85]), -0.4)));
    case 'lvh-strain':
      return normalize(add(U_T, scale(normalize([0.72, 0.62, 0.3]), -0.9)));
    case 'rvh':
      // RVH strain: T inverts in the right precordials (away from V1).
      return normalize(add(U_T, scale(normalize([0.55, -0.1, 0.8]), 0.9)));
    default:
      return U_T;
  }
}

/** Discordant ST offset at J (§5.2, ≈ 0.10–0.15 × S). */
function discordantSt(params: BeatParams): Vec3 {
  if (params.ventricularOrigin) return scale(params.ventricularOrigin, -0.18 * A_QRS);
  switch (params.conduction) {
    case 'lbbb':
    case 'paced':
      // ~5% of S: discordant J in V1–V3 stays <1 mm so a paced/LBBB baseline
      // cannot reach Sgarbossa concordant-STE or discordant-STE thresholds.
      return scale(normalize([-0.68, 0.27, -0.68]), 0.05 * A_QRS);
    case 'lvh-strain':
      // Tilted -x so lateral I/aVL/V5-V6 carry the strain depression (case D03).
      return scale(normalize([-0.8, -0.5, -0.35]), 0.11 * A_QRS * 1.8);
    case 'rbbb':
      // Secondary J/ST: slight depression in V1–V2 (opposite to the R').
      return scale(normalize([0.515, -0.157, 0.917]), 0.026 * A_QRS);
    case 'irbbb':
      return scale(normalize([0.515, -0.157, 0.917]), 0.014 * A_QRS);
    default:
      return [0, 0, 0];
  }
}

/** QRS duration (ms) for fiducials, per variant (§2.2, §5.2). */
export function qrsDurationMs(
  params: Pick<BeatParams, 'conduction' | 'ventricularOrigin' | 'overrides'>,
): number {
  const w = params.overrides?.qrsWidthScale ?? 1;
  let base: number;
  if (params.ventricularOrigin) base = 140;
  else {
    switch (params.conduction) {
      case 'lbbb':
      case 'paced':
        base = 150;
        break;
      case 'rbbb':
        base = 125;
        break;
      case 'irbbb':
        base = 105;
        break;
      case 'rbbb-lafb':
      case 'rbbb-lpfb':
        base = 130;
        break;
      case 'lafb':
      case 'lpfb':
        base = 100;
        break;
      case 'rvh':
        base = 95;
        break;
      case 'wpw':
        base = 110;
        break;
      default:
        base = 90;
    }
  }
  return base * w;
}

/**
 * Evaluate the heart dipole `H(τ)` for one beat (§2–§3, §5.2).
 * Pure function; deterministic.
 */
export function generateBeatDipole(params: BeatParams, tauMs: number): Vec3 {
  const qtMs = params.qtMs; // RR-adapted QT, computed upstream (§repolarization)
  const baseQtMs = 430; // J(90) + T-end(340) control-point span
  const qtScale = qtMs / baseQtMs;
  // Electrical alternans: odd beats attenuate QRS+T by ±overrides.alternans.
  const alt =
    params.overrides?.alternans && params.beatIndex !== undefined
      ? 1 + (params.beatIndex % 2 === 1 ? 1 : -1) * params.overrides.alternans
      : 1;
  const ampScale = (params.ampScale ?? 1) * alt;
  const aT = A_T * (params.overrides?.aTScale ?? 1) * (params.patient?.tGain ?? 1) * ampScale;
  const qrsGain = A_QRS * (params.patient?.qrsGain ?? 1) * ampScale;
  // Seeded frontal-axis jitter + per-beat torsades rotation about z.
  const rot = (((params.patient?.axisRotDeg ?? 0) + (params.axisRotDeg ?? 0)) * Math.PI) / 180;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const rotZ = (v: Vec3): Vec3 => [v[0] * cosR - v[1] * sinR, v[0] * sinR + v[1] * cosR, v[2]];
  const uT = tDirection(params);

  let h: Vec3 = [0, 0, 0];

  // --- QRS (§2.2, §5.2) --- (P waves are separate atrial events; see
  // generatePDipole / scenario.ts)
  for (const c of qrsComponents(params)) {
    const cut = c.cut ? 1 / (1 + Math.exp((tauMs - c.cut[0]) / c.cut[1])) : 1;
    h = add(h, scale(rotZ(c.dir), qrsGain * c.gain * cut * gaussian(tauMs, c.mu, c.sigma)));
  }
  // Ectopic ventricular beat (PVC/AIVR): single wide bizarre component (§5.1).
  if (params.ventricularOrigin) {
    h = add(h, scale(params.ventricularOrigin, qrsGain * 1.2 * gaussian(tauMs, 55, 25)));
  }

  // --- Injuries (§3) --- (pacing spikes are schedule events; scenario.ts)
  let maxHyper = 0;
  for (const inj of params.injuries) {
    const { direction: d, stVector } = inj;
    // Necrosis: initial forces opposite to d (§3.4).
    if (inj.qLoss > 0) {
      h = add(h, scale(d, -inj.qLoss * 0.9 * A_QRS * gaussian(tauMs, 18, 9)));
      // Mid component attenuated enough for QS complexes in looking leads
      // (§3.5 pathological Q / R loss; calibrated 0.35→0.55).
      h = add(h, scale(d, -inj.qLoss * 0.8 * A_QRS * gaussian(tauMs, 40, 12)));
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
  // Extra flat ST length (calcium): shifts T onset/peak/end without changing
  // the T width.
  const stShift = params.overrides?.stSegmentMs ?? 0;
  // Base control times relative to J (§2.3); T segment widened by hyperacuteT
  // (§3.3 — implemented as stretching the post-junction time axis, which also
  // recentres the peak and symmetrizes T; deviation noted vs analytic σ).
  const tJ = 0;
  const t40 = 40;
  const tJn = 110 + stShift;
  const tPeak = 110 + stShift + (220 - 110) * widen;
  const tEnd = 110 + stShift + (340 - 110) * widen;

  let vJFull: Vec3 = discordantSt(params);
  let v40Full: Vec3 = scale(uT, 0.02);
  // LVH strain: discordant STD persists through the ST segment, not only at J.
  if (params.conduction === 'lvh-strain') v40Full = add(v40Full, discordantSt(params));
  let vJnFull: Vec3 = scale(uT, 0.1);
  let vPeakFull: Vec3 = scale(uT, aT);
  const vEnd: Vec3 = [0, 0, 0];

  for (const inj of params.injuries) {
    const { stVector, direction: d, shape: s } = inj;
    vJFull = add(vJFull, scale(stVector, s.sJ));
    v40Full = add(v40Full, scale(stVector, s.s40));
    vJnFull = add(vJnFull, scale(stVector, s.sJn));
    // Hyperacute T contribution scaled ×0.5 vs §3.3 (clinical T sizes).
    vPeakFull = add(
      vPeakFull,
      add(scale(stVector, inj.tGain), scale(d, 0.5 * inj.hyperacuteT * aT)),
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
  if (params.overrides?.prDepressionMv) {
    h = add(h, scale(U_P, -params.overrides.prDepressionMv * gaussian(tauMs, -15, 25)));
  }

  // Digoxin-style scooped ST: smooth downsloping sag along −û_T from J to T
  // onset (peak sag just before the T takes off).
  const sagMv = params.overrides?.stSagMv;
  const sagSpan = Math.max(80, tJn * qtScale + jAtMs - (jAtMs - 10));
  if (sagMv && tauMs > jAtMs - 10 && tauMs < tJn * qtScale + jAtMs) {
    // The scoop is steepest early: the sag reaches its floor by ~60% of the
    // ST plateau and stays down into the T upslope.
    const u = Math.min(1, (Math.max(0, tauMs - (jAtMs - 10)) / sagSpan) * 1.6);
    const sag = u * u * (3 - 2 * u); // smoothstep: scooped descent into the T
    h = add(h, scale(uT, -sagMv * sag));
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

  // U wave (hypokalaemia): broad gaussian along +û_T, 180 ms after T peak.
  if (params.overrides?.uWaveMv) {
    h = add(
      h,
      scale(uT, params.overrides.uWaveMv * gaussian(tauMs, tPeak * qtScale + jAtMs + 180, 40)),
    );
  }

  // J notch (early repolarization override).
  if (params.overrides?.jNotchMv) {
    h = add(h, scale(uT, params.overrides.jNotchMv * gaussian(tauMs, jAtMs + 15, 12)));
  }

  // Osborn wave: dome right at J (hypothermia).
  if (params.overrides?.osbornMv) {
    h = add(h, scale(uT, params.overrides.osbornMv * gaussian(tauMs, jAtMs + 25, 18)));
  }

  return h;
}

/** Atrial dipole for one P event (§2.1). `tauMs` counts from P onset.
 * `kind`: sinus along +û_P (σ 22, peak +55 ms); ectopic rotates û_P ~40°;
 * retrograde is −û_P, narrower (σ 18). `gain` defaults to A_P; `durationScale`
 * widens the gaussian (LAE). */
export function generatePDipole(
  tauMs: number,
  kind: 'sinus' | 'ectopic' | 'retrograde',
  gain = A_P,
  durationScale = 1,
): Vec3 {
  if (kind === 'retrograde') {
    return scale(U_P, -gain * gaussian(tauMs, 50, 18 * durationScale));
  }
  if (kind === 'ectopic') {
    const rot = (40 * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const d: Vec3 = [U_P[0] * cosR - U_P[1] * sinR, U_P[0] * sinR + U_P[1] * cosR, U_P[2]];
    return scale(d, gain * gaussian(tauMs, 50, 20 * durationScale));
  }
  return scale(U_P, gain * gaussian(tauMs, 55, 22 * durationScale));
}
