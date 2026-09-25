import type { Ecg12, LeadId } from '../../engine/index.js';
import { LEAD_IDS } from '../../engine/index.js';
import type { Delineation } from '../../analysis/delineate/delineate.js';
import { pickBeat, beatWindow, renderBeatReaderSvg } from '../ecg/beatDetail.js';
import { store, type AppState } from '../state/appState.js';

const STD_LEADS = LEAD_IDS.slice(0, 12);

/** Footer status dot from the delineation's QRS evidence state. */
const STATUS = {
  usable: { color: 'var(--ok)', label: 'QRS reproducible' },
  review: { color: 'var(--warning)', label: 'QRS con dudas' },
  unavailable: { color: 'var(--muted)', label: 'QRS no delineable' },
} as const;

/**
 * «Un latido, de cerca» card below the paper: wide per-beat readout with
 * fiducials and PR/QRS/QT dimensions, beat picker ‹ ›, lead select and an
 * expandable per-beat measurements table.
 */
export function renderBeatReader(
  el: HTMLElement,
  ecg: Ecg12 | null,
  delineation: Delineation | null,
  _state: AppState,
  onChanged: () => void,
): void {
  const s = store.get();
  const setView = (patch: Partial<AppState['view']>) =>
    store.update({ view: { ...s.view, ...patch } });
  const beats = delineation?.beats ?? [];
  el.innerHTML = '';
  el.className = 'card beat-reader';
  el.innerHTML = `
    <div class="br-head">
      <div><div class="kicker">Lectura de la señal</div><h3>Un latido, de cerca</h3></div>
      <div class="br-controls"></div>
    </div>
    <div class="br-plot"></div>
    <div class="br-foot"></div>
    <details class="br-detail"><summary>Ver detalle de las medidas</summary><div class="br-table"></div></details>
    <p class="br-hint">Selecciona un complejo en el papel para ampliarlo.
      <span class="mono">*J</span> estimado por el final del QRS.</p>`;
  const ctr = el.querySelector<HTMLElement>('.br-controls')!;
  const plot = el.querySelector<HTMLElement>('.br-plot')!;
  const foot = el.querySelector<HTMLElement>('.br-foot')!;
  const detail = el.querySelector<HTMLDetailsElement>('.br-detail')!;
  const table = el.querySelector<HTMLElement>('.br-table')!;

  if (!ecg || !beats.length) {
    plot.innerHTML = `<p class="mono" style="color:var(--muted);padding:12px 0">
      Sin latidos delineables en este trazado.</p>`;
    el.querySelector('.br-foot')!.remove();
    detail.remove();
    return;
  }

  const idx =
    s.view.beatIdx != null && beats[s.view.beatIdx]
      ? s.view.beatIdx
      : Math.max(
          0,
          beats.findIndex((b) => b.qrsOnsetS > 0.15),
        );
  const lead = s.view.beatLead;

  ctr.innerHTML = `
    <span class="br-count">Latido <b>${idx + 1}</b> / ${beats.length}</span>
    <button id="br-prev" aria-label="Latido anterior" ${idx <= 0 ? 'disabled' : ''}>‹</button>
    <button id="br-next" aria-label="Latido siguiente" ${idx >= beats.length - 1 ? 'disabled' : ''}>›</button>
    <select aria-label="Derivación">${STD_LEADS.map(
      (l) => `<option value="${l}" ${l === lead ? 'selected' : ''}>${l}</option>`,
    ).join('')}</select>`;
  ctr.querySelector('#br-prev')!.addEventListener('click', () => setView({ beatIdx: idx - 1 }));
  ctr.querySelector('#br-next')!.addEventListener('click', () => setView({ beatIdx: idx + 1 }));
  ctr
    .querySelector('select')!
    .addEventListener('change', (e) =>
      setView({ beatLead: (e.target as HTMLSelectElement).value as LeadId }),
    );

  plot.innerHTML = renderBeatReaderSvg(ecg, delineation!, idx, lead);

  const st = STATUS[delineation!.evidence.qrs.status] ?? STATUS.unavailable;
  foot.innerHTML = `
    <span class="br-status"><span class="br-dot" style="background:${st.color}"></span>
      ${st.label}</span>
    <span class="br-meta">${beats.length} latidos · resolución ${(1000 / ecg.fs).toFixed(0)} ms</span>`;

  // Per-beat measurements table (current row highlighted).
  const qtc = delineation!.qtc;
  const rows = beats
    .map((b, i) => {
      const rr = i > 0 ? Math.round((b.qrsOnsetS - beats[i - 1]!.qrsOnsetS) * 1000) : null;
      const pr = b.pOnsetS !== undefined ? Math.round((b.qrsOnsetS - b.pOnsetS) * 1000) : null;
      const qrs = Math.round((b.qrsEndS - b.qrsOnsetS) * 1000);
      const qt = b.tEndS !== undefined ? Math.round((b.tEndS - b.qrsOnsetS) * 1000) : null;
      const cell = (v: number | null) => `<td class="num">${v ?? '—'}</td>`;
      return `<tr class="${i === idx ? 'cur' : ''}"><td>${i + 1}</td>${cell(rr)}${cell(pr)}${cell(qrs)}${cell(qt)}</tr>`;
    })
    .join('');
  table.innerHTML = `
    <table class="meas"><tr><th>#</th><th>RR ms</th><th>PR ms</th><th>QRS ms</th><th>QT ms</th></tr>
    ${rows}</table>
    <p class="mono" style="font-size:11px;color:var(--muted)">QTc:
      Bazett ${fmt(qtc.bazett)} · Fridericia ${fmt(qtc.fridericia)} · Framingham ${fmt(qtc.framingham)} · Hodges ${fmt(qtc.hodges)} ms</p>`;

  // Clicking a row selects that beat too.
  table.querySelectorAll('tr.cur, tr:not(.cur)').forEach((tr, i) => {
    if (i === 0) return; // header
    tr.addEventListener('click', () => {
      const n = Number(tr.querySelector('td')!.textContent);
      if (Number.isFinite(n)) setView({ beatIdx: n - 1 });
    });
  });

  void _state;
  void onChanged;
}

const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(0));

/** Exposed for the canvas click → beat pick wiring. */
export { pickBeat, beatWindow };
