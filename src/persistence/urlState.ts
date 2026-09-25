import type { Scenario } from '../engine/index.js';
import type { ViewState } from '../ui/state/appState.js';

/** Serializable shareable state: scenario + view (and patient context). */
export interface ShareState {
  scenario: Scenario;
  view: ViewState;
  patient: { sex: 'M' | 'F'; age: number };
}

function b64urlEncode(s: string): string {
  // UTF-8 safe base64url.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** scenario + view → `?s=` payload. */
export function encodeShareState(state: ShareState): string {
  return b64urlEncode(JSON.stringify(state));
}

/** `?s=` payload → scenario + view. Returns null on malformed input. */
export function decodeShareState(encoded: string): ShareState | null {
  try {
    const obj = JSON.parse(b64urlDecode(encoded)) as Partial<ShareState>;
    if (!obj || typeof obj !== 'object') return null;
    if (!obj.scenario || typeof obj.scenario !== 'object') return null;
    if (typeof obj.scenario.seed !== 'number' || !Array.isArray(obj.scenario.sources)) return null;
    if (!obj.view || typeof obj.view.speedMmS !== 'number') return null;
    if (!obj.patient || (obj.patient.sex !== 'M' && obj.patient.sex !== 'F')) return null;
    // Tolerate keys dropped from the schema (e.g. the removed `theme` flag).
    delete (obj.view as { theme?: unknown }).theme;
    return obj as ShareState;
  } catch {
    return null;
  }
}

/** Read `?s=` from the current location (null if absent/malformed). */
export function readUrlState(search = globalThis.location?.search ?? ''): ShareState | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const s = params.get('s');
  return s ? decodeShareState(s) : null;
}

/** Build the shareable URL for the state (keeps path, replaces `?s=`). */
export function shareUrl(state: ShareState, base = globalThis.location?.origin ?? ''): string {
  const path = globalThis.location?.pathname ?? '/';
  return `${base}${path}?s=${encodeShareState(state)}`;
}
