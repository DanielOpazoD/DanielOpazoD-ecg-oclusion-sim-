import { finding, mmOf, type Rule } from './types.js';

const ids = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;
const precordial = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;

export const heartRate: Rule = (ctx) => {
  const hr = ctx.delineation.hrBpm;
  const positive = hr !== null && (hr < 50 || hr > 100);
  return finding(
    'heart-rate',
    hr !== null && hr < 50 ? 'Bradicardia' : 'Taquicardia',
    positive,
    [],
    { hr: hr ?? 0 },
    positive
      ? `Frecuencia cardíaca ${hr.toFixed(0)} lpm, fuera de 50–100 lpm.`
      : 'Frecuencia cardíaca dentro de 50–100 lpm.',
    [],
  );
};
export const rrIrregular: Rule = (ctx) => {
  const irregular = ctx.delineation.rhythmRegularity === 'irregular';
  const rationale =
    irregular && ctx.delineation.atrialRateBpm === null
      ? 'RR irregular y sin ondas P regulares: sugiere fibrilación auricular.'
      : irregular
        ? 'RR irregular; hay actividad auricular detectable.'
        : 'No hay irregularidad RR significativa.';
  return finding(
    'rr-irregular',
    'Ritmo irregular',
    irregular,
    [],
    { regularity: irregular ? 1 : 0 },
    rationale,
    [],
  );
};
export const wideQrs: Rule = (ctx) => {
  const qrs = ctx.delineation.qrsMs;
  return finding(
    'wide-qrs',
    'QRS ancho',
    qrs !== null && qrs >= 120,
    [],
    { qrs: qrs ?? 0 },
    qrs !== null && qrs >= 120 ? `QRS ${qrs.toFixed(0)} ms (≥120 ms).` : 'QRS no alcanza 120 ms.',
    [],
  );
};
export const bundleBranchMorphology: Rule = (ctx) => {
  const qrs = ctx.delineation.qrsMs ?? 0;
  const rbbb =
    qrs >= 120 &&
    mmOf(ctx, 'V1', 'rAmp') > mmOf(ctx, 'V1', 'sAmp') * 0.25 &&
    mmOf(ctx, 'I', 'sAmp') > 0.8 &&
    mmOf(ctx, 'V6', 'sAmp') > 0.8;
  const lbbb =
    qrs >= 120 &&
    mmOf(ctx, 'V1', 'sAmp') > mmOf(ctx, 'V1', 'rAmp') &&
    mmOf(ctx, 'V6', 'rAmp') > mmOf(ctx, 'V6', 'qAmp');
  return finding(
    'bundle-branch-morphology',
    rbbb ? 'Morfología de BRD' : 'Morfología de BRI',
    rbbb || lbbb,
    ['V1', 'V6'],
    { rbbb: rbbb ? 1 : 0, lbbb: lbbb ? 1 : 0 },
    rbbb
      ? 'QRS ancho con R′ en V1 y S ancha lateral: morfología de BRD.'
      : lbbb
        ? 'QRS ancho predominantemente negativo en V1 y positivo en V6: morfología de BRI.'
        : 'No se reconoce una morfología típica de bloqueo de rama.',
    [],
  );
};
export const prProlonged: Rule = (ctx) => {
  const p = ctx.delineation.prMs;
  const ok = ctx.delineation.evidence.pr.status !== 'unavailable' && p !== null && p > 200;
  return finding(
    'pr-prolonged',
    'PR prolongado',
    ok,
    [],
    { pr: p ?? 0 },
    ok ? `PR ${p.toFixed(0)} ms (>200 ms).` : 'PR no prolongado o no utilizable.',
    [],
  );
};
export const prShort: Rule = (ctx) => {
  const d = ctx.delineation.prMs;
  const p = d ?? (ctx.measurements.prMs > 0 ? ctx.measurements.prMs : null);
  const q = ctx.delineation.qrsMs ?? 0;
  const ok = p !== null && p < 120;
  return finding(
    'pr-short',
    'PR corto',
    ok,
    [],
    { pr: p ?? 0, qrs: q },
    ok && q >= 110
      ? 'PR corto con QRS ensanchado: compatible con preexcitación.'
      : ok
        ? 'PR corto.'
        : 'PR no corto o no utilizable.',
    [],
  );
};
export const avDissociation: Rule = (ctx) => {
  const a = ctx.delineation.atrialRateBpm;
  const h = ctx.delineation.hrBpm;
  // PR "not stable": no usable PR, or the detected P→QRS intervals vary
  // beyond 30 ms across beats (Ps march through the ventricular cycle).
  const prDeltas = ctx.delineation.beats
    .filter((b) => b.pOnsetS !== undefined)
    .map((b) => (b.qrsOnsetS - b.pOnsetS!) * 1000);
  const prSpread = prDeltas.length ? Math.max(...prDeltas) - Math.min(...prDeltas) : Infinity;
  const coverage = ctx.delineation.beats.length
    ? prDeltas.length / ctx.delineation.beats.length
    : 0;
  const unstable = ctx.delineation.prMs === null || coverage < 0.8 || prSpread > 30;
  const ok = a !== null && h !== null && Math.abs(a - h) > 10 && unstable;
  return finding(
    'av-dissociation',
    'Disociación AV',
    ok,
    [],
    { atrial: a ?? 0, ventricular: h ?? 0 },
    ok
      ? 'Disociación AV: considerar BAV completo o TV.'
      : 'No hay evidencia suficiente de disociación AV.',
    [],
  );
};
export const qtcProlonged: Rule = (ctx) => {
  const q = ctx.delineation.qtc.fridericia;
  const limit = ctx.patient.sex === 'F' ? 460 : 450;
  const ok = q !== null && q > limit;
  return finding(
    'qtc-prolonged',
    'QTc prolongado',
    ok,
    [],
    { qtc: q ?? 0 },
    ok ? `QTc Fridericia ${q.toFixed(0)} ms.` : 'QTc no supera el umbral.',
    [],
  );
};
export const qtcShort: Rule = (ctx) => {
  const q = ctx.delineation.qtc.fridericia;
  const ok = q !== null && q < 340;
  return finding(
    'qtc-short',
    'QTc corto',
    ok,
    [],
    { qtc: q ?? 0 },
    ok ? `QTc Fridericia ${q.toFixed(0)} ms (<340 ms).` : 'QTc no corto o no utilizable.',
    [],
  );
};
export const axisDeviation: Rule = (ctx) => {
  const a = ctx.delineation.axisDeg.qrs;
  const ok = a !== null && (a < -30 || a > 90);
  return finding(
    'axis-deviation',
    a !== null && a < -30 ? 'Desviación axial izquierda' : 'Desviación axial derecha',
    ok,
    ['I', 'aVF'],
    { axis: a ?? 0 },
    ok ? `Eje QRS ${a.toFixed(0)}°.` : 'Eje QRS dentro del rango habitual.',
    [],
  );
};
export const lvhVoltage: Rule = (ctx) => {
  const sok = mmOf(ctx, 'V1', 'sAmp') + Math.max(mmOf(ctx, 'V5', 'rAmp'), mmOf(ctx, 'V6', 'rAmp'));
  const cornell = mmOf(ctx, 'aVL', 'rAmp') + mmOf(ctx, 'V3', 'sAmp');
  const lim = ctx.patient.sex === 'M' ? 28 : 20;
  const ok = sok >= 35 || cornell > lim;
  return finding(
    'lvh-voltage',
    'Voltaje de HVI',
    ok,
    ['V1', 'V5', 'V6', 'aVL'],
    { sokolow: sok, cornell, threshold: lim },
    ok
      ? 'Voltajes compatibles con hipertrofia ventricular izquierda.'
      : 'Voltajes no alcanzan criterios de HVI.',
    [],
  );
};
export const lowVoltage: Rule = (ctx) => {
  const limb = ids.slice(0, 6).every((l) => mmOf(ctx, l, 'rAmp') + mmOf(ctx, l, 'sAmp') < 5);
  const chest = precordial.every((l) => mmOf(ctx, l, 'rAmp') + mmOf(ctx, l, 'sAmp') < 10);
  return finding(
    'low-voltage',
    'Bajo voltaje',
    limb || chest,
    [],
    { limb: limb ? 1 : 0, precordial: chest ? 1 : 0 },
    limb || chest
      ? 'Voltaje reducido en todas las derivaciones de miembros o precordiales.'
      : 'Voltajes no reducidos.',
    [],
  );
};
export const peakedT: Rule = (ctx) => {
  const good = precordial.filter(
    (l) =>
      mmOf(ctx, l, 'tAmp') >= 10 &&
      ctx.measurements.perLead[l].tSym >= 0.65 &&
      ctx.measurements.perLead[l].tWidth50Ms <= 90,
  );
  return finding(
    'peaked-t',
    'T picudas',
    good.length >= 2,
    [...good],
    { leads: good.length },
    good.length >= 2
      ? 'T picudas, considerar hiperpotasemia.'
      : 'No hay dos T precordiales picudas con base estrecha.',
    [],
  );
};
export const uWave: Rule = (ctx) => {
  const good = precordial.filter(
    (l) => ['V2', 'V3'].includes(l) && ctx.measurements.perLead[l].uAmp >= 0.1,
  );
  return finding(
    'u-wave',
    'Onda U',
    good.length > 0,
    [...good],
    { uAmp: good.length ? Math.max(...good.map((l) => ctx.measurements.perLead[l].uAmp)) : 0 },
    good.length ? 'Onda U positiva prominente tras la T.' : 'No se reconoce una onda U prominente.',
    [],
  );
};
export const pacing: Rule = (ctx) => {
  const ok = ctx.delineation.pacingSpikes.length >= 3;
  return finding(
    'pacing',
    'Estimulación por marcapasos',
    ok,
    [],
    { spikes: ctx.delineation.pacingSpikes.length },
    ok
      ? `Se detectan ${ctx.delineation.pacingSpikes.length} espigas.`
      : 'No hay tres espigas de estimulación.',
    [],
  );
};
export const flutterWaves: Rule = (ctx) => {
  const a = ctx.delineation.atrialRateBpm;
  const ok = a !== null && a >= 240 && a <= 350;
  return finding(
    'flutter-waves',
    'Ondas de flutter',
    ok,
    ['II', 'III', 'aVF', 'V1'],
    { atrialRate: a ?? 0 },
    ok
      ? `Actividad auricular regular de ${a.toFixed(0)}/min, compatible con flutter.`
      : 'No hay oscilación auricular regular de flutter.',
    [],
  );
};
export const GENERAL_RULES: Rule[] = [
  heartRate,
  rrIrregular,
  wideQrs,
  bundleBranchMorphology,
  prProlonged,
  prShort,
  avDissociation,
  qtcProlonged,
  qtcShort,
  axisDeviation,
  lvhVoltage,
  lowVoltage,
  peakedT,
  uWave,
  pacing,
  flutterWaves,
];
