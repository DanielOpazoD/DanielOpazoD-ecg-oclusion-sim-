/**
 * Tiny typed store for the app shell.
 * `createStore(initial)` → { get, set, update, subscribe }.
 */
export interface Store<T> {
  get(): T;
  set(v: T): void;
  update(patch: Partial<T>): void;
  subscribe(fn: (state: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<(s: T) => void>();
  const emit = () => {
    for (const fn of subs) fn(state);
  };
  return {
    get: () => state,
    set: (v) => {
      state = v;
      emit();
    },
    update: (patch) => {
      state = { ...state, ...patch };
      emit();
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
