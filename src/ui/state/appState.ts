import type { Scenario } from '../../engine/index.js';
import { defaultScenario } from '../../engine/index.js';
import { getCase } from '../../cases/index.js';
import { createStore } from './store.js';

/** View and display options. */
export interface ViewState {
  speedMmS: 25 | 50;
  gainMmMv: 5 | 10 | 20;
  layout: '3x4' | '3x4+II' | '6x2' | '12x1';
  /** Show clean (ground-truth) trace overlay. */
  showClean: boolean;
  /** Show V7–V9 / V3R–V4R extra row. */
  extraLeads: boolean;
  theme: 'dark' | 'light';
  /** Tiny J-point ticks. */
  markers: boolean;
}

export type Mode = 'cases' | 'lab' | 'quiz';
export type PanelTab = 'clinical' | 'findings' | 'measurements' | 'teaching' | 'lab' | 'reveal';

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
}

/** True when diagnosis content must be hidden (quiz, or blind + not yet revealed). */
export function isBlind(s: AppState): boolean {
  return s.mode === 'quiz' || (s.blind && !s.revealedCaseIds.includes(s.caseId ?? ''));
}

const savedTheme = (globalThis.localStorage?.getItem('omilab.theme') ?? 'dark') as 'dark' | 'light';

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
    showClean: false,
    extraLeads: false,
    theme: savedTheme,
    markers: false,
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
});

export function setTheme(theme: 'dark' | 'light'): void {
  store.update({ view: { ...store.get().view, theme } });
  globalThis.localStorage?.setItem('omilab.theme', theme);
}
