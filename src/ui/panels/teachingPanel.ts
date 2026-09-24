import type { CaseDefinition } from '../../cases/types.js';
import { bib } from '../data/bibliography.js';

/** Teaching panel: points, pitfalls, angiography behind a reveal button, refs. */
export function teachingPanel(el: HTMLElement, c: CaseDefinition | null): void {
  if (!c) {
    el.innerHTML =
      '<div class="card"><h3>Docencia</h3><p class="mono">Selecciona un caso clínico.</p></div>';
    return;
  }
  el.innerHTML = `
    <div class="card">
      <h3>Puntos docentes</h3>
      <ul>${c.teachingPoints.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
      ${c.pitfalls?.length ? `<h3>Errores frecuentes</h3><ul>${c.pitfalls.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
      <button id="reveal-angio" class="danger">Revelar angiografía</button>
      <p id="angio" hidden class="mono" style="margin-top:8px">🫀 ${escapeHtml(c.angiography)}</p>
    </div>
    <div class="card">
      <h3>Referencias</h3>
      <ol style="font-size:12px;color:var(--muted);padding-left:18px">
        ${c.refs
          .map((n) => {
            const b = bib(n);
            if (!b) return `<li>[${n}]</li>`;
            return `<li value="${n}">${
              b.url
                ? `<a href="${b.url}" target="_blank" rel="noreferrer" style="color:var(--accent)">`
                : ''
            }${escapeHtml(b.text)}${b.url ? '</a>' : ''}</li>`;
          })
          .join('')}
      </ol>
    </div>`;
  el.querySelector('#reveal-angio')?.addEventListener('click', () => {
    const p = el.querySelector<HTMLElement>('#angio');
    const btn = el.querySelector<HTMLButtonElement>('#reveal-angio');
    if (p && btn) {
      p.hidden = !p.hidden;
      btn.textContent = p.hidden ? 'Revelar angiografía' : 'Ocultar angiografía';
    }
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
