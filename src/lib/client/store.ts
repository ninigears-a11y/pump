"use client";

import { useSyncExternalStore } from "react";
import type { CheckResult } from "@/lib/checker/types";

export interface StoredResult extends CheckResult {
  favorite?: boolean;
}

export interface Settings {
  concurrency: number;
  delayMs: number;
  strict: boolean;
}

interface State {
  results: Record<string, StoredResult>;
  /** Usernames currently being checked (not persisted). */
  checking: Record<string, true>;
  settings: Settings;
}

const KEY = "pump-username-checker:v1";
export const DEFAULT_SETTINGS: Settings = { concurrency: 3, delayMs: 600, strict: false };

let state: State = { results: {}, checking: {}, settings: DEFAULT_SETTINGS };
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      state = {
        results: parsed.results ?? {},
        checking: {},
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      };
    }
  } catch {
    /* storage unavailable or corrupt — start fresh */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  if (typeof window === "undefined") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ results: state.results, settings: state.settings }));
    } catch {
      /* quota exceeded or blocked */
    }
  }, 250);
}

function set(next: Partial<State>, save = true) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  if (save) persist();
}

export const store = {
  subscribe(l: () => void) {
    hydrate();
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get(): State {
    hydrate();
    return state;
  },
  upsert(r: CheckResult) {
    const prev = state.results[r.username];
    const { [r.username]: _, ...checking } = state.checking;
    set({ results: { ...state.results, [r.username]: { ...r, favorite: prev?.favorite } }, checking });
  },
  setChecking(usernames: string[], on: boolean) {
    const checking = { ...state.checking };
    for (const u of usernames) {
      if (on) checking[u] = true;
      else delete checking[u];
    }
    set({ checking }, false);
  },
  toggleFavorite(username: string) {
    const r = state.results[username];
    if (!r) return;
    set({ results: { ...state.results, [username]: { ...r, favorite: !r.favorite } } });
  },
  remove(username: string) {
    const { [username]: _, ...rest } = state.results;
    set({ results: rest });
  },
  clear(keepFavorites = true) {
    const results = keepFavorites
      ? Object.fromEntries(Object.entries(state.results).filter(([, r]) => r.favorite))
      : {};
    set({ results });
  },
  updateSettings(s: Partial<Settings>) {
    set({ settings: { ...state.settings, ...s } });
  },
};

const serverSnapshot: State = { results: {}, checking: {}, settings: DEFAULT_SETTINGS };

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(serverSnapshot),
  );
}
