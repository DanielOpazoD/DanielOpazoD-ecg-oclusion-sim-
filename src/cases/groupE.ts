import type { CaseDefinition } from './types.js';

/** Group E — dinámica temporal. docs/CASES.md §E. */
export const GROUP_E: CaseDefinition[] = [
  {
    id: 'E01',
    group: 'E',
    category: 'oclusion',
    title: 'Serie DA: evolución de la oclusión',
    difficulty: 3,
    vignette: {
      age: 60,
      sex: 'M',
      history:
        'Seguimiento de un paciente con dolor torácico de inicio reciente mientras se registran ECGs seriados.',
      vitals: 'PA 135/85, FC 90',
      troponin: 'hs-cTnT en ascenso',
    },
    scenario: {
      seed: 501,
      durationS: 5,
      rhythm: { type: 'sinus', hrBpm: 90 },
      variability: false,
      conduction: 'normal',
      sources: [
        { territory: 'anterior', st: 0.3, refLead: 'V3', shape: 'straight', hyperacuteT: 0.45 },
        { territory: 'anteroseptal', st: 0.02, refLead: 'V2', shape: 'straight', hyperacuteT: 1.2 },
      ],
      timeline: [{ atMin: 0, kind: 'occlusion' }],
    },
    ecgAtMin: 10,
    expected: {
      omi: true,
      activateCathLab: true,
      culprit: 'DA',
      positiveFindings: ['hyperacute-t'],
      negativeFindings: ['stemi-udmi4'],
    },
    angiography: 'DA TIMI 0',
    teachingPoints: [
      'La evolución natural: T hiperaguda → STE → Q → inversión de T.',
      'A 10 min hyperacute-t ya es positivo; stemi-udmi4 tarda.',
      'La serie temporal enseña el valor del ECG seriado.',
      'La fase hiperaguda es fugaz: el seriado capta la transformación en STE.',
    ],
    pitfalls: [
      'Basar la decisión en un único ECG precoz.',
      'No registrar el tiempo desde el inicio del dolor.',
    ],
    refs: [22, 23, 105],
  },
  {
    id: 'E02',
    group: 'E',
    category: 'oclusion',
    title: 'Reperfusión exitosa',
    difficulty: 3,
    vignette: {
      age: 64,
      sex: 'F',
      history:
        'Paciente con IAM inferior tratado con reperfusión exitosa; control en la ventana post-procedimiento.',
      vitals: 'PA 120/75, FC 85',
      troponin: 'hs-cTnT 900 ng/L',
    },
    scenario: {
      seed: 502,
      durationS: 5,
      rhythm: { type: 'sinus', hrBpm: 85 },
      conduction: 'normal',
      sources: [{ territory: 'inferior-rca', st: 0.3, refLead: 'III', shape: 'straight' }],
      timeline: [
        { atMin: 0, kind: 'occlusion' },
        { atMin: 50, kind: 'reperfusion' },
      ],
    },
    ecgAtMin: 140,
    expected: {
      omi: true,
      activateCathLab: false,
      culprit: 'CD reperfundida',
      positiveFindings: [],
      negativeFindings: ['stemi-udmi4'],
      rulesMiss:
        'Tras reperfusión el STE cae <50 %; las reglas quedan negativas aunque hubo oclusión — la historia y la resolución del STE documentan la reperfusión.',
    },
    angiography: 'CD TIMI 3 tras PCI',
    teachingPoints: [
      'Resolución ≥50 % del STE a 60–90 min = criterio de reperfusión.',
      'La AIVR en la ventana post-reperfusión es marcador benigno.',
      'La T de reperfusión (inversión) aparece después.',
      'La reperfusión se acompaña de arritmias benignas como la AIVR.',
    ],
    pitfalls: [
      'Interpretar la AIVR como taquicardia ventricular maligna.',
      'No evaluar la resolución del STE tras el procedimiento.',
    ],
    refs: [28, 30, 29],
  },
  {
    id: 'E03',
    group: 'E',
    category: 'oclusion',
    title: 'Reoclusión',
    difficulty: 3,
    vignette: {
      age: 58,
      sex: 'M',
      history:
        'Paciente con IAM anterior reperfundido que refiere reaparición del dolor horas después del procedimiento.',
      vitals: 'PA 125/80, FC 95',
      troponin: 'hs-cTnT 500 ng/L',
    },
    scenario: {
      seed: 503,
      durationS: 5,
      rhythm: { type: 'sinus', hrBpm: 95 },
      conduction: 'normal',
      sources: [
        { territory: 'anterior', st: 0.3, refLead: 'V3', shape: 'straight', hyperacuteT: 1 },
      ],
      timeline: [
        { atMin: 0, kind: 'occlusion' },
        { atMin: 60, kind: 'reperfusion' },
        { atMin: 240, kind: 'reocclusion' },
      ],
    },
    ecgAtMin: 280,
    expected: {
      omi: true,
      activateCathLab: true,
      culprit: 'DA reocluida',
      positiveFindings: ['stemi-udmi4'],
      negativeFindings: [],
    },
    angiography: 'DA TIMI 0 (stent trombosado)',
    teachingPoints: [
      'La reoclusión borra la inversión de T (pseudonormalización) y vuelve el STE.',
      'Dolor recurrente post-PCI obliga a ECG seriado.',
      'La trombosis de stent es la causa clásica de reoclusión.',
      'La reoclusión produce pseudonormalización de las T invertidas y reaparición del STE.',
    ],
    pitfalls: [
      'Interpretar la normalización de la T como mejoría.',
      'No repetir el ECG ante la recurrencia del dolor.',
    ],
    refs: [30, 32],
  },
  {
    id: 'E04',
    group: 'E',
    category: 'oclusion',
    title: 'Multivaso Aslanger dinámico',
    difficulty: 3,
    vignette: {
      age: 70,
      sex: 'M',
      history:
        'Paciente diabético con enfermedad coronaria multivaso conocida y dolor torácico fluctuante.',
      vitals: 'PA 105/60, FC 100',
      troponin: 'hs-cTnT 180 ng/L',
    },
    scenario: {
      seed: 504,
      durationS: 5,
      rhythm: { type: 'sinus', hrBpm: 100 },
      conduction: 'normal',
      sources: [
        { territory: 'inferior-rca', st: 0.3, refLead: 'III', shape: 'straight' },
        { territory: 'subendocardial', st: -0.22, refLead: 'V5', shape: 'straight' },
      ],
      timeline: [{ atMin: 0, kind: 'occlusion' }],
    },
    ecgAtMin: 60,
    // ECG estándar de 12 derivaciones: el patrón de Aslanger se define sobre el 12.
    leadsAvailable: ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'],
    expected: {
      omi: true,
      activateCathLab: true,
      culprit: 'CD + multivaso',
      positiveFindings: ['aslanger', 'avr-diffuse-std', 'reciprocal-avl'],
      negativeFindings: ['stemi-udmi4'],
    },
    angiography: 'CD aguda + enfermedad 3 vasos',
    teachingPoints: [
      'Enfermedad multivaso: la lesión focal se superpone a isquemia subendocárdica.',
      'STE aislado en III sobre STD difusa = patrón Aslanger.',
      'Prioriza angiografía aunque no haya STEMI clásico.',
      'En la enfermedad multivaso la lesión focal se suma a un fondo de isquemia subendocárdica.',
    ],
    pitfalls: [
      'Atribuir todos los cambios a la enfermedad crónica conocida.',
      'No reconocer el patrón Aslanger como signo de oclusión.',
    ],
    refs: [51, 45],
  },
];
