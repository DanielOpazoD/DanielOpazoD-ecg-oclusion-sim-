import type { Scenario } from '../engine/index.js';

export interface SavedCase {
  name: string;
  scenario: Scenario;
  savedAt: string;
}

const KEY = 'ecglab.savedCases.v1';

/** localStorage-backed named scenarios. Storage is injectable for tests. */
export class SavedCases {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {}

  list(): SavedCase[] {
    try {
      const raw = this.storage.getItem(KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? (arr as SavedCase[]) : [];
    } catch {
      return [];
    }
  }

  save(name: string, scenario: Scenario): SavedCase[] {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Nombre vacío.');
    const list = this.list().filter((c) => c.name !== trimmed);
    list.push({ name: trimmed, scenario, savedAt: new Date().toISOString() });
    this.storage.setItem(KEY, JSON.stringify(list));
    return list;
  }

  remove(name: string): SavedCase[] {
    const list = this.list().filter((c) => c.name !== name);
    this.storage.setItem(KEY, JSON.stringify(list));
    return list;
  }

  get(name: string): SavedCase | undefined {
    return this.list().find((c) => c.name === name);
  }
}
