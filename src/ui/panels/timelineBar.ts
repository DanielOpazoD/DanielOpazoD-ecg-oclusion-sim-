import type { TimelineEvent } from '../../engine/index.js';
import { effectiveSource } from '../../engine/index.js';
import { store, isBlind } from '../state/appState.js';

/** Phase label from effective injury fractions at tMin. */
export function phaseLabel(
  scenario: {
    sources: Array<{ st: number; hyperacuteT?: number; tInversion?: number; qLoss?: number }>;
    timeline?: TimelineEvent[];
  },
  tMin: number,
): string {
  const evs = scenario.timeline ?? [];
  const last = [...evs].filter((e) => e.atMin <= tMin).sort((a, b) => b.atMin - a.atMin)[0];
  if (last?.kind === 'reperfusion') return 'Reperfusión';
  let hyper = 0;
  let st = 0;
  let q = 0;
  let inv = 0;
  for (const src of scenario.sources) {
    const eff = effectiveSource(
      { st: src.st, hyperacuteT: src.hyperacuteT ?? 0, tInversion: src.tInversion ?? 0 },
      evs,
      tMin,
    );
    hyper = Math.max(hyper, eff.hyperacuteT);
    st = Math.max(st, eff.st / Math.max(Math.abs(src.st), 1e-6));
    q = Math.max(q, eff.qLoss);
    inv = Math.max(inv, eff.tInversion);
  }
  if (inv > 0.5) return 'Inversión de T';
  if (q > 0.5) return 'Onda Q';
  if (st > 0.3) return 'STE';
  if (hyper > 0.3) return 'T hiperaguda';
  return 'Preoclusión';
}

const KIND_LABEL: Record<TimelineEvent['kind'], string> = {
  occlusion: 'Oclusión',
  reperfusion: 'Reperfusión',
  reocclusion: 'Reoclusión',
};

const MAX_MIN = 2880;

/** Timeline scrubber 0–2880 min + event markers + play/pause + speed. */
export function timelineBar(el: HTMLElement, onChange: () => void): void {
  const state = store.get();
  const evs = state.scenario.timeline ?? [];
  const evTxt = isBlind(state)
    ? ''
    : evs
        .slice()
        .sort((a, b) => a.atMin - b.atMin)
        .map((e) => `${KIND_LABEL[e.kind]} @${e.atMin}′`)
        .join(' · ') || 'Oclusión @0′';
  const sub =
    evTxt +
    (isBlind(state) || evs.some((e) => e.kind === 'reperfusion') ? '' : ' · sin reperfusión');
  el.innerHTML = `
    <div class="tl-head">
      <div><h3>Evolución · ${state.tMin.toFixed(0)} min</h3>
      <span class="tl-sub">${sub}${
        isBlind(state)
          ? ''
          : ` <span class="tl-phase">${phaseLabel(state.scenario, state.tMin)}</span>`
      }</span></div>
      <div class="seg" role="group" aria-label="Evolución">
        <button id="tl-play" aria-label="${state.playing ? 'Pausar' : 'Reproducir'}">${
          state.playing ? '⏸' : '▶'
        }</button>
        ${isBlind(state) ? '' : '<button id="tl-rep">+Reperfusión</button><button id="tl-reocc">+Reoclusión</button>'}
      </div>
      <label class="tl-speed">velocidad
        <select id="tl-speed" aria-label="Velocidad de reproducción">
          ${[1, 5, 20].map((v) => `<option value="${v}" ${v === state.playSpeedMinPerS ? 'selected' : ''}>×${v}</option>`).join('')}
        </select></label>
    </div>
    <input type="range" id="tl-range" min="0" max="${MAX_MIN}" step="1" value="${state.tMin}" aria-label="Tiempo en minutos">`;

  el.querySelector('#tl-range')?.addEventListener('input', (e) => {
    store.update({ tMin: Number((e.target as HTMLInputElement).value) });
    onChange();
  });
  el.querySelector('#tl-speed')?.addEventListener('change', (e) => {
    store.update({ playSpeedMinPerS: Number((e.target as HTMLSelectElement).value) });
  });
  el.querySelector('#tl-play')?.addEventListener('click', () => {
    store.update({ playing: !store.get().playing });
  });
  const addEvent = (kind: TimelineEvent['kind']) => {
    const s = store.get();
    const timeline = [...(s.scenario.timeline ?? []), { atMin: Math.round(s.tMin), kind }].sort(
      (a, b) => a.atMin - b.atMin,
    );
    store.update({ scenario: { ...s.scenario, timeline } });
    onChange();
  };
  el.querySelector('#tl-rep')?.addEventListener('click', () => addEvent('reperfusion'));
  el.querySelector('#tl-reocc')?.addEventListener('click', () => addEvent('reocclusion'));
}
