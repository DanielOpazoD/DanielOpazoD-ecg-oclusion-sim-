/**
 * Single source of Spanish labels for engine enum ids shown in the UI
 * (lab editor selects, vector view source labels).
 */

export const TERRITORY_LABELS: Record<string, string> = {
  anteroseptal: 'Anteroseptal',
  anterior: 'Anterior',
  anteroapical: 'Anteroapical',
  'high-lateral': 'Lateral alto (D1)',
  lateral: 'Lateral',
  'inferior-rca': 'Inferior (CD)',
  'inferior-lcx': 'Inferior (CX)',
  posterior: 'Posterior',
  rv: 'Ventrículo derecho',
  rvot: 'TSVD (Brugada)',
  subendocardial: 'Subendocárdico difuso',
};

export const RHYTHM_LABELS: Record<string, string> = {
  sinus: 'Sinusal',
  'sinus-bradycardia': 'Bradicardia sinusal',
  'av-block-1': 'BAV 1º',
  'av-block-2-mobitz1': 'BAV 2º Mobitz I',
  'av-block-3': 'BAV completo',
  aivr: 'RIVA',
  pvc: 'Extrasístoles ventriculares',
  afib: 'Fibrilación auricular',
  svt: 'TSV',
  'paced-rhythm': 'Ritmo de marcapasos',
};

export const CONDUCTION_LABELS: Record<string, string> = {
  normal: 'Normal',
  lbbb: 'BRI',
  rbbb: 'BRD',
  paced: 'Marcapasos',
  lvh: 'HVI',
  'lvh-strain': 'HVI con strain',
  wpw: 'WPW',
};

export const SHAPE_LABELS: Record<string, string> = {
  concave: 'Cóncava',
  straight: 'Recta',
  convex: 'Convexa',
  tombstone: 'Tombstone',
  'depression-upsloping': 'Depresión ascendente',
};

export const PLACEMENT_LABELS: Record<string, string> = {
  standard: 'Estándar',
  'la-ra-swap': 'Inversión BI–BD',
  'la-ll-swap': 'Inversión BI–PI',
  'v1v2-high': 'V1–V2 altos',
  'precordial-lateral-shift': 'Precordiales desplazadas lateralmente',
};

/** Fallback label map covering every enum used in selectRows. */
export function enumLabel(map: Record<string, string>, id: string): string {
  return map[id] ?? id;
}
