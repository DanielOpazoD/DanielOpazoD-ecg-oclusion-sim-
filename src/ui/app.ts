import { generateEcg, type Ecg12 } from '../engine/index.js';
import { analyzeEcg, type AnalysisReport } from '../analysis/index.js';
import { getCase, CASES } from '../cases/index.js';
import { store, isBlind, type AppState, type ViewState } from './state/appState.js';
import { renderEcg } from './ecg/renderer.js';
import { Monitor } from './ecg/monitor.js';
import { renderVectorView } from './ecg/vectorView.js';
import { attachCalipers } from './ecg/calipers.js';
import { pickBeat } from './ecg/beatDetail.js';
import { renderBeatReader } from './panels/beatReader.js';

import { clinicalPanel } from './panels/clinicalPanel.js';
import { findingsPanel } from './panels/findingsPanel.js';
import { renderMetricCards, metricCards } from './panels/metricCards.js';
import { teachingPanel } from './panels/teachingPanel.js';
import { labPanel } from './panels/labPanel.js';
import { timelineBar } from './panels/timelineBar.js';
import { renderCaseBrowser, selectCase, currentCase } from './modes/casesMode.js';
import { renderQuizPanel, startQuiz, QUIZ_FINDING_CHOICES } from './modes/quizMode.js';
import { formatReport, copyReport } from './export.js';
import { exportPng300 } from './export/png.js';
import { readUrlState, shareUrl } from '../persistence/urlState.js';
import { withFocusPreserved, wireTablist } from './a11y.js';
import type { LeadId } from '../engine/index.js';

/** Mount the whole app into #app. */
export function mount(root: HTMLElement): void {
  root.innerHTML = `
    <header class="app-header">
      <a class="skip-link" href="#ecg-canvas">Saltar al ECG</a>
      <div class="brand">ECG Lab<span class="sub">Simulador educativo</span></div>
      <nav class="mode-tabs" role="tablist" aria-label="Modo">
        <button data-mode="cases" role="tab" aria-label="Casos">Casos</button>
        <button data-mode="lab" role="tab" aria-label="Laboratorio">Laboratorio</button>
        <button data-mode="monitor" role="tab" aria-label="Monitor">Monitor</button>
        <button data-mode="quiz" role="tab" aria-label="Quiz">Quiz</button>
      </nav>
      <div class="header-spacer"></div>
      <div class="header-actions">
        <div class="export-menu">
          <button id="btn-export" class="btn quiet" aria-label="Exportar" aria-haspopup="menu" aria-expanded="false">Exportar ▾</button>
          <div class="export-pop" id="export-pop" hidden style="display:none">
            <button id="btn-export-png" aria-label="Exportar PNG 300 dpi">PNG (300 dpi)</button>
            <button id="btn-export-json" aria-label="Exportar JSON">JSON del escenario</button>
            <button id="btn-copy-link" aria-label="Copiar enlace">Copiar enlace</button>
            <button id="btn-copy-report" aria-label="Copiar informe">Copiar informe</button>
          </div>
        </div>
        <button id="btn-about" class="btn quiet" aria-label="Ayuda" title="Ayuda y atajos (?)">?</button>
      </div>
    </header>
    <div class="app-main">
      <aside class="sidebar" id="sidebar"></aside>
      <section class="center">
        <div class="ctx" id="context-bar"></div>
        <div class="card ecg-wrap" id="ecg-wrap">
          <div class="paperhead" id="paperhead"></div>
          <div class="ecg-paper"><canvas id="ecg-canvas" role="img" tabindex="-1" aria-label="Trazado ECG"></canvas></div>
        </div>
        <div class="card meas" id="metric-row"></div>
        <div id="beat-card"></div>
        <div class="monitor-strip" id="monitor-strip"><canvas id="monitor-canvas" aria-label="Monitor"></canvas>
          <div class="monitor-controls" id="monitor-controls"></div>
        </div>
        <div class="card timeline-bar" id="timeline"></div>
      </section>
      <aside class="right-panel">
        <div class="panel-tabs" id="panel-tabs" role="tablist" aria-label="Panel"></div>
        <div class="panel-body" id="panel-body" role="tabpanel"></div>
      </aside>
    </div>
    <div id="live" class="sr-only" aria-live="polite"></div>`;

  const canvas = root.querySelector<HTMLCanvasElement>('#ecg-canvas')!;
  const monitorCanvas = root.querySelector<HTMLCanvasElement>('#monitor-canvas')!;
  const monitorControls = root.querySelector<HTMLElement>('#monitor-controls')!;
  const monitorStrip = root.querySelector<HTMLElement>('#monitor-strip')!;
  const sidebar = root.querySelector<HTMLElement>('#sidebar')!;
  const paperhead = root.querySelector<HTMLElement>('#paperhead')!;
  const timelineEl = root.querySelector<HTMLElement>('#timeline')!;
  const metricRow = root.querySelector<HTMLElement>('#metric-row')!;
  const panelTabs = root.querySelector<HTMLElement>('#panel-tabs')!;
  const panelBody = root.querySelector<HTMLElement>('#panel-body')!;
  const ecgWrap = root.querySelector<HTMLElement>('#ecg-wrap')!;
  const contextBar = root.querySelector<HTMLElement>('#context-bar')!;
  const beatCard = root.querySelector<HTMLElement>('#beat-card')!;
  const liveEl = root.querySelector<HTMLElement>('#live')!;
  const modeTabs = root.querySelector<HTMLElement>('.mode-tabs')!;

  let ecg: Ecg12 | null = null;
  let report: AnalysisReport | null = null;
  let highlight: LeadId[] | null = null;
  const monitor = new Monitor(
    monitorCanvas,
    () => ecg,
    () => report?.delineation ?? null,
  );

  // --- ECG generation & analysis -----------------------------------------
  const regenerate = () => {
    const s = store.get();
    try {
      ecg = generateEcg({ ...s.scenario, durationS: Math.max(10, s.scenario.durationS) }, s.tMin);
    } catch (e) {
      console.error('generateEcg failed', e);
      ecg = null;
    }
    const c = currentCase();
    report = ecg
      ? analyzeEcg(ecg, {
          sex: s.patient.sex,
          age: s.patient.age,
          source: s.analysisSource,
          ...(c?.leadsAvailable ? { leadsAvailable: c.leadsAvailable } : {}),
          conduction: s.scenario.conduction,
        })
      : null;
  };

  const sel = (
    id: string,
    caption: string,
    opts: { v: string | number; label: string }[],
    value: string | number,
    onchange: (v: string) => void,
  ) => {
    const l = document.createElement('label');
    l.className = 'tb-field';
    l.innerHTML = `<span>${caption}</span><select id="${id}">${opts
      .map(
        (o) =>
          `<option value="${o.v}" ${String(o.v) === String(value) ? 'selected' : ''}>${o.label}</option>`,
      )
      .join('')}</select>`;
    l.querySelector('select')!.addEventListener('change', (e) =>
      onchange((e.target as HTMLSelectElement).value),
    );
    return l;
  };

  // Segmented-pair head on the paper card + «Vista» popover (the popover is a
  // persistent child of .ctx so changing a select doesn't tear it down).
  let vistaPop: HTMLElement | null = null;
  const vistaToggleSyncs: Array<() => void> = [];
  const segBtn = (
    parent: HTMLElement,
    label: string,
    pressed: boolean,
    on: (v: boolean) => void,
    title?: string,
  ) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('aria-pressed', String(pressed));
    if (title) b.title = title;
    b.addEventListener('click', () => on(!pressed));
    parent.appendChild(b);
    return b;
  };

  const renderPaperhead = () => {
    const s = store.get();
    const acq = s.scenario.acquisition ?? {};
    paperhead.innerHTML = '';
    const setView = (patch: Partial<ViewState>) =>
      store.update({ view: { ...store.get().view, ...patch } });
    const g1 = document.createElement('div');
    g1.className = 'seg';
    segBtn(g1, 'Estándar', !s.view.cabrera, () => setView({ cabrera: false }));
    segBtn(g1, 'Cabrera', s.view.cabrera, () => setView({ cabrera: true }));
    const g2 = document.createElement('div');
    g2.className = 'seg';
    segBtn(g2, 'Adquirida', !s.view.showClean, () => setView({ showClean: false }));
    segBtn(
      g2,
      'Limpia',
      s.view.showClean,
      () => setView({ showClean: true }),
      'Mostrar la señal sin ruido ni filtros',
    );
    const g3 = document.createElement('div');
    g3.className = 'seg';
    segBtn(
      g3,
      'Calipers',
      s.view.calipers,
      (v) => setView({ calipers: v }),
      'Medir Δt y ΔV arrastrando sobre el papel',
    );
    paperhead.append(g1, g2, g3);
    if (s.view.calipers) {
      const hint = document.createElement('span');
      hint.className = 'kbd';
      hint.textContent = 'Esc borra';
      paperhead.appendChild(hint);
    }
    const info = document.createElement('span');
    info.className = 'filters';
    info.textContent = `${acq.highPassHz ?? 0.05}–${acq.lowPassHz ?? 150} Hz`;
    paperhead.appendChild(info);
  };

  const LAYOUT_LABEL: Record<ViewState['layout'], string> = {
    '3x4': '3×4',
    '3x4+II': '3×4 + II',
    '3x4+3strips': '3×4 + 3 tiras',
    '6x2': '6×2',
    '12x1': '12×1',
  };

  // Persistent «Vista» button + popover — survives context-line re-renders.
  const vistaWrap = document.createElement('div');
  vistaWrap.className = 'view';
  vistaWrap.innerHTML = `<button class="btn quiet" id="btn-vista" aria-haspopup="true" aria-expanded="false"></button>`;
  const buildVistaPop = () => {
    const setView = (patch: Partial<ViewState>) =>
      store.update({ view: { ...store.get().view, ...patch } });
    vistaPop = document.createElement('div');
    vistaPop.className = 'vista-pop';
    vistaPop.id = 'vista-pop';
    vistaPop.hidden = true;
    vistaPop.append(
      sel(
        'v-layout',
        'Formato',
        [
          { v: '3x4', label: '3×4' },
          { v: '3x4+II', label: '3×4 + II' },
          { v: '3x4+3strips', label: '3×4 + 3 tiras' },
          { v: '6x2', label: '6×2' },
          { v: '12x1', label: '12×1' },
        ],
        store.get().view.layout,
        (v) => setView({ layout: v as ViewState['layout'] }),
      ),
      sel(
        'v-speed',
        'Velocidad',
        [
          { v: 25, label: '25 mm/s' },
          { v: 50, label: '50 mm/s' },
        ],
        store.get().view.speedMmS,
        (v) => setView({ speedMmS: Number(v) as 25 | 50 }),
      ),
      sel(
        'v-gain',
        'Ganancia',
        [
          { v: 5, label: '5 mm/mV' },
          { v: 10, label: '10 mm/mV' },
          { v: 20, label: '20 mm/mV' },
        ],
        store.get().view.gainMmMv,
        (v) => setView({ gainMmMv: Number(v) as 5 | 10 | 20 }),
      ),
      sel(
        'v-strip',
        'Duración',
        [
          { v: 10, label: '10 s' },
          { v: 30, label: '30 s' },
          { v: 60, label: '60 s' },
        ],
        store.get().view.stripS,
        (v) => setView({ stripS: Number(v) as 10 | 30 | 60 }),
      ),
    );
    const tog = document.createElement('div');
    tog.className = 'vista-toggles';
    const mk = (label: string, get: () => boolean, on: (v: boolean) => void, title?: string) => {
      const b = document.createElement('button');
      b.className = 'btn quiet';
      b.dataset['tog'] = label;
      if (title) b.title = title;
      const sync = () => {
        b.textContent = label;
        b.setAttribute('aria-pressed', String(get()));
      };
      sync();
      b.addEventListener('click', () => {
        on(!get());
        sync();
      });
      tog.appendChild(b);
      vistaToggleSyncs.push(sync);
      return sync;
    };
    mk(
      'Marcadores',
      () => store.get().view.markers,
      (v) => setView({ markers: v }),
    );
    mk(
      'Extra (V7–V9 / V3R–V4R)',
      () => store.get().view.extraLeads,
      (v) => setView({ extraLeads: v }),
      'Derivaciones adicionales V7–V9 / V3R–V4R',
    );
    mk(
      'Simultáneo',
      () => store.get().view.simultaneous,
      (v) => setView({ simultaneous: v }),
      'Las 12 derivaciones dibujadas en el mismo instante',
    );
    vistaPop.appendChild(tog);
    vistaWrap.appendChild(vistaPop);
  };
  buildVistaPop();
  const btnVista = vistaWrap.querySelector<HTMLButtonElement>('#btn-vista')!;
  const closeVista = (refocus = false) => {
    vistaPop!.hidden = true;
    btnVista.setAttribute('aria-expanded', 'false');
    if (refocus) btnVista.focus();
  };
  btnVista.addEventListener('click', (e) => {
    e.stopPropagation();
    if (vistaPop!.hidden) {
      vistaPop!.hidden = false;
      btnVista.setAttribute('aria-expanded', 'true');
    } else closeVista();
  });
  vistaPop!.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeVista(true);
    }
  });
  // Esc closes the popover wherever focus is (a div popover is not focusable,
  // so Escape usually lands on body).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && vistaPop && !vistaPop.hidden) closeVista(true);
  });
  document.addEventListener('click', (e) => {
    if (!vistaPop!.hidden && !(e.target as HTMLElement).closest('.ctx .view')) closeVista();
  });

  const renderMonitorControls = () => {
    const s = store.get();
    monitorStrip.classList.toggle('monitor-full', s.mode === 'monitor');
    monitorControls.innerHTML = '';
    if (s.mode !== 'monitor') return;
    const freeze = document.createElement('button');
    freeze.className = 'btn quiet';
    freeze.textContent = monitor.frozen ? 'Reanudar' : 'Congelar';
    freeze.setAttribute('aria-label', 'Congelar monitor');
    freeze.addEventListener('click', () => {
      monitor.toggleFreeze();
      renderMonitorControls();
    });
    const beep = document.createElement('button');
    beep.className = 'btn quiet';
    beep.textContent = monitor.beepOn ? 'Beep: on' : 'Beep: off';
    beep.setAttribute('aria-label', 'Pitido QRS');
    beep.addEventListener('click', () => {
      monitor.toggleBeep();
      renderMonitorControls();
    });
    const to12 = document.createElement('button');
    to12.className = 'btn quiet';
    to12.textContent = 'Ir a 12 derivaciones';
    to12.addEventListener('click', () => store.update({ mode: 'cases' }));
    monitorControls.append(freeze, beep, to12);
  };

  const renderEcgCanvas = () => {
    if (!ecg) return;
    const s = store.get();
    canvas.setAttribute(
      'aria-label',
      `ECG 12 derivaciones, ${s.caseId ?? 'laboratorio'}, ${s.view.layout}, ${s.view.speedMmS} mm/s, ${s.view.gainMmMv} mm/mV`,
    );
    const acq = s.scenario.acquisition ?? {};
    renderEcg(canvas, ecg, s.view, {
      highlightLeads: highlight ?? [],
      markers: s.view.markers,
      footerExtra: `${acq.highPassHz ?? 0.05}–${acq.lowPassHz ?? 150} Hz`,
      clean: s.view.showClean,
    });
  };

  const renderRightPanel = () => {
    const s = store.get();
    const tabs: Array<[typeof s.panelTab, string]> =
      s.mode === 'quiz'
        ? [['clinical', 'Quiz']]
        : s.mode === 'monitor'
          ? [
              ['findings', 'Lectura'],
              ['clinical', 'Clínica'],
            ]
          : s.mode === 'lab'
            ? [
                ['findings', 'Lectura'],
                ['vectors', 'Vectores'],
              ]
            : [
                ...(!isBlind(s)
                  ? ([
                      ['findings', 'Lectura'],
                      ['clinical', 'Clínica'],
                      ['teaching', 'Docencia'],
                      ['vectors', 'Vectores'],
                    ] as Array<[typeof s.panelTab, string]>)
                  : ([['reveal', 'Revelar']] as Array<[typeof s.panelTab, string]>)),
              ];
    const effectiveTab = tabs.some(([t]) => t === s.panelTab) ? s.panelTab : tabs[0]![0];
    panelTabs.innerHTML = '';
    for (const [t, label] of tabs) {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'panel-body');
      b.setAttribute('aria-selected', String(t === effectiveTab));
      b.textContent = label;
      b.addEventListener('click', () => {
        if (t === 'reveal') {
          const cur = store.get();
          const revealed = cur.caseId ? [...cur.revealedCaseIds, cur.caseId] : cur.revealedCaseIds;
          store.update({ revealedCaseIds: revealed, panelTab: 'findings' });
        } else {
          store.update({ panelTab: t });
        }
      });
      panelTabs.appendChild(b);
    }
    wireTablist(panelTabs);
    panelBody.innerHTML = '';
    if (s.mode === 'quiz') {
      renderQuizPanel(panelBody, QUIZ_FINDING_CHOICES, render);
      return;
    }
    const c = currentCase();
    switch (effectiveTab) {
      case 'clinical':
        clinicalPanel(panelBody, c, s);
        break;
      case 'findings':
        findingsPanel(panelBody, report, (leads) => {
          highlight = leads;
          renderEcgCanvas();
        });
        break;
      case 'teaching':
        teachingPanel(panelBody, c);
        break;
      case 'vectors': {
        const wrap = document.createElement('div');
        wrap.className = 'card';
        const cv = document.createElement('canvas');
        cv.style.cssText = 'width:100%;height:170px';
        wrap.appendChild(cv);
        panelBody.appendChild(wrap);
        requestAnimationFrame(() =>
          renderVectorView(cv, s.scenario, report?.measurements ?? null, { labeled: !isBlind(s) }),
        );
        break;
      }
      case 'lab':
        labPanel(panelBody, render);
        break;
    }
  };

  const renderContextBar = () => {
    const s = store.get();
    const c = currentCase();
    if (s.mode === 'monitor') {
      contextBar.style.display = 'none';
      return;
    }
    contextBar.style.display = '';
    let title = 'Sin caso';
    let meta = '';
    if (s.mode === 'lab') {
      title = 'Laboratorio';
      meta = c
        ? isBlind(s)
          ? `caso ${CASES.indexOf(c) + 1}`
          : `basado en ${c.id}`
        : 'escenario libre';
    } else if (isBlind(s) || s.mode === 'quiz') {
      const n = c ? CASES.indexOf(c) + 1 : '—';
      title = `Caso ${n}`;
      meta = 'Modo ciego';
    } else if (c) {
      title = c.title;
      meta = `${c.vignette.sex === 'M' ? 'Varón' : 'Mujer'}, ${c.vignette.age} años`;
      if ((c.scenario.timeline?.length ?? 0) > 0)
        meta += ` · ${s.tMin.toFixed(0)} min de evolución`;
    }
    contextBar.innerHTML = `<h1>${title}</h1><span class="meta">${meta}</span>`;
    contextBar.appendChild(vistaWrap);
    btnVista.textContent = `Vista: ${LAYOUT_LABEL[s.view.layout]} · ${s.view.speedMmS} mm/s · ${s.view.gainMmMv} mm/mV ▾`;
    // Keep popover selects in sync with the store.
    const syncSel = (id: string, v: string | number) => {
      const el = vistaWrap.querySelector<HTMLSelectElement>(`#${id}`);
      if (el) el.value = String(v);
    };
    syncSel('v-layout', s.view.layout);
    syncSel('v-speed', s.view.speedMmS);
    syncSel('v-gain', s.view.gainMmMv);
    syncSel('v-strip', s.view.stripS);
    // Toggles too (URL state / shortcuts can change them outside the popover).
    for (const sync of vistaToggleSyncs) sync();
  };

  const render = () => {
    const s = store.get();
    renderContextBar();
    for (const b of root.querySelectorAll<HTMLButtonElement>('.mode-tabs button')) {
      b.setAttribute('aria-selected', String(b.dataset.mode === s.mode));
    }
    wireTablist(modeTabs);
    sidebar.style.display = s.mode === 'monitor' ? 'none' : '';
    // Monitor mode: full-width sweep, no 12-lead toolbar / paper / timeline.
    const mon = s.mode === 'monitor';
    ecgWrap.style.display = mon ? 'none' : '';
    monitorStrip.style.display = mon ? '' : 'none';
    beatCard.style.display = mon ? 'none' : '';
    if (mon) monitor.start();
    else monitor.stop();
    canvas.style.cursor = s.view.calipers ? 'crosshair' : '';
    timelineEl.style.display = mon ? 'none' : '';
    metricRow.style.display = mon ? 'none' : '';
    monitorStrip.classList.toggle('monitor-full', mon);
    // Non-ischaemic scenario: the timeline row disappears entirely.
    if (!mon) {
      const hasIsch =
        s.scenario.sources.some((x) => x.st !== 0) || (s.scenario.timeline?.length ?? 0) > 0;
      timelineEl.style.display = hasIsch ? '' : 'none';
    }
    if (s.mode === 'cases' || s.mode === 'quiz') {
      renderCaseBrowser(sidebar, (c) => selectCase(c));
    } else if (s.mode === 'lab') {
      labPanel(sidebar, render);
    }
    renderPaperhead();
    renderEcgCanvas();
    renderMonitorControls();
    renderBeatReader(beatCard, ecg, report?.delineation ?? null, s, render);
    renderMetricCards(metricRow, metricCards(report?.delineation ?? null, report));
    renderRightPanel();
    timelineBar(timelineEl, render);
    const verdict = report
      ? `Veredicto: ${report.omi.positive ? 'OMI probable' : 'Sin criterios de oclusión'}${report.findings.find((f) => f.id === 'stemi-udmi4')?.positive ? ' · Criterios STEMI' : ''}`
      : '';
    if (verdict !== lastVerdict) {
      lastVerdict = verdict;
      liveEl.textContent = verdict;
    }
  };
  const renderSafe = () => withFocusPreserved(render);

  let lastVerdict = '';

  // --- Header buttons ------------------------------------------------------
  for (const b of root.querySelectorAll<HTMLButtonElement>('.mode-tabs button')) {
    b.addEventListener('click', () => {
      const mode = b.dataset.mode as AppState['mode'];
      store.update({ mode, playing: false, ...(mode === 'lab' ? { panelTab: 'findings' } : {}) });
    });
  }
  const pop = root.querySelector<HTMLElement>('#export-pop')!;
  const btnExport = root.querySelector<HTMLElement>('#btn-export')!;
  const closePop = (refocus = false) => {
    pop.hidden = true;
    pop.style.display = 'none';
    btnExport.setAttribute('aria-expanded', 'false');
    if (refocus) btnExport.focus();
  };
  const openPop = () => {
    pop.hidden = false;
    pop.style.display = '';
    btnExport.setAttribute('aria-expanded', 'true');
    pop.querySelector('button')?.focus();
  };
  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    if (pop.hidden) openPop();
    else closePop();
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !(e.target as HTMLElement).closest('.export-menu')) closePop();
  });
  pop.addEventListener('keydown', (e) => {
    const items = [...pop.querySelectorAll<HTMLElement>('button')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' && i >= 0) {
      e.preventDefault();
      items[(i + 1) % items.length]!.focus();
    } else if (e.key === 'ArrowUp' && i >= 0) {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]!.focus();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      closePop(true);
    }
  });
  pop.addEventListener('click', () => closePop());
  root.querySelector('#btn-export-png')!.addEventListener('click', () => {
    pop.hidden = true;
    void exportPng300(
      canvas,
      (off) => {
        if (!ecg) return;
        const s = store.get();
        renderEcg(off, ecg, s.view, {
          highlightLeads: highlight ?? [],
          markers: s.view.markers,
          clean: s.view.showClean,
        });
      },
      `ECG Lab · ${store.get().caseId ?? 'laboratorio'} · ${store.get().view.speedMmS} mm/s · ${store.get().view.gainMmMv} mm/mV · fs ${ecg?.fs ?? 500} Hz · Simulación educativa`,
      `ecglab-${store.get().caseId ?? 'lab'}.png`,
    ).catch(() => exportPng(canvas));
    function exportPng(c: HTMLCanvasElement): void {
      c.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ecg.png';
        a.click();
        URL.revokeObjectURL(a.href);
      }, 'image/png');
    }
  });
  root.querySelector('#btn-export-json')!.addEventListener('click', () => {
    pop.hidden = true;
    void exportJson();
    async function exportJson() {
      const { exportScenarioJson } = await import('../persistence/jsonIO.js');
      const blob = new Blob([exportScenarioJson(store.get().scenario)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ecglab-${store.get().caseId ?? 'lab'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });
  root.querySelector('#btn-copy-link')!.addEventListener('click', () => {
    pop.hidden = true;
    const s = store.get();
    void navigator.clipboard?.writeText(
      shareUrl({ scenario: s.scenario, view: s.view, patient: s.patient }),
    );
  });
  root.querySelector('#btn-copy-report')!.addEventListener('click', () => {
    pop.hidden = true;
    if (report)
      void copyReport(formatReport(report, { tMin: store.get().tMin, caseId: store.get().caseId }));
  });
  const openAbout = () => {
    if (document.querySelector('.modal-backdrop')) return;
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <h2 id="about-title">ECG Lab</h2>
      <p>Simulador clínico de ECG de 12 derivaciones (ritmos, bloqueos, ectopía, marcapasos,
      electrolitos, OMI). Herramienta <strong>educativa</strong>: no es un dispositivo médico.</p>
      <table class="kbd-table">
        <tr><td><span class="kbd">espacio</span></td><td>reproducir / pausar</td></tr>
        <tr><td><span class="kbd">←/→</span></td><td>tiempo ±1 min (⇧ ±10)</td></tr>
        <tr><td><span class="kbd">c</span></td><td>traza limpia</td></tr>
        <tr><td><span class="kbd">[ ]</span></td><td>caso anterior / siguiente</td></tr>
        <tr><td><span class="kbd">?</span></td><td>esta ayuda</td></tr>
        <tr><td><span class="kbd">←/→</span> en pestañas</td><td>cambiar de pestaña</td></tr>
      </table>
      <p>Versión 2.0 · Motor dipolar (MODEL.md) · ${CASES.length} casos clínicos.</p>
      <button id="about-close" class="primary">Cerrar</button></div>`;
    const close = () => {
      back.remove();
      root.querySelector<HTMLElement>('#btn-about')!.focus();
    };
    back.querySelector('#about-close')!.addEventListener('click', close);
    back.addEventListener('click', (e) => {
      if (e.target === back) close();
    });
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = [
        ...back.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'),
      ];
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
    document.body.appendChild(back);
    back.querySelector<HTMLElement>('#about-close')!.focus();
  };
  root.querySelector('#btn-about')!.addEventListener('click', openAbout);

  // --- Keyboard ------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'SELECT'
    )
      return;
    const s = store.get();
    switch (e.key) {
      case ' ':
        e.preventDefault();
        store.update({ playing: !s.playing });
        break;
      case 'ArrowLeft':
        store.update({ tMin: Math.max(0, s.tMin - (e.shiftKey ? 10 : 1)) });
        break;
      case 'ArrowRight':
        store.update({ tMin: s.tMin + (e.shiftKey ? 10 : 1) });
        break;
      case 'c':
        store.update({ view: { ...s.view, showClean: !s.view.showClean } });
        break;
      case '?':
        openAbout();
        break;
      case '/':
        if (e.shiftKey) openAbout();
        break;
      case '[':
      case ']': {
        const c = currentCase();
        const ids = CASES.map((x) => x.id);
        const i = c ? ids.indexOf(c.id) : -1;
        const j = i + (e.key === ']' ? 1 : -1);
        if (j >= 0 && j < ids.length) selectCase(getCase(ids[j]!)!);
        break;
      }
    }
  });

  // --- Playback timer ------------------------------------------------------
  let lastTick = 0;
  setInterval(() => {
    const s = store.get();
    if (!s.playing) {
      lastTick = 0;
      return;
    }
    const now = performance.now();
    if (!lastTick) lastTick = now;
    const dtMin = ((now - lastTick) / 1000) * s.playSpeedMinPerS;
    lastTick = now;
    store.update({ tMin: s.tMin + dtMin });
  }, 500);

  // --- Store subscription --------------------------------------------------
  let lastSig = '';
  store.subscribe((s) => {
    const sig = `${JSON.stringify(s.scenario)}|${s.tMin.toFixed(3)}|${s.analysisSource}|${s.patient.age}${s.patient.sex}`;
    if (sig !== lastSig) {
      lastSig = sig;
      regenerate();
      renderSafe();
    } else {
      renderSafe();
    }
  });

  attachCalipers(
    canvas,
    () => store.get().view,
    () => store.get().view.gainMmMv,
    {
      isOn: () => store.get().view.calipers,
      onPick: (tSec) => {
        const d = report?.delineation;
        if (!d?.beats.length) return;
        const idx = pickBeat(d, tSec);
        if (idx >= 0) store.update({ view: { ...store.get().view, beatIdx: idx, beatOpen: true } });
      },
    },
  );

  window.addEventListener('resize', () => renderEcgCanvas());
  // Panel-stack changes (e.g. mobile breakpoints) resize the wrap without a
  // window resize — observe it so the canvas re-lays out.
  let roTimer: ReturnType<typeof setTimeout> | undefined;
  new ResizeObserver(() => {
    clearTimeout(roTimer);
    roTimer = setTimeout(() => renderEcgCanvas(), 80);
  }).observe(ecgWrap);
  if (store.get().mode === 'monitor') monitor.start();

  // URL state takes precedence over the default case on first load.
  const url = readUrlState();
  if (url) {
    store.update({
      scenario: url.scenario,
      view: { ...store.get().view, ...url.view },
      patient: url.patient,
    });
  }
  regenerate();
  renderSafe();

  // Start quiz lazily when entering the mode.
  store.subscribe((s) => {
    if (s.mode === 'quiz' && s.quiz.order.length === 0) startQuiz();
  });
}
