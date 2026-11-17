"use client";

import { useEffect, useMemo } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, HelpCircle, PartyPopper, XCircle } from "lucide-react";
import { nextUndecided, profileUrlFor, type ManualVerdict } from "@/lib/assisted/manual";
import { useBulk } from "@/lib/client/bulk";
import { store, useStore, type StoredResult } from "@/lib/client/store";
import { Button, StatusBadge, cx, useToast } from "./ui";
import { CheckedLabel } from "./Diagnostics";

/** Big "Open on pump.fun" link. A real <a target=_blank> so iPhone Safari opens a new tab. */
export function OpenProfileButton({ username, compact, className }: { username: string; compact?: boolean; className?: string }) {
  return (
    <a
      href={profileUrlFor(username)}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl border border-ink bg-ink font-medium text-white transition-all active:scale-[0.98] hover:bg-black/85",
        compact ? "h-10 px-3 text-[13px] sm:h-8" : "h-14 px-5 text-base",
        className,
      )}
    >
      <ExternalLink className="h-4 w-4" aria-hidden />
      {compact ? "Open" : <span className="truncate">Open pump.fun/profile/{username}</span>}
    </a>
  );
}

/** Exists / Not found / Unsure buttons. */
export function MarkButtons({
  username,
  onMarked,
  compact,
  current,
}: {
  username: string;
  onMarked?: (v: ManualVerdict) => void;
  compact?: boolean;
  current?: StoredResult;
}) {
  const toast = useToast();
  const mark = (v: ManualVerdict) => {
    store.mark(username, v);
    if (!onMarked) toast(v === "exists" ? `${username}: exists` : v === "not_found" ? `${username}: not found` : `${username}: unsure`);
    onMarked?.(v);
  };
  const manualStatus = current?.method === "manual" ? current.status : undefined;
  const base = compact ? "h-10 px-3 text-[13px] sm:h-8" : "h-14 text-[15px]";
  return (
    <div className={cx("grid gap-2", compact ? "grid-cols-3 sm:flex" : "grid-cols-2")}>
      <button
        onClick={() => mark("exists")}
        aria-pressed={manualStatus === "taken"}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-all active:scale-[0.98]",
          base,
          manualStatus === "taken" ? "border-taken bg-taken text-white" : "border-taken-line bg-taken-bg text-taken hover:border-taken",
        )}
      >
        <XCircle className="h-4 w-4" aria-hidden /> Exists
      </button>
      <button
        onClick={() => mark("not_found")}
        aria-pressed={manualStatus === "available"}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition-all active:scale-[0.98]",
          base,
          manualStatus === "available" ? "border-avail bg-avail text-white" : "border-avail-line bg-avail-bg text-avail hover:border-avail",
        )}
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Not found
      </button>
      <button
        onClick={() => mark("unsure")}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-white font-medium text-muted transition-all hover:text-ink active:scale-[0.98]",
          base,
          !compact && "col-span-2 h-11 text-[14px]",
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden /> {compact ? "Unsure" : "Can't tell (keep Unknown)"}
      </button>
    </div>
  );
}

/** How to read a pump.fun profile page; shown next to the mark buttons. */
export function HowToJudge() {
  return (
    <details className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-[13px] leading-5 text-ink/75">
      <summary className="cursor-pointer select-none font-medium text-ink">What counts as “Exists” or “Not found”?</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <b>Exists</b>: the page shows a profile for that username (avatar, followers, coins…).
        </li>
        <li>
          <b>Not found</b>: pump.fun says the user/page does not exist. This does not guarantee you can register it —
          reserved or banned names can also be unavailable.
        </li>
        <li>
          <b>Can’t tell</b>: a security check, error, endless loading or anything unclear. The name stays Unknown.
        </li>
      </ul>
    </details>
  );
}

/**
 * Assisted review card: one username at a time, open it on pump.fun, mark it, auto-advance.
 * Designed for iPhone: big targets, progress, resumable after Safari reloads the tab.
 */
export function ReviewDeck() {
  const bulk = useBulk();
  const results = useStore((s) => s.results);
  const { batch, reviewIndex: i, setReviewIndex } = bulk;
  const name = batch[i];
  const current = name ? results[name] : undefined;
  const decided = useMemo(() => batch.filter((u) => results[u] && results[u]!.status !== "unknown").length, [batch, results]);
  const remaining = nextUndecided(batch, results, 0);
  const allDone = batch.length > 0 && remaining === -1;

  const advance = () => {
    const next = nextUndecided(batch, store.get().results, i + 1);
    const wrap = next === -1 ? nextUndecided(batch, store.get().results, 0) : next;
    if (wrap !== -1 && wrap !== i) setReviewIndex(wrap);
    else if (i < batch.length - 1) setReviewIndex(i + 1);
  };

  // Desktop shortcuts: O open, E exists, N not found, U unsure, ←/→ navigate.
  useEffect(() => {
    if (!name) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "o") window.open(profileUrlFor(name), "_blank", "noopener,noreferrer");
      else if (k === "e") (store.mark(name, "exists"), advance());
      else if (k === "n") (store.mark(name, "not_found"), advance());
      else if (k === "u") (store.mark(name, "unsure"), advance());
      else if (k === "arrowright") setReviewIndex(Math.min(batch.length - 1, i + 1));
      else if (k === "arrowleft") setReviewIndex(Math.max(0, i - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!batch.length) return null;
  const pct = Math.round((decided / batch.length) * 100);

  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-5" aria-label="Assisted review">
      <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
        <span>
          Name {i + 1} of {batch.length}
        </span>
        <span className="tabular-nums">
          {decided} decided · {pct}%
        </span>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-ink transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      {allDone && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-avail-line bg-avail-bg px-3 py-2.5 text-[13px] font-medium text-avail">
          <PartyPopper className="h-4 w-4" aria-hidden /> Every name in this list has been checked.
        </div>
      )}

      {name && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-all font-mono text-[26px] font-semibold leading-tight tracking-tight">{name}</p>
            {current && <StatusBadge status={current.status} manual={current.method === "manual"} size="lg" />}
          </div>
          {current && (
            <p className="mt-1 text-[12px] text-muted">
              <CheckedLabel r={current} />
            </p>
          )}
          <div className="mt-4 flex flex-col gap-3">
            <OpenProfileButton username={name} className="w-full" />
            <p className="text-center text-[12px] text-subtle">Look at the page, then come back here and tap what you saw.</p>
            <MarkButtons username={name} current={current} onMarked={advance} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setReviewIndex(Math.max(0, i - 1))} disabled={i === 0}>
              <ArrowLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="ghost" onClick={() => setReviewIndex(Math.min(batch.length - 1, i + 1))} disabled={i >= batch.length - 1}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 hidden text-center text-[11px] text-subtle sm:block">
            Shortcuts: O open · E exists · N not found · U unsure · ←/→
          </p>
        </>
      )}
    </div>
  );
}
