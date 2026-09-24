import type { LeadId, Scenario } from '../engine/index.js';

/**
 * Case library types (docs/CASES.md — `CaseDefinition`).
 * User-facing strings are in Spanish.
 */

/** Expected outcome at `ecgAtMin` (docs/CASES.md §Campos). */
export interface CaseExpected {
  /** Acute occlusion (or reperfused critical culprit). */
  omi: boolean;
  /** Teaching decision: activate cath lab. */
  activateCathLab: boolean;
  culprit?: string;
  /** Finding ids that must be positive. */
  positiveFindings: string[];
  /** Finding ids that must be negative. */
  negativeFindings: string[];
  /** Honest explanation when omi=true but rules miss it. */
  rulesMiss?: string;
}

/** One case of the library (docs/CASES.md). */
export interface CaseDefinition {
  /** e.g. 'A01'. */
  id: string;
  group: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  /** Spanish title. */
  title: string;
  difficulty: 1 | 2 | 3;
  vignette: {
    age: number;
    sex: 'M' | 'F';
    /** 2–4-sentence clinical history (Spanish). */
    history: string;
    vitals?: string;
    /** hs-cTnT ng/L (p99 = 14) as text, e.g. 'hs-cTnT 240 ng/L'. */
    troponin?: string;
    symptomsOnsetMin?: number;
  };
  scenario: Scenario;
  /** Leads physically recorded (defaults to the full 17-lead set). */
  leadsAvailable?: LeadId[];
  /** ECG time in minutes (timeline evaluation point). */
  ecgAtMin?: number;
  expected: CaseExpected;
  angiography: string;
  /** 3–6 teaching points (Spanish). */
  teachingPoints: string[];
  pitfalls?: string[];
  /** Bibliography numbers from docs/research/revision-ecg-sca.md. */
  refs: number[];
}
