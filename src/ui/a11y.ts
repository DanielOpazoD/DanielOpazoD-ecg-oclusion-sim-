/** Accessibility helpers: focus preservation + roving-tabindex tablists. */

/**
 * Run `fn` (typically a full re-render) without losing keyboard focus: if the
 * focused element has an id it is re-focused afterwards, restoring the text
 * selection on editable fields.
 */
export function withFocusPreserved(fn: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  const id = active?.id;
  const sel =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? ([active.selectionStart, active.selectionEnd] as const)
      : null;
  fn();
  if (!id) return;
  const next = document.getElementById(id);
  if (!next || next === active) return;
  next.focus({ preventScroll: true });
  if (sel && (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement))
    next.setSelectionRange(sel[0], sel[1]);
}

/**
 * Roving tabindex for a `[role=tablist]` container: the selected tab gets
 * tabindex 0, the rest −1; ArrowLeft/Right/Home/End move focus AND activate
 * (click). Call once after building the buttons; re-call when the selection
 * changes to keep tabindex in sync (or call `sync` — it also syncs).
 */
export function wireTablist(container: HTMLElement): void {
  const tabs = () => [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
  const sync = () => {
    for (const t of tabs()) t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1;
  };
  if (!container.dataset['tablistWired']) {
    container.dataset['tablistWired'] = '1';
    container.addEventListener('keydown', (e) => {
      const list = tabs();
      const cur = document.activeElement as HTMLElement | null;
      const i = list.indexOf(cur!);
      if (i < 0) return;
      let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % list.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + list.length) % list.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = list.length - 1;
      else return;
      e.preventDefault();
      e.stopPropagation();
      const next = list[j]!;
      next.focus();
      next.click();
      sync();
    });
  }
  sync();
}
