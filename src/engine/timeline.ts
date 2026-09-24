import { ramp } from './math/spline.js';

/**
 * Temporal evolution of injury sources: occlusion, reperfusion,
 * reocclusion (MODEL.md §6).
 */

/** One event in a source's history (§6). */
export interface TimelineEvent {
  /** Time in minutes from scenario start. */
  atMin: number;
  kind: 'occlusion' | 'reperfusion' | 'reocclusion';
  /** Which injury source this applies to (index or territory id). */
  sourceId?: string | number;
}

/** Nominal injury magnitudes whose temporal modulation is evaluated. */
export interface SourceMagnitudes {
  /** Nominal ST magnitude `S` (mV in refLead, §3.2). */
  st: number;
  /** Nominal hyperacuteT `H` (§3.3). */
  hyperacuteT: number;
  /** Nominal tInversion (§3.5; default 0 — evolves via timeline). */
  tInversion: number;
}

/** Effective source parameters at a given time (§6). */
export interface EffectiveSource extends SourceMagnitudes {
  /** Necrosis 0–1 (§3.4). */
  qLoss: number;
}

/** Occlusion-phase profile at `dt` minutes since occlusion (§6). */
function occlusionProfile(dt: number, m: SourceMagnitudes): EffectiveSource {
  return {
    st: m.st * ramp(dt, 3, 25) * (1 - 0.35 * ramp(dt, 360, 1440)),
    hyperacuteT: m.hyperacuteT * ramp(dt, 1, 8) * (1 - 0.6 * ramp(dt, 45, 180)),
    qLoss: ramp(dt, 90, 600),
    tInversion: ramp(dt, 720, 2160),
  };
}

/**
 * Evaluate the effective parameters of a source at `tMin` given its
 * timeline events (§6). No events → nominal magnitudes with `qLoss = 0`
 * (static/test scenarios).
 */
export function effectiveSource(
  m: SourceMagnitudes,
  events: readonly TimelineEvent[],
  tMin: number,
): EffectiveSource {
  const evs = events
    .filter((e) => e.atMin <= tMin)
    .sort((a, b) => a.atMin - b.atMin);
  if (evs.length === 0) {
    return {
      st: m.st,
      hyperacuteT: m.hyperacuteT,
      qLoss: 0,
      tInversion: m.tInversion,
    };
  }

  // Replay: track current occlusion start, last reperfusion, and the max
  // necrosis accumulated before any reperfusion (Q does not resolve, §6).
  let occT = -1; // active occlusion/reocclusion start
  let repT = -1; // active reperfusion time
  let qFrozen = 0; // Q accumulated at last reperfusion
  for (const e of evs) {
    if (e.kind === 'occlusion' || e.kind === 'reocclusion') {
      occT = e.atMin;
      repT = -1;
    } else if (e.kind === 'reperfusion' && occT >= 0) {
      repT = e.atMin;
      qFrozen = Math.max(qFrozen, ramp(repT - occT, 90, 600));
      occT = -1;
    }
  }

  if (repT >= 0 && occT < 0) {
    // Reperfused phase (§6): st decays τ_R=45 min, hyperacuteT→0 in 15 min,
    // reperfusion/Wellens T inversion ramps in, qLoss frozen.
    const dt = tMin - repT;
    const atRep = occlusionProfile(repT - (findOccBefore(evs, repT) ?? 0), m);
    return {
      st: atRep.st * Math.exp(-dt / 45),
      hyperacuteT: atRep.hyperacuteT * (1 - ramp(dt, 0, 15)),
      qLoss: qFrozen,
      tInversion: ramp(dt, 30, 720),
    };
  }

  // Occluded phase (possibly after reocclusion → pseudonormalization).
  const dt = tMin - occT;
  const cur = occlusionProfile(dt, m);
  cur.qLoss = Math.max(cur.qLoss, qFrozen);
  const last = evs[evs.length - 1]!;
  if (last.kind === 'reocclusion') {
    // T inversion falls to 0 in 5 min, then re-evolves (§6).
    cur.tInversion = cur.tInversion * ramp(dt, 5, 30);
  }
  return cur;
}

function findOccBefore(
  evs: readonly TimelineEvent[],
  repT: number,
): number | undefined {
  let occ: number | undefined;
  for (const e of evs) {
    if (e.atMin >= repT) break;
    if (e.kind === 'occlusion' || e.kind === 'reocclusion') occ = e.atMin;
  }
  return occ;
}

/** Reperfusion AIVR window `[tR, tR+30]` in minutes (§6). */
export function aivrWindow(tReperfusionMin: number): readonly [number, number] {
  return [tReperfusionMin, tReperfusionMin + 30];
}
