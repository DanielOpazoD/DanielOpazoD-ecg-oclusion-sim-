import { generateEcg, type Ecg12 } from '../engine/index.js';
import { analyzeEcg, type AnalysisReport } from '../analysis/index.js';
import { getCase, CASES } from '../cases/index.js';
import { store, setTheme, isBlind, type AppState } from './state/appState.js';
import { renderEcg } from './ecg/renderer.js';
import { Monitor } from './ecg/monitor.js';
import { renderVectorView } from './ecg/vectorView.js';
import { attachCalipers } from './ecg/calipers.js';
import { clinicalPanel } from './panels/clinicalPanel.js';
import { findingsPanel } from './panels/findingsPanel.js';
import { measurementsPanel } from './panels/measurementsPanel.js';
import { teachingPanel } from './panels/teachingPanel.js';
import { labPanel } from './panels/labPanel.js';
import { timelineBar } from './panels/timelineBar.js';
import { renderCaseBrowser, selectCase, currentCase } from './modes/casesMode.js';
import { renderQuizPanel, startQuiz, QUIZ_FINDING_CHOICES } from './modes/quizMode.js';
import { formatReport, exportPng, copyReport } from './export.js';
import type { LeadId } from '../engine/index.js';

/** Mount the whole app into #app. */
export function mount(root: HTMLElement): void {
  root.innerHTML = `
    <header class="app-header">
      <div class="brand">OMI Lab<span class="sub">Simulador ECG de oclusión coronaria</span></div>
      <nav class="mode-tabs" role="tablist">
        <button data-mode="cases" role="tab">Casos</button>
        <button data-mode="lab" role="tab">Laboratorio</button>
        <button data-mode="quiz" role="tab">Quiz</button>
      </nav>
      <div class="header-spacer"></div>
      <button id="btn-export-png" aria-label="Exportar PNG">PNG</button>
      <button id="btn-copy-report" aria-label="Copiar informe">Informe</button>
      <button id="btn-theme" aria-label="Cambiar tema">◐</button>
      <button id="btn-about" aria-label="Acerca de">?</button>
    </header>
    <div class="app-main">
      <aside class="sidebar" id="sidebar"></aside>
      <section class="center">
        <div class="toolbar" id="toolbar"></div>
        <div class="ecg-wrap">
          <div class="ecg-paper"><canvas id="ecg-canvas" aria-label="Trazado ECG"></canvas></div>
          <div class="monitor-strip"><canvas id="monitor-canvas" aria-label="Monitor"></canvas></div>
        </div>
        <div class="timeline-bar" id="timeline"></div>
      </section>
      <aside class="right-panel">
        <div class="panel-tabs" id="panel-tabs"></div>
        <div class="panel-body" id="panel-body"></div>
        <div class="card" style="margin:8px"><canvas id="vector-canvas" style="width:100%;height:170px" aria-label="Vectores"></canvas></div>
      </aside>
    </div>`;

  document.documentElement.dataset.theme = store.get().view.theme;

  const canvas = root.querySelector<HTMLCanvasElement>('#ecg-canvas')!;
  const monitorCanvas = root.querySelector<HTMLCanvasElement>('#monitor-canvas')!;
  const vectorCanvas = root.querySelector<HTMLCanvasElement>('#vector-canvas')!;
  const sidebar = root.querySelector<HTMLElement>('#sidebar')!;
  const toolbar = root.querySelector<HTMLElement>('#toolbar')!;
  const timelineEl = root.querySelector<HTMLElement>('#timeline')!;
  const panelTabs = root.querySelector<HTMLElement>('#panel-tabs')!;
  const panelBody = root.querySelector<HTMLElement>('#panel-body')!;

  let ecg: Ecg12 | null = null;
  let report: AnalysisReport | null = null;
  let highlight: LeadId[] | null = null;
  const monitor = new Monitor(monitorCanvas, () => ecg);

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

  const renderToolbar = () => {
    const s = store.get();
    const acq = s.scenario.acquisition ?? {};
    toolbar.innerHTML = `
      <label>Velocidad <select id="v-speed">${[25, 50].map((v) => `<option ${v === s.view.speedMmS ? 'selected' : ''}>${v}</option>`).join('')}</select> mm/s</label>
      <label>Ganancia <select id="v-gain">${[5, 10, 20].map((v) => `<option ${v === s.view.gainMmMv ? 'selected' : ''}>${v}</option>`).join('')}</select> mm/mV</label>
      <label>Layout <select id="v-layout">${(['3x4', '3x4+II', '6x2', '12x1'] as const)
        .map((v) => `<option ${v === s.view.layout ? 'selected' : ''}>${v}</option>`)
        .join('')}</select></label>
      <label><input type="checkbox" id="v-clean" ${s.view.showClean ? 'checked' : ''}> clean</label>
      <label><input type="checkbox" id="v-extra" ${s.view.extraLeads ? 'checked' : ''}> V7–V9/V3R–V4R</label>
      <label><input type="checkbox" id="v-mark" ${s.view.markers ? 'checked' : ''}> marcadores</label>
      <span style="flex:1"></span>
      <span class="kbd">HP ${acq.highPassHz ?? 0.05} Hz · LP ${acq.lowPassHz ?? 150} Hz</span>`;
    toolbar.querySelector('#v-speed')!.addEventListener('change', (e) =>
      store.update({
        view: {
          ...store.get().view,
          speedMmS: Number((e.target as HTMLSelectElement).value) as 25 | 50,
        },
      }),
    );
    toolbar.querySelector('#v-gain')!.addEventListener('change', (e) =>
      store.update({
        view: {
          ...store.get().view,
          gainMmMv: Number((e.target as HTMLSelectElement).value) as 5 | 10 | 20,
        },
      }),
    );
    toolbar.querySelector('#v-layout')!.addEventListener('change', (e) =>
      store.update({
        view: {
          ...store.get().view,
          layout: (e.target as HTMLSelectElement).value as typeof s.view.layout,
        },
      }),
    );
    toolbar.querySelector('#v-clean')!.addEventListener('change', (e) =>
      store.update({
        view: { ...store.get().view, showClean: (e.target as HTMLInputElement).checked },
      }),
    );
    toolbar.querySelector('#v-extra')!.addEventListener('change', (e) =>
      store.update({
        view: { ...store.get().view, extraLeads: (e.target as HTMLInputElement).checked },
      }),
    );
    toolbar.querySelector('#v-mark')!.addEventListener('change', (e) =>
      store.update({
        view: { ...store.get().view, markers: (e.target as HTMLInputElement).checked },
      }),
    );
  };

  const renderEcgCanvas = () => {
    if (!ecg) return;
    const s = store.get();
    const acq = s.scenario.acquisition ?? {};
    renderEcg(canvas, ecg, s.view, {
      highlightLeads: highlight ?? [],
      markers: s.view.markers,
      footerExtra: `${acq.highPassHz ?? 0.05}–${acq.lowPassHz ?? 150} Hz`,
    });
  };

  const renderRightPanel = () => {
    const s = store.get();
    const tabs: Array<[typeof s.panelTab, string]> =
      s.mode === 'quiz'
        ? [['clinical', 'Quiz']]
        : s.mode === 'lab'
          ? [
              ['lab', 'Escenario'],
              ['findings', 'Hallazgos'],
              ['measurements', 'Medidas'],
            ]
          : [
              ['clinical', 'Clínica'],
              ...(!isBlind(s)
                ? ([
                    ['findings', 'Hallazgos'],
                    ['measurements', 'Medidas'],
                    ['teaching', 'Docencia'],
                  ] as Array<[typeof s.panelTab, string]>)
                : ([
                    ['measurements', 'Medidas'],
                    ['reveal', 'Revelar'],
                  ] as Array<[typeof s.panelTab, string]>)),
            ];
    const effectiveTab = tabs.some(([t]) => t === s.panelTab) ? s.panelTab : tabs[0]![0];
    panelTabs.innerHTML = '';
    for (const [t, label] of tabs) {
      const b = document.createElement('button');
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
      case 'measurements':
        measurementsPanel(panelBody, report?.measurements ?? null);
        break;
      case 'teaching':
        teachingPanel(panelBody, c);
        break;
      case 'lab':
        labPanel(panelBody, render);
        break;
    }
  };

  const render = () => {
    const s = store.get();
    document.documentElement.dataset.theme = s.view.theme;
    for (const b of root.querySelectorAll<HTMLButtonElement>('.mode-tabs button')) {
      b.setAttribute('aria-selected', String(b.dataset.mode === s.mode));
    }
    sidebar.style.display = s.mode === 'cases' || s.mode === 'quiz' ? '' : 'none';
    if (s.mode !== 'lab') {
      renderCaseBrowser(sidebar, (c) => {
        selectCase(c);
      });
    }
    renderToolbar();
    renderEcgCanvas();
    renderRightPanel();
    timelineBar(timelineEl, render);
    renderVectorView(vectorCanvas, s.scenario, report?.measurements ?? null, {
      labeled: !isBlind(s),
    });
  };

  // --- Header buttons ------------------------------------------------------
  for (const b of root.querySelectorAll<HTMLButtonElement>('.mode-tabs button')) {
    b.addEventListener('click', () => {
      const mode = b.dataset.mode as AppState['mode'];
      store.update({ mode, playing: false, ...(mode === 'lab' ? { panelTab: 'lab' } : {}) });
    });
  }
  root.querySelector('#btn-theme')!.addEventListener('click', () => {
    setTheme(store.get().view.theme === 'dark' ? 'light' : 'dark');
  });
  root.querySelector('#btn-export-png')!.addEventListener('click', () => exportPng(canvas));
  root.querySelector('#btn-copy-report')!.addEventListener('click', () => {
    if (report)
      void copyReport(formatReport(report, { tMin: store.get().tMin, caseId: store.get().caseId }));
  });
  root.querySelector('#btn-about')!.addEventListener('click', () => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h2>OMI Lab</h2>
      <p>Simulador de ECG de oclusión coronaria aguda. Herramienta <strong>educativa</strong>:
      no es un dispositivo médico ni sustituye el juicio clínico.</p>
      <p>Versión 0.1.0 · Motor dipolar (MODEL.md) · 50 casos clínicos.</p>
      <button id="about-close" class="primary">Cerrar</button></div>`;
    back.querySelector('#about-close')!.addEventListener('click', () => back.remove());
    back.addEventListener('click', (e) => {
      if (e.target === back) back.remove();
    });
    document.body.appendChild(back);
  });

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
    // Regenerate only when scenario/tMin/source changes; cheap enough anyway.
    const sig = `${JSON.stringify(s.scenario)}|${s.tMin.toFixed(3)}|${s.analysisSource}|${s.patient.age}${s.patient.sex}`;
    if (sig !== lastSig) {
      lastSig = sig;
      regenerate();
      render();
    } else {
      render();
    }
  });

  attachCalipers(
    canvas,
    () => {
      const s = store.get();
      const cellSec = s.view.layout === '12x1' ? 10 : s.view.layout === '6x2' ? 5 : 2.5;
      const cols = s.view.layout === '12x1' ? 1 : s.view.layout === '6x2' ? 6 : 3;
      const pxPerMm = (canvas.clientWidth - 16) / (s.view.speedMmS * cellSec * cols);
      return { pxPerMm, marginPx: 8 };
    },
    () => store.get().view.gainMmMv,
  );

  window.addEventListener('resize', () => renderEcgCanvas());
  monitor.start();
  regenerate();
  render();

  // Start quiz lazily when entering the mode.
  store.subscribe((s) => {
    if (s.mode === 'quiz' && s.quiz.order.length === 0) startQuiz();
  });
}
