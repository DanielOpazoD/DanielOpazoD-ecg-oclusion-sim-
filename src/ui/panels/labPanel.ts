import type { InjurySource, Placement, RhythmSpec, ConductionSpec } from '../../engine/index.js';
import { TERRITORIES } from '../../engine/index.js';
import { store } from '../state/appState.js';
import {
  TERRITORY_LABELS,
  RHYTHM_LABELS,
  CONDUCTION_LABELS,
  SHAPE_LABELS,
  PLACEMENT_LABELS,
  enumLabel,
} from '../labels.js';

const SHAPES = ['concave', 'straight', 'convex', 'tombstone', 'depression-upsloping'] as const;
const CONDUCTIONS: ConductionSpec[] = [
  'normal',
  'lbbb',
  'rbbb',
  'irbbb',
  'lafb',
  'lpfb',
  'rbbb-lafb',
  'rbbb-lpfb',
  'rvh',
  'paced',
  'lvh',
  'lvh-strain',
  'wpw',
];
const RHYTHMS: RhythmSpec['type'][] = [
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
];

/** Defaults for each rhythm type when switching in the lab. */
function rhythmDefault(type: RhythmSpec['type'], hr: number): RhythmSpec {
  switch (type) {
    case 'flutter':
      return { type, atrialBpm: 300, ratio: 2 };
    case 'av-block-1':
      return { type, hrBpm: hr, prMs: 260 };
    case 'av-block-2-mobitz1':
      return { type, hrBpm: hr, ratio: '4:3' };
    case 'av-block-2-mobitz2':
      return { type, hrBpm: hr, ratio: '3:2' };
    case 'av-block-3':
      return { type, atrialBpm: 80, escapeBpm: Math.min(hr, 45), escapeOrigin: 'junctional' };
    case 'paced':
      return { type, mode: 'VVI', rateBpm: hr };
    case 'vf':
    case 'asystole':
      return { type };
    default:
      return { type, hrBpm: hr };
  }
}

/** Readable HR field differs across rhythm variants. */
function rhythmHr(r: RhythmSpec): number {
  if ('hrBpm' in r) return r.hrBpm;
  if ('rateBpm' in r) return r.rateBpm;
  if ('escapeBpm' in r) return r.escapeBpm;
  return 70;
}
const PLACEMENTS: Placement[] = [
  'standard',
  'la-ra-swap',
  'la-ll-swap',
  'v1v2-high',
  'precordial-lateral-shift',
  'dextrocardia',
];

const REFLEADS = [
  'I',
  'II',
  'III',
  'aVR',
  'aVL',
  'aVF',
  'V1',
  'V2',
  'V3',
  'V4',
  'V5',
  'V6',
  'V7',
  'V8',
  'V9',
  'V3R',
  'V4R',
];

/** Lab scenario editor: injury sources, rhythm, conduction, acquisition, seed. */
export function labPanel(el: HTMLElement, onChange: () => void): void {
  const s = store.get().scenario;
  el.innerHTML = '';

  const srcCard = document.createElement('div');
  srcCard.className = 'card';
  srcCard.innerHTML = '<h3>Fuentes de lesión</h3>';
  s.sources.forEach((src, i) => {
    srcCard.appendChild(sourceEditor(src, i, onChange));
  });
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Añadir fuente';
  addBtn.addEventListener('click', () => {
    const st = store.get();
    const sources = [
      ...st.scenario.sources,
      { territory: 'anterior', st: 0.1, refLead: 'V3', shape: 'straight' } as InjurySource,
    ];
    store.update({ scenario: { ...st.scenario, sources } });
    onChange();
  });
  srcCard.appendChild(addBtn);
  el.appendChild(srcCard);

  const ctxCard = document.createElement('div');
  ctxCard.className = 'card';
  ctxCard.innerHTML = '<h3>Contexto</h3>';
  ctxCard.appendChild(
    selectRow(
      'Ritmo',
      RHYTHMS as unknown as string[],
      s.rhythm.type,
      (v) => {
        mutateScenario((sc) => {
          sc.rhythm = rhythmDefault(v as RhythmSpec['type'], rhythmHr(sc.rhythm));
        });
        onChange();
      },
      RHYTHM_LABELS,
    ),
  );
  const hr = rhythmHr(s.rhythm);
  ctxCard.appendChild(
    sliderRow('FC (lpm)', hr, 30, 200, 1, (v) => {
      mutateScenario((sc) => {
        sc.rhythm = { ...sc.rhythm, hrBpm: v } as RhythmSpec;
      });
      onChange();
    }),
  );
  ctxCard.appendChild(
    selectRow(
      'Conducción',
      CONDUCTIONS as unknown as string[],
      s.conduction,
      (v) => {
        mutateScenario((sc) => {
          sc.conduction = v as ConductionSpec;
        });
        onChange();
      },
      CONDUCTION_LABELS,
    ),
  );
  const st = store.get();
  ctxCard.appendChild(
    selectRow('Sexo', ['M', 'F'], st.patient.sex, (v) => {
      store.update({ patient: { ...st.patient, sex: v as 'M' | 'F' } });
      onChange();
    }),
  );
  ctxCard.appendChild(
    sliderRow('Edad', st.patient.age, 18, 95, 1, (v) => {
      store.update({ patient: { ...store.get().patient, age: v } });
      onChange();
    }),
  );
  el.appendChild(ctxCard);

  const acq = s.acquisition ?? {};
  const acqCard = document.createElement('div');
  acqCard.className = 'card';
  acqCard.innerHTML = '<h3>Adquisición</h3>';
  acqCard.appendChild(
    sliderRow('Wander (mV)', acq.baselineWander?.amplitudeMv ?? 0, 0, 0.5, 0.01, (v) => {
      mutateAcq((a) => {
        a.baselineWander = { amplitudeMv: v, hz: 0.3 };
      });
      onChange();
    }),
  );
  acqCard.appendChild(
    sliderRow('EMG σ (mV)', acq.emg?.sigmaMv ?? 0, 0, 0.1, 0.005, (v) => {
      mutateAcq((a) => {
        a.emg = { sigmaMv: v };
      });
      onChange();
    }),
  );
  acqCard.appendChild(
    sliderRow('Red eléctrica (mV)', acq.powerline?.amplitudeMv ?? 0, 0, 0.2, 0.01, (v) => {
      mutateAcq((a) => {
        a.powerline = { hz: a.powerline?.hz ?? 50, amplitudeMv: v };
      });
      onChange();
    }),
  );
  acqCard.appendChild(
    selectRow('Red eléctrica (Hz)', ['50', '60'], String(acq.powerline?.hz ?? 50), (v) => {
      mutateAcq((a) => {
        a.powerline = { hz: Number(v) as 50 | 60, amplitudeMv: a.powerline?.amplitudeMv ?? 0.05 };
      });
      onChange();
    }),
  );
  acqCard.appendChild(
    sliderRow('Movimiento /min', acq.motion?.perMin ?? 0, 0, 10, 1, (v) => {
      mutateAcq((a) => {
        a.motion = { perMin: v, amplitudeMv: 0.3 };
      });
      onChange();
    }),
  );
  acqCard.appendChild(
    selectRow('Paso-alto (Hz)', ['0.05', '0.5'], String(acq.highPassHz ?? 0.05), (v) => {
      mutateAcq((a) => {
        a.highPassHz = Number(v);
        a.highPassMode = Number(v) === 0.5 ? 'causal' : 'zero-phase';
      });
      onChange();
    }),
  );
  acqCard.appendChild(
    selectRow('Paso-bajo (Hz)', ['40', '150'], String(acq.lowPassHz ?? 150), (v) => {
      mutateAcq((a) => {
        a.lowPassHz = Number(v);
      });
      onChange();
    }),
  );
  acqCard.appendChild(
    selectRow(
      'Colocación',
      PLACEMENTS as unknown as string[],
      acq.placement ?? 'standard',
      (v) => {
        mutateAcq((a) => {
          a.placement = v as Placement;
        });
        onChange();
      },
      PLACEMENT_LABELS,
    ),
  );
  el.appendChild(acqCard);

  const seedCard = document.createElement('div');
  seedCard.className = 'card';
  seedCard.innerHTML = '<h3>Escenario</h3>';
  const seedRow = document.createElement('div');
  seedRow.className = 'field-row';
  seedRow.innerHTML = `<label>Semilla</label><input type="number" id="seed" value="${s.seed}" style="width:90px">`;
  seedRow.querySelector('input')?.addEventListener('change', (e) => {
    mutateScenario((sc) => {
      sc.seed = Number((e.target as HTMLInputElement).value);
    });
    onChange();
  });
  seedCard.appendChild(seedRow);
  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
  const rnd = btn('Aleatorizar semilla', () => {
    mutateScenario((sc) => {
      sc.seed = Math.floor(Math.random() * 1e6);
    });
    onChange();
  });
  const copy = btn('Copiar escenario JSON', () => {
    void navigator.clipboard?.writeText(JSON.stringify(store.get().scenario, null, 2));
  });
  const load = btn('Cargar JSON', () => {
    const txt = prompt('Pega el JSON del escenario:');
    if (!txt) return;
    try {
      const sc = JSON.parse(txt) as typeof s;
      store.update({ scenario: sc });
      onChange();
    } catch {
      alert('JSON inválido.');
    }
  });
  btns.append(rnd, copy, load);
  seedCard.appendChild(btns);
  el.appendChild(seedCard);
}

function sourceEditor(src: InjurySource, i: number, onChange: () => void): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText =
    'border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:8px';
  const terrOpts = TERRITORIES.map((t) => t.id);
  div.appendChild(
    selectRow(
      `Fuente ${i + 1} territorio`,
      terrOpts,
      src.territory ?? 'anterior',
      (v) => {
        mutateSource(i, (s) => {
          s.territory = v;
        });
        onChange();
      },
      TERRITORY_LABELS,
    ),
  );
  div.appendChild(
    sliderRow('ST (mm)', src.st * 10, -30, 60, 1, (v) => {
      mutateSource(i, (s) => {
        s.st = v / 10;
      });
      onChange();
    }),
  );
  div.appendChild(
    selectRow('refLead', REFLEADS, src.refLead, (v) => {
      mutateSource(i, (s) => {
        s.refLead = v as InjurySource['refLead'];
      });
      onChange();
    }),
  );
  div.appendChild(
    selectRow(
      'Forma',
      SHAPES as unknown as string[],
      src.shape ?? 'straight',
      (v) => {
        mutateSource(i, (s) => {
          s.shape = v as InjurySource['shape'];
        });
        onChange();
      },
      SHAPE_LABELS,
    ),
  );
  div.appendChild(
    sliderRow('T hiperaguda', src.hyperacuteT ?? 0, 0, 2.5, 0.1, (v) =>
      setSrc(i, 'hyperacuteT', v, onChange),
    ),
  );
  div.appendChild(
    sliderRow('Inversión T', src.tInversion ?? 0, 0, 1, 0.05, (v) =>
      setSrc(i, 'tInversion', v, onChange),
    ),
  );
  div.appendChild(
    sliderRow('Pérdida Q', src.qLoss ?? 0, 0, 1, 0.05, (v) => setSrc(i, 'qLoss', v, onChange)),
  );
  div.appendChild(
    sliderRow('Distorsión terminal', src.terminalDistortion ?? 0, 0, 1, 0.05, (v) =>
      setSrc(i, 'terminalDistortion', v, onChange),
    ),
  );
  const del = btn('Eliminar', () => {
    const st = store.get();
    store.update({
      scenario: { ...st.scenario, sources: st.scenario.sources.filter((_, j) => j !== i) },
    });
    onChange();
  });
  del.style.fontSize = '11px';
  div.appendChild(del);
  return div;
}

function setSrc(i: number, key: keyof InjurySource, v: number, onChange: () => void): void {
  mutateSource(i, (s) => {
    (s as unknown as Record<string, unknown>)[key] = v;
  });
  onChange();
}

function mutateSource(i: number, fn: (s: InjurySource) => void): void {
  const st = store.get();
  const sources = st.scenario.sources.map((s, j) => (j === i ? { ...s } : s));
  fn(sources[i]!);
  store.update({ scenario: { ...st.scenario, sources } });
}

function mutateScenario(fn: (sc: ReturnType<typeof store.get>['scenario']) => void): void {
  const st = store.get();
  const sc = structuredClone(st.scenario);
  fn(sc);
  store.update({ scenario: sc });
}

function mutateAcq(
  fn: (a: NonNullable<ReturnType<typeof store.get>['scenario']['acquisition']>) => void,
): void {
  mutateScenario((sc) => {
    sc.acquisition = { ...(sc.acquisition ?? {}) };
    fn(sc.acquisition);
  });
}

function sliderRow(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onInput: (v: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = `<label>${label}</label>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}">
    <span class="num">${fmt(value)}</span>`;
  const input = row.querySelector('input')!;
  const num = row.querySelector('.num')!;
  input.addEventListener('input', () => {
    num.textContent = fmt(Number(input.value));
  });
  input.addEventListener('change', () => onInput(Number(input.value)));
  return row;
}

function selectRow(
  label: string,
  opts: string[],
  value: string,
  onChange: (v: string) => void,
  labelMap?: Record<string, string>,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = `<label>${label}</label>
    <select aria-label="${label}">${opts
      .map(
        (o) =>
          `<option value="${o}" ${o === value ? 'selected' : ''}>${enumLabel(labelMap ?? {}, o)}</option>`,
      )
      .join('')}</select>`;
  row
    .querySelector('select')!
    .addEventListener('change', (e) => onChange((e.target as HTMLSelectElement).value));
  return row;
}

function btn(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function fmt(v: number): string {
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
}
