// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  encodeShareState,
  decodeShareState,
  shareUrl,
  readUrlState,
} from '../persistence/urlState.js';
import { exportScenarioJson, importScenarioJson } from '../persistence/jsonIO.js';
import { SavedCases } from '../persistence/savedCases.js';
import { leadOrderFor } from './ecg/renderer.js';
import { minMaxDownsample } from './ecg/downsample.js';
import { diagnosisOptions } from './modes/quizMode.js';
import { metricCards } from './panels/metricCards.js';
import { defaultScenario } from '../engine/index.js';
import { getCase } from '../cases/index.js';
import type { ViewState } from './state/appState.js';
import type { Delineation } from '../analysis/delineate/delineate.js';

const view: ViewState = {
  speedMmS: 25,
  gainMmMv: 10,
  layout: '3x4+II',
  cabrera: true,
  simultaneous: false,
  stripS: 30,
  showClean: false,
  extraLeads: false,
  markers: true,
};

describe('urlState', () => {
  const state = {
    scenario: defaultScenario(),
    view,
    patient: { sex: 'M' as const, age: 62 },
  };
  it('round-trips scenario + view + patient', () => {
    const enc = encodeShareState(state);
    expect(enc).not.toContain('+');
    expect(enc).not.toContain('/');
    const dec = decodeShareState(enc)!;
    expect(dec.scenario.seed).toBe(state.scenario.seed);
    expect(dec.view.cabrera).toBe(true);
    expect(dec.view.stripS).toBe(30);
    expect(dec.patient.age).toBe(62);
  });
  it('decodes an old payload that still carries a theme key', () => {
    const legacy = { ...state, view: { ...state.view, theme: 'dark' } };
    const enc = btoa(JSON.stringify(legacy))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const dec = decodeShareState(enc);
    expect(dec).not.toBeNull();
    expect(dec!.view.speedMmS).toBe(state.view.speedMmS);
    expect('theme' in dec!.view).toBe(false);
  });
  it('rejects malformed payloads', () => {
    expect(decodeShareState('not-base64!!')).toBeNull();
    expect(decodeShareState(btoa(JSON.stringify({ foo: 1 })))).toBeNull();
    expect(readUrlState('?s=%%%')).toBeNull();
    expect(readUrlState('')).toBeNull();
  });
  it('shareUrl embeds ?s=', () => {
    const u = shareUrl(state, 'https://x');
    expect(u).toContain('?s=');
  });
});

describe('jsonIO', () => {
  it('round-trips a scenario via the envelope', () => {
    const sc = defaultScenario();
    const back = importScenarioJson(exportScenarioJson(sc));
    expect(back.seed).toBe(sc.seed);
    expect(back.rhythm.type).toBe('sinus');
  });
  it('rejects malformed JSON and bad shapes', () => {
    expect(() => importScenarioJson('{oops')).toThrow(/JSON/);
    expect(() => importScenarioJson('{"seed":"x"}')).toThrow();
    expect(() =>
      importScenarioJson(
        JSON.stringify({
          seed: 1,
          durationS: 10,
          conduction: 'normal',
          sources: [],
          rhythm: { type: 'bogus' },
        }),
      ),
    ).toThrow(/Ritmo/);
  });
});

describe('savedCases', () => {
  const fakeStorage = () => {
    const m: Record<string, string> = {};
    return {
      getItem: (k: string) => m[k] ?? null,
      setItem: (k: string, v: string) => {
        m[k] = v;
      },
    };
  };
  it('CRUD over a fake Storage', () => {
    const sc = new SavedCases(fakeStorage());
    const scn = defaultScenario();
    sc.save('mi caso', scn);
    expect(sc.get('mi caso')?.scenario.seed).toBe(scn.seed);
    sc.save('mi caso', { ...scn, seed: 99 }); // overwrite by name
    expect(sc.list().length).toBe(1);
    expect(sc.get('mi caso')?.scenario.seed).toBe(99);
    sc.save('otro', scn);
    sc.remove('mi caso');
    expect(sc.list().map((c) => c.name)).toEqual(['otro']);
    expect(() => sc.save('  ', scn)).toThrow();
  });
});

describe('cabrera order', () => {
  it('3x4 cabrera starts aVL, I, −aVR and 6x2 cabrera too', () => {
    const g = leadOrderFor({ layout: '3x4', cabrera: true });
    expect(g[0]![0]).toBe('aVL');
    expect(g[1]![0]).toBe('I');
    expect(g[2]![0]).toBe('aVR');
    const g6 = leadOrderFor({ layout: '6x2', cabrera: true });
    expect(g6[0]![0]).toBe('aVL');
    expect(g6[0]![1]).toBe('I');
  });
  it('standard order unchanged when cabrera off', () => {
    expect(leadOrderFor({ layout: '3x4', cabrera: false })[0]![0]).toBe('I');
  });
});

describe('min/max downsampler', () => {
  it('preserves a 4 ms spike', () => {
    // fs 500 → 4 ms = 2 samples; 100 columns over 2000 samples = 20 samples/col.
    const n = 2000;
    const sig = new Float32Array(n);
    sig[1000] = 1.5;
    sig[1001] = 1.4;
    const cols = minMaxDownsample(sig, 100);
    const col = cols[Math.floor(1000 / 20)]!;
    expect(col.max).toBeGreaterThan(1);
  });
});

describe('quiz diagnosis options', () => {
  it('deterministic, 4 options, contains the diagnosis', () => {
    const c = getCase('G05')!; // AF case
    const a = diagnosisOptions(c);
    const b = diagnosisOptions(c);
    expect(a).toEqual(b);
    expect(a.length).toBe(4);
    expect(a).toContain(c.expected.diagnosis);
    expect(new Set(a).size).toBe(4);
  });
});

describe('metric cards evidence mapping', () => {
  const ev = (status: 'usable' | 'review' | 'unavailable') => ({ status, note: 'n' });
  const base: Delineation = {
    fs: 500,
    beats: [],
    rrMs: [],
    hrBpm: 72,
    prMs: 160,
    qrsMs: 90,
    qtMs: 380,
    qtc: { bazett: 400, fridericia: 390, framingham: 395, hodges: 398 },
    axisDeg: { p: 45, qrs: 30, t: 40 },
    atrialRateBpm: null,
    rhythmRegularity: 'regular',
    pacingSpikes: [],
    noiseMv: 0.01,
    evidence: {
      hr: ev('usable'),
      pr: ev('usable'),
      qrs: ev('review'),
      qt: ev('unavailable'),
      axis: ev('usable'),
      atrialRate: ev('unavailable'),
    },
    quality: 'ok',
  };
  it('maps evidence status onto cards', () => {
    const cards = metricCards(base, null);
    const byLabel = Object.fromEntries(cards.map((c) => [c.label, c]));
    expect(byLabel['FC']!.status).toBe('usable');
    expect(byLabel['QRS']!.status).toBe('review');
    expect(byLabel['QT / QTcF']!.status).toBe('unavailable');
    expect(byLabel['FC']!.value).toContain('72');
    expect(byLabel['QT / QTcF']!.sub).toContain('Fridericia');
  });
  it('null delineation → unavailable', () => {
    const cards = metricCards(null, null);
    expect(cards[0]!.status).toBe('unavailable');
  });
});

describe('a11y — case search keeps focus across renders', () => {
  it('persistent head: input survives store-driven re-render', async () => {
    const { renderCaseBrowser, selectCase } = await import('./modes/casesMode.js');
    const { store } = await import('./state/appState.js');
    const aside = document.createElement('aside');
    document.body.appendChild(aside);
    renderCaseBrowser(aside, (c) => selectCase(c));
    const input = aside.querySelector<HTMLInputElement>('#case-search')!;
    input.focus();
    input.value = 'K0';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    // The store update re-runs the app render → renderCaseBrowser again.
    renderCaseBrowser(aside, (c) => selectCase(c));
    expect(document.activeElement?.id).toBe('case-search');
    expect((document.activeElement as HTMLInputElement).value).toBe('K0');
    const items = aside.querySelectorAll('.case-item');
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) expect(it.textContent).toMatch(/K0/);
    store.update({ caseSearch: '' });
    aside.remove();
  });
});

describe('a11y — wireTablist roving tabindex', () => {
  it('arrow keys move focus and activate tabs', async () => {
    const { wireTablist } = await import('./a11y.js');
    const box = document.createElement('div');
    box.setAttribute('role', 'tablist');
    document.body.appendChild(box);
    const clicked: number[] = [];
    for (let i = 0; i < 3; i++) {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === 0));
      b.addEventListener('click', () => {
        clicked.push(i);
        for (const x of box.querySelectorAll('button'))
          x.setAttribute('aria-selected', String(x === b));
        wireTablist(box);
      });
      box.appendChild(b);
    }
    wireTablist(box);
    const tabs = [...box.querySelectorAll('button')];
    expect(tabs[0]!.tabIndex).toBe(0);
    expect(tabs[1]!.tabIndex).toBe(-1);
    tabs[0]!.focus();
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]);
    expect(clicked).toEqual([1]);
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(tabs[2]);
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(tabs[1]);
    box.remove();
  });
});

describe('a11y — app mount roving tabindex on mode tabs', () => {
  it('selected mode tab has tabindex 0; ArrowRight activates the next', async () => {
    const { mount } = await import('./app.js');
    const root = document.createElement('div');
    document.body.appendChild(root);
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    mount(root);
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.mode-tabs button')];
    const selected = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < tabs.length; i++) expect(tabs[i]!.tabIndex).toBe(i === selected ? 0 : -1);
    tabs[selected]!.focus();
    root
      .querySelector('.mode-tabs')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(tabs[(selected + 1) % tabs.length]);
    expect(tabs[(selected + 1) % tabs.length]!.tabIndex).toBe(0);
    root.remove();
  });
});
