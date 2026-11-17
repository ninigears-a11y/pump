"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BulkQueue, type QueueSnapshot } from "@/lib/bulkQueue";
import { checkUsername, type ClientCheckResult } from "./api";
import type { Diagnostic } from "@/lib/checker/types";
import { store, useStore } from "./store";

interface BulkCtx {
  input: string;
  setInput: (s: string) => void;
  /** Usernames in the current run, in order. */
  batch: string[];
  /** Usernames finished in the current run. */
  done: Record<string, true>;
  /** Set when the run was auto-paused because every further check would fail the same way. */
  blocked: Diagnostic | null;
  snapshot: QueueSnapshot;
  /** Replace the batch and (optionally) start checking. */
  run: (usernames: string[], opts?: { start?: boolean; force?: boolean }) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Bring the bulk checker into view. */
  focus: () => void;
}

const Ctx = createContext<BulkCtx | null>(null);

const EMPTY: QueueSnapshot = { state: "idle", total: 0, completed: 0, active: 0, pending: 0 };

export function BulkProvider({ children, onFocus }: { children: ReactNode; onFocus?: () => void }) {
  const settings = useStore((s) => s.settings);
  const [input, setInput] = useState("");
  const [batch, setBatch] = useState<string[]>([]);
  const [done, setDone] = useState<Record<string, true>>({});
  const [blocked, setBlocked] = useState<Diagnostic | null>(null);
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(EMPTY);
  const queueRef = useRef<BulkQueue<ClientCheckResult> | null>(null);
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    queueRef.current?.setConcurrency(settings.concurrency);
    queueRef.current?.setDelay(settings.delayMs);
  }, [settings.concurrency, settings.delayMs]);

  useEffect(() => () => queueRef.current?.stop(), []);

  const run = useCallback((usernames: string[], opts: { start?: boolean; force?: boolean } = {}) => {
    queueRef.current?.stop();
    const s = settingsRef.current;
    const q = new BulkQueue<ClientCheckResult>({
      concurrency: s.concurrency,
      delayMs: s.delayMs,
      worker: async (u, signal) => {
        store.setChecking([u], true);
        try {
          return await checkUsername(u, { force: opts.force, strict: settingsRef.current.strict, signal });
        } finally {
          store.setChecking([u], false);
        }
      },
      onResult: (u, r) => {
        store.upsert(r);
        setDone((d) => ({ ...d, [u]: true }));
        // A configuration problem (missing/invalid key, region, Cloudflare) fails every
        // check the same way: pause instead of burning through the whole list.
        if (r.status === "unknown" && r.diagnostic?.blocking) {
          q.pause();
          setBlocked(r.diagnostic);
        }
      },
      onChange: setSnapshot,
      backoffFor: (r) => r.cooldownMs ?? 0,
    });
    q.add(usernames);
    queueRef.current = q;
    setDone({});
    setBlocked(null);
    setInput(usernames.join("\n"));
    setBatch(usernames.map((u) => u.toLowerCase()).filter((u, i, a) => a.indexOf(u) === i));
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
      run,
      pause: () => queueRef.current?.pause(),
      resume: () => {
        setBlocked(null);
        queueRef.current?.resume();
      },
      stop: () => queueRef.current?.stop(),
      focus: () => onFocusRef.current?.(),
    }),
    [input, batch, done, blocked, snapshot, run],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBulk(): BulkCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBulk must be used inside <BulkProvider>");
  return v;
}
