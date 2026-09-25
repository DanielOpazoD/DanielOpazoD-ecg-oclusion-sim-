import { generateEcg, type Ecg12 } from '../engine/index.js';
import { analyzeEcg, type AnalysisReport } from '../analysis/index.js';
import { getCase, CASES } from '../cases/index.js';
import { store, setTheme, isBlind, type AppState, type ViewState } from './state/appState.js';
import { renderEcg } from './ecg/renderer.js';
import { Monitor } from './ecg/monitor.js';
import { renderVectorView } from './ecg/vectorView.js';
import { attachCalipers } from './ecg/calipers.js';
import { renderBeatDetailSvg } from './ecg/beatDetail.js';
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
import type { LeadId } from '../engine/index.js';

/** Mount the whole app into #app. */
export function mount(root: HTMLElement): void {
  root.innerHTML = `
    <header class="app-header">
      <div class="brand">ECG Lab<span class="sub">Simulador clínico · OMI Lab (isquemia)</span></div>
      <nav class="mode-tabs" role="tablist" aria-label="Modo">
        <button data-mode="cases" role="tab" aria-label="Casos">Casos</button>
        <button data-mode="lab" role="tab" aria-label="Laboratorio">Laboratorio</button>
        <button data-mode="monitor" role="tab" aria-label="Monitor">Monitor</button>
        <button data-mode="quiz" role="tab" aria-label="Quiz">Quiz</button>
      </nav>
      <div class="header-spacer"></div>
      <div class="export-menu">
        <button id="btn-export" aria-label="Exportar" aria-haspopup="true">Exportar ▾</button>
        <div class="export-pop" id="export-pop" hidden>
          <button id="btn-export-png" aria-label="Exportar PNG 300 dpi">PNG (300 dpi)</button>
          <button id="btn-export-json" aria-label="Exportar JSON">JSON del escenario</button>
          <button id="btn-copy-link" aria-label="Copiar enlace">Copiar enlace</button>
          <button id="btn-copy-report" aria-label="Copiar informe">Copiar informe</button>
        </div>
      </div>
      <button id="btn-theme" aria-label="Cambiar tema">◐</button>
      <button id="btn-about" aria-label="Ayuda">?</button>
    </header>
    <div class="app-main">
      <aside class="sidebar" id="sidebar"></aside>
      <section class="center">
        <div class="toolbar" id="toolbar"></div>
        <div class="ecg-wrap" id="ecg-wrap">
          <div class="ecg-paper"><canvas id="ecg-canvas" aria-label="Trazado ECG"></canvas></div>
          <div class="monitor-strip" id="monitor-strip"><canvas id="monitor-canvas" aria-label="Monitor"></canvas>
            <div class="monitor-controls" id="monitor-controls"></div>
          </div>
        </div>
        <div class="metric-row" id="metric-row"></div>
        <div class="timeline-bar" id="timeline"></div>
      </section>
      <aside class="right-panel">
        <div class="panel-tabs" id="panel-tabs"></div>
        <div class="panel-body" id="panel-body"></div>
      </aside>
    </div>`;

  document.documentElement.dataset.theme = store.get().view.theme;

  const canvas = root.querySelector<HTMLCanvasElement>('#ecg-canvas')!;
  const monitorCanvas = root.querySelector<HTMLCanvasElement>('#monitor-canvas')!;
  const monitorControls = root.querySelector<HTMLElement>('#monitor-controls')!;
  const monitorStrip = root.querySelector<HTMLElement>('#monitor-strip')!;
  const sidebar = root.querySelector<HTMLElement>('#sidebar')!;
  const toolbar = root.querySelector<HTMLElement>('#toolbar')!;
  const timelineEl = root.querySelector<HTMLElement>('#timeline')!;
  const metricRow = root.querySelector<HTMLElement>('#metric-row')!;
  const panelTabs = root.querySelector<HTMLElement>('#panel-tabs')!;
  const panelBody = root.querySelector<HTMLElement>('#panel-body')!;
  const ecgWrap = root.querySelector<HTMLElement>('#ecg-wrap')!;

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
    opts: (string | number)[],
    value: string | number,
    onchange: (v: string) => void,
  ) => {
    const l = document.createElement('label');
    l.innerHTML = `<select id="${id}">${opts
      .map(
        (v) =>
          `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${v}</option>`,
      )
      .join('')}</select>`;
    l.querySelector('select')!.addEventListener('change', (e) =>
      onchange((e.target as HTMLSelectElement).value),
    );
    return l;
  };

  const renderToolbar = () => {
    const s = store.get();
    const acq = s.scenario.acquisition ?? {};
    toolbar.innerHTML = '';
    const setView = (patch: Partial<ViewState>) =>
      store.update({ view: { ...store.get().view, ...patch } });
    toolbar.append(
      sel('v-layout', ['3x4', '3x4+II', '3x4+3strips', '6x2', '12x1'], s.view.layout, (v) =>
        setView({ layout: v as ViewState['layout'] }),
      ),
      sel('v-speed', [25, 50], s.view.speedMmS, (v) => setView({ speedMmS: Number(v) as 25 | 50 })),
      sel('v-gain', [5, 10, 20], s.view.gainMmMv, (v) =>
        setView({ gainMmMv: Number(v) as 5 | 10 | 20 }),
      ),
      sel('v-strip', [10, 30, 60], s.view.stripS, (v) =>
        setView({ stripS: Number(v) as 10 | 30 | 60 }),
      ),
    );
    const mk = (label: string, checked: boolean, on: (v: boolean) => void) => {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" ${checked ? 'checked' : ''}> ${label}`;
      l.querySelector('input')!.addEventListener('change', (e) =>
        on((e.target as HTMLInputElement).checked),
      );
      return l;
    };
    toolbar.append(
      mk('Cabrera', s.view.cabrera, (v) => setView({ cabrera: v })),
      mk('simultáneo', s.view.simultaneous, (v) => setView({ simultaneous: v })),
      mk('limpia', s.view.showClean, (v) => setView({ showClean: v })),
      mk('extra', s.view.extraLeads, (v) => setView({ extraLeads: v })),
      mk('marcadores', s.view.markers, (v) => setView({ markers: v })),
    );
    const info = document.createElement('span');
    info.className = 'kbd';
    info.style.marginLeft = 'auto';
    info.textContent = `HP ${acq.highPassHz ?? 0.05} Hz · LP ${acq.lowPassHz ?? 150} Hz`;
    toolbar.appendChild(info);
  };

  const renderMonitorControls = () => {
    const s = store.get();
    monitorStrip.classList.toggle('monitor-full', s.mode === 'monitor');
    monitorControls.innerHTML = '';
    if (s.mode !== 'monitor') return;
    const freeze = document.createElement('button');
    freeze.textContent = monitor.frozen ? 'Reanudar' : 'Congelar';
    freeze.setAttribute('aria-label', 'Congelar monitor');
    freeze.addEventListener('click', () => {
      monitor.toggleFreeze();
      renderMonitorControls();
    });
    const beep = document.createElement('button');
    beep.textContent = monitor.beepOn ? 'Beep: on' : 'Beep: off';
    beep.setAttribute('aria-label', 'Pitido QRS');
    beep.addEventListener('click', () => {
      monitor.toggleBeep();
      renderMonitorControls();
    });
    const to12 = document.createElement('button');
    to12.textContent = 'Ir a 12 derivaciones';
    to12.addEventListener('click', () => store.update({ mode: 'cases' }));
    monitorControls.append(freeze, beep, to12);
  };

  const renderEcgCanvas = () => {
    if (!ecg) return;
    const s = store.get();
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
              ['clinical', 'Clínica'],
              ['findings', 'Hallazgos'],
            ]
          : s.mode === 'lab'
            ? [
                ['findings', 'Hallazgos'],
                ['beat', 'Latido'],
                ['vectors', 'Vectores'],
              ]
            : [
                ['clinical', 'Clínica'],
                ...(!isBlind(s)
                  ? ([
                      ['findings', 'Hallazgos'],
                      ['teaching', 'Docencia'],
                      ['beat', 'Latido'],
                      ['vectors', 'Vectores'],
                    ] as Array<[typeof s.panelTab, string]>)
                  : ([['reveal', 'Revelar']] as Array<[typeof s.panelTab, string]>)),
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
      case 'teaching':
        teachingPanel(panelBody, c);
        break;
      case 'beat': {
        const wrap = document.createElement('div');
        wrap.className = 'card';
        wrap.innerHTML = '<h3>Latido (delineado vs verdad)</h3>';
        const svg = renderBeatDetailSvg(ecg!, report?.delineation ?? null, 'II', {
          showTruth: true,
        });
        const d = document.createElement('div');
        d.innerHTML =
          svg + renderBeatDetailSvg(ecg!, report?.delineation ?? null, 'V1', { showTruth: true });
        wrap.appendChild(d);
        panelBody.appendChild(wrap);
        break;
      }
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

  const render = () => {
    const s = store.get();
    document.documentElement.dataset.theme = s.view.theme;
    for (const b of root.querySelectorAll<HTMLButtonElement>('.mode-tabs button')) {
      b.setAttribute('aria-selected', String(b.dataset.mode === s.mode));
    }
    sidebar.style.display = s.mode === 'monitor' ? 'none' : '';
    ecgWrap.style.display = s.mode === 'monitor' ? 'none' : '';
    monitorStrip.style.display = '';
    if (s.mode === 'monitor') {
      monitorStrip.classList.add('monitor-full');
    } else {
      monitorStrip.classList.remove('monitor-full');
    }
    if (s.mode === 'cases' || s.mode === 'quiz') {
      renderCaseBrowser(sidebar, (c) => selectCase(c));
    } else if (s.mode === 'lab') {
      labPanel(sidebar, render);
    }
    renderToolbar();
    renderEcgCanvas();
    renderMonitorControls();
    renderMetricCards(metricRow, metricCards(report?.delineation ?? null, report));
    renderRightPanel();
    timelineBar(timelineEl, render);
  };

  // --- Header buttons ------------------------------------------------------
  for (const b of root.querySelectorAll<HTMLButtonElement>('.mode-tabs button')) {
    b.addEventListener('click', () => {
      const mode = b.dataset.mode as AppState['mode'];
      store.update({ mode, playing: false, ...(mode === 'lab' ? { panelTab: 'findings' } : {}) });
    });
  }
  root.querySelector('#btn-theme')!.addEventListener('click', () => {
    setTheme(store.get().view.theme === 'dark' ? 'light' : 'dark');
  });
  const pop = root.querySelector<HTMLElement>('#export-pop')!;
  root.querySelector('#btn-export')!.addEventListener('click', () => {
    pop.hidden = !pop.hidden;
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !(e.target as HTMLElement).closest('.export-menu')) pop.hidden = true;
  });
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
  root.querySelector('#btn-about')!.addEventListener('click', () => {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h2>ECG Lab</h2>
      <p>Simulador clínico de ECG de 12 derivaciones (ritmos, bloqueos, ectopía, marcapasos,
      electrolitos, OMI). Herramienta <strong>educativa</strong>: no es un dispositivo médico.</p>
      <p>Teclas: <span class="kbd">espacio</span> play · <span class="kbd">←/→</span> tiempo ·
      <span class="kbd">c</span> limpia · <span class="kbd">[ ]</span> caso anterior/siguiente.</p>
      <p>Versión 2.0 · Motor dipolar (MODEL.md) · ${CASES.length} casos clínicos.</p>
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
  render();

  // Start quiz lazily when entering the mode.
  store.subscribe((s) => {
    if (s.mode === 'quiz' && s.quiz.order.length === 0) startQuiz();
  });
}
