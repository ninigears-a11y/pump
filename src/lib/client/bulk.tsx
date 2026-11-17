"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BulkQueue, type QueueSnapshot } from "@/lib/bulkQueue";
import { checkInBrowser } from "@/lib/assisted/browserCheck";
import { nextUndecided } from "@/lib/assisted/manual";
import { normalizeUsername } from "@/lib/checker/username";
import type { Diagnostic } from "@/lib/checker/types";
import { checkUsername, type ClientCheckResult } from "./api";
import { useCheckMode } from "./mode";
import { store, useStore } from "./store";

interface BulkCtx {
  input: string;
  setInput: (s: string) => void;
  /** Usernames in the current list, in order. */
  batch: string[];
  /** Automatic mode: usernames finished in the current run. */
  done: Record<string, true>;
  /** Automatic mode: set when the run auto-paused on a configuration problem. */
  blocked: Diagnostic | null;
  /** Automatic mode progress. */
  snapshot: QueueSnapshot;
  /** Assisted mode: position of the review card in `batch`. */
  reviewIndex: number;
  setReviewIndex: (i: number) => void;
  /** Load a list. Automatic mode starts checking; assisted mode opens the review at the first unchecked name. */
  run: (usernames: string[], opts?: { start?: boolean; force?: boolean }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  clearBatch: () => void;
  focus: () => void;
}

const Ctx = createContext<BulkCtx | null>(null);
const EMPTY: QueueSnapshot = { state: "idle", total: 0, completed: 0, active: 0, pending: 0 };
const REVIEW_KEY = "pump-username-checker:review:v1";

function uniqueNames(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const u = normalizeUsername(raw);
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

export function BulkProvider({ children, onFocus }: { children: ReactNode; onFocus?: () => void }) {
  const { mode } = useCheckMode();
  const settings = useStore((s) => s.settings);
  const [input, setInput] = useState("");
  const [batch, setBatch] = useState<string[]>([]);
  const [done, setDone] = useState<Record<string, true>>({});
  const [blocked, setBlocked] = useState<Diagnostic | null>(null);
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(EMPTY);
  const [reviewIndex, setReviewIndex] = useState(0);
  const queueRef = useRef<BulkQueue<ClientCheckResult> | null>(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const restored = useRef(false);

  // iOS Safari may reload this tab while the user is on pump.fun: restore the review list.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(REVIEW_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { batch?: string[]; index?: number };
        if (Array.isArray(saved.batch) && saved.batch.length) {
          setBatch(saved.batch);
          setInput(saved.batch.join("\n"));
          setReviewIndex(Math.min(Math.max(0, saved.index ?? 0), saved.batch.length - 1));
        }
      }
    } catch {
      /* storage unavailable */
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      if (batch.length) window.localStorage.setItem(REVIEW_KEY, JSON.stringify({ batch, index: reviewIndex }));
      else window.localStorage.removeItem(REVIEW_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [batch, reviewIndex]);

  useEffect(() => {
    queueRef.current?.setConcurrency(settings.concurrency);
    queueRef.current?.setDelay(settings.delayMs);
  }, [settings.concurrency, settings.delayMs]);

  useEffect(() => () => queueRef.current?.stop(), []);

  const run = useCallback((usernames: string[], opts: { start?: boolean; force?: boolean } = {}) => {
    queueRef.current?.stop();
    const names = uniqueNames(usernames);
    setDone({});
    setBlocked(null);
    setInput(names.join("\n"));
    setBatch(names);
    setSnapshot(EMPTY);

    if (modeRef.current === "assisted") {
      // Free mode: nothing is fetched. Open the review at the first name nobody decided yet.
      const first = nextUndecided(names, store.get().results, 0);
      setReviewIndex(first === -1 ? 0 : first);
      onFocusRef.current?.();
      return;
    }

    const s = settingsRef.current;
    const q = new BulkQueue<ClientCheckResult>({
      concurrency: s.concurrency,
      delayMs: s.delayMs,
      worker: async (u, signal) => {
        store.setChecking([u], true);
        try {
          if (modeRef.current === "browser") return await checkInBrowser(u, { signal });
          return await checkUsername(u, { force: opts.force, strict: settingsRef.current.strict, signal });
        } finally {
          store.setChecking([u], false);
        }
      },
      onResult: (u, r) => {
        // Never overwrite a manual decision with an automatic UNKNOWN.
        const prev = store.get().results[u];
        if (!(r.status === "unknown" && prev?.method === "manual")) store.upsert(r);
        setDone((d) => ({ ...d, [u]: true }));
        if (r.status === "unknown" && r.diagnostic?.blocking) {
          q.pause();
          setBlocked(r.diagnostic);
        }
      },
      onChange: setSnapshot,
      backoffFor: (r) => r.cooldownMs ?? 0,
    });
    q.add(names);
    queueRef.current = q;
    setSnapshot(q.snapshot());
    if (opts.start !== false) q.start();
    onFocusRef.current?.();
  }, []);

  const value = useMemo<BulkCtx>(
    () => ({
      input,
      setInput,
      batch,
      done,
      blocked,
      snapshot,
      reviewIndex,
      setReviewIndex,
      run,
      pause: () => queueRef.current?.pause(),
      resume: () => {
        setBlocked(null);
        queueRef.current?.resume();
      },
      stop: () => queueRef.current?.stop(),
      clearBatch: () => {
        queueRef.current?.stop();
        setBatch([]);
        setReviewIndex(0);
        setSnapshot(EMPTY);
      },
      focus: () => onFocusRef.current?.(),
    }),
    [input, batch, done, blocked, snapshot, reviewIndex, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBulk(): BulkCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBulk must be used inside <BulkProvider>");
  return v;
}
