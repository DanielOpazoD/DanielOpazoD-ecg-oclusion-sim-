import type { Scenario, LeadId } from '../../engine/index.js';
import type { CaseCategory } from '../../cases/types.js';
import { defaultScenario } from '../../engine/index.js';
import { getCase } from '../../cases/index.js';
import { createStore } from './store.js';

/** View and display options. */
export interface ViewState {
  speedMmS: 25 | 50;
  gainMmMv: 5 | 10 | 20;
  layout: '3x4' | '3x4+II' | '3x4+3strips' | '6x2' | '12x1';
  /** Cabrera lead order for limb leads (−aVR). */
  cabrera: boolean;
  /** Simultaneous (continuous) vs sequential column traces. */
  simultaneous: boolean;
  /** Rhythm-strip duration in seconds. */
  stripS: 10 | 30 | 60;
  /** Show clean (ground-truth) trace overlay. */
  showClean: boolean;
  /** Show V7–V9 / V3R–V4R extra row. */
  extraLeads: boolean;
  /** Tiny J-point ticks. */
  markers: boolean;
  /** Selected beat index into delineation.beats (null → auto). */
  beatIdx: number | null;
  /** Lead shown in the beat-reader card. */
  beatLead: LeadId;
  /** Calipers mode: drag measures; off → click picks a beat. */
  calipers: boolean;
  beatOpen: boolean;
}

export type Mode = 'cases' | 'lab' | 'monitor' | 'quiz';
export type PanelTab = 'clinical' | 'findings' | 'teaching' | 'vectors' | 'lab' | 'reveal';

export interface QuizState {
  order: string[];
  idx: number;
  /** Selected findings for current case. */
  picked: Set<string>;
  decision?: 'activate' | 'serial' | 'not-ischemic';
  submitted: boolean;
  results: QuizResult[];
  done: boolean;
}

export interface QuizResult {
  caseId: string;
  correct: boolean;
  expectedOmi: boolean;
  decidedActivate: boolean;
}

export interface AppState {
  mode: Mode;
  /** 'blind' hides group/title in the case browser. */
  blind: boolean;
  caseId: string | null;
  /** Editable working copy of the scenario (lab mode). */
  scenario: Scenario;
  /** Evaluation point in minutes. */
  tMin: number;
  patient: { sex: 'M' | 'F'; age: number };
  view: ViewState;
  playing: boolean;
  /** Playback speed: sim minutes per real second. */
  playSpeedMinPerS: number;
  quiz: QuizState;
  panelTab: PanelTab;
  /** Analysis signal source. */
  analysisSource: 'clean' | 'acquired';
  /** Case ids whose verdict was revealed while blind mode is on. */
  revealedCaseIds: string[];
  /** Case-browser category filter. */
  caseFilter: CaseCategory | 'all';
  /** Case-browser free-text search. */
  caseSearch: string;
  /** Monitor freeze + beep live in the Monitor instance, not the store. */
}

/** True when diagnosis content must be hidden (quiz, or blind + not yet revealed). */
export function isBlind(s: AppState): boolean {
  return s.mode === 'quiz' || (s.blind && !s.revealedCaseIds.includes(s.caseId ?? ''));
}

// Casos mode opens on a real case (A01) instead of the bare default scenario.
const initialCase = getCase('A01');

export const store = createStore<AppState>({
  mode: 'cases',
  blind: false,
  caseId: initialCase?.id ?? null,
  scenario: initialCase ? structuredClone(initialCase.scenario) : defaultScenario(),
  tMin: initialCase?.ecgAtMin ?? 0,
  patient: initialCase
    ? { sex: initialCase.vignette.sex, age: initialCase.vignette.age }
    : { sex: 'M', age: 60 },
  view: {
    speedMmS: 25,
    gainMmMv: 10,
    layout: '3x4+II',
    cabrera: false,
    simultaneous: false,
    stripS: 10,
    showClean: false,
    extraLeads: false,
    markers: false,
    beatIdx: null,
    beatLead: 'II',
    calipers: false,
    beatOpen: true,
  },
  playing: false,
  playSpeedMinPerS: 1,
  quiz: {
    order: [],
    idx: 0,
    picked: new Set(),
    submitted: false,
    results: [],
    done: false,
  },
  panelTab: 'findings',
  analysisSource: 'clean',
  revealedCaseIds: [],
  caseFilter: 'all',
  caseSearch: '',
});
