import type { Scenario } from '../engine/index.js';

/**
 * JSON import/export of a Scenario with light validation — enough to reject
 * malformed input without duplicating the engine's type system.
 */
export interface ExportEnvelope {
  app: 'ecglab';
  version: 1;
  scenario: Scenario;
  exportedAt: string;
}

export function exportScenarioJson(scenario: Scenario): string {
  const env: ExportEnvelope = {
    app: 'ecglab',
    version: 1,
    scenario,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(env, null, 2);
}

const RHYTHM_TYPES = new Set([
  'sinus',
  'sinus-arrhythmia',
  'afib',
  'flutter',
  'svt',
  'junctional',
  'av-block-1',
  'av-block-2-mobitz1',
  'av-block-2-mobitz2',
  'av-block-3',
  'idioventricular',
  'aivr',
  'vt',
  'torsades',
  'vf',
  'asystole',
  'paced',
]);

/** Parse an exported (or hand-written) scenario JSON; throws on malformed. */
export function importScenarioJson(text: string): Scenario {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('JSON inválido.');
  }
  // Accept either the envelope or a bare scenario.
  const sc = (obj as { scenario?: unknown })?.scenario ?? obj;
  if (!sc || typeof sc !== 'object') throw new Error('Falta el objeto "scenario".');
  const s = sc as Partial<Scenario>;
  if (typeof s.seed !== 'number' || !Number.isFinite(s.seed))
    throw new Error('El escenario necesita un seed numérico.');
  if (typeof s.durationS !== 'number' || s.durationS <= 0 || s.durationS > 120)
    throw new Error('durationS fuera de rango.');
  if (!s.rhythm || !RHYTHM_TYPES.has(s.rhythm.type))
    throw new Error('Ritmo desconocido o ausente.');
  if (typeof s.conduction !== 'string') throw new Error('Falta conduction.');
  if (!Array.isArray(s.sources)) throw new Error('sources debe ser un arreglo.');
  for (const src of s.sources) {
    if (!src || typeof src.st !== 'number') throw new Error('Fuente de lesión malformada.');
  }
  return s as Scenario;
}
