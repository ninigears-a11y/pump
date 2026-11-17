"use client";

import { useMemo, useState } from "react";
import { Copy, Download, ExternalLink, Layers, ListChecks, Pause, Play, Square, Settings2, Trash2 } from "lucide-react";
import { useCheckMode } from "@/lib/client/mode";
import { ReviewDeck } from "./Assisted";
import { parseUsernameList, validateUsername } from "@/lib/checker/username";
import { useBulk } from "@/lib/client/bulk";
import { profileUrlFor } from "@/lib/client/api";
import { store, useStore } from "@/lib/client/store";
import { copyText, downloadFile } from "@/lib/client/util";
import { CheckedLabel, DiagnosticBox } from "./Diagnostics";
import { verifiedAtOf } from "@/lib/client/api";
import { toCsv } from "@/lib/csv";
import type { CheckStatus } from "@/lib/checker/types";
import { Button, Card, CardHeader, Field, Segmented, StatusBadge, cx, useToast } from "./ui";

const EXAMPLE = "mrnom\nmrdev\nmrsol\nmrking\nmrwhale\nmrbased\nmralpha\nmrlegend\nmrcrypto\nmrdegen";
type Filter = "all" | CheckStatus;

export function BulkChecker() {
  const bulk = useBulk();
  const { mode } = useCheckMode();
  const assisted = mode === "assisted";
  const results = useStore((s) => s.results);
  const checking = useStore((s) => s.checking);
  const settings = useStore((s) => s.settings);
  const [filter, setFilter] = useState<Filter>("all");
  const [showSettings, setShowSettings] = useState(false);
  const toast = useToast();

  const parsed = useMemo(() => parseUsernameList(bulk.input), [bulk.input]);
  const rawLines = useMemo(() => bulk.input.split(/[\n,;\t]+/).filter((l) => l.trim()).length, [bulk.input]);
  const invalid = parsed.filter((u) => !validateUsername(u).valid).length;
  const duplicates = rawLines - parsed.length;

  const { snapshot } = bulk;
  const running = snapshot.state === "running";
  const paused = snapshot.state === "paused";
  const pct = snapshot.total ? Math.round((snapshot.completed / snapshot.total) * 100) : 0;

  const rows = useMemo(
    () =>
      bulk.batch.map((u) => ({
        username: u,
        // Assisted: show whatever is known (including earlier manual marks). Automatic: this run only.
        result: assisted || bulk.done[u] ? results[u] : undefined,
        checking: !!checking[u],
      })),
    [bulk.batch, bulk.done, results, checking, assisted],
  );
  const counts = useMemo(() => {
    const c = { all: rows.length, available: 0, taken: 0, unknown: 0 };
    rows.forEach((r) => (r.result ? c[r.result.status]++ : assisted && c.unknown++));
    return c;
  }, [rows]);
  const visible = rows.filter(
    (r) => filter === "all" || r.result?.status === filter || (filter === "unknown" && !r.result && assisted),
  );

  const availableNames = rows.filter((r) => r.result?.status === "available").map((r) => r.username);

  function start() {
    if (!parsed.length) {
      toast("Add at least one username");
      return;
    }
    bulk.run(parsed);
  }

  function exportCsv() {
    const data = rows.filter((r) => r.result);
    if (!data.length) return toast("Nothing to export yet");
    const csv = toCsv(
      ["username", "status", "checked_by", "verified_at", "marked_at", "attempted_at", "method", "confidence", "profile_url", "diagnostic_code", "details"],
      data.map(({ result: r }) => [
        r!.username,
        r!.status,
        r!.method === "manual" ? "you (manual)" : r!.method === "none" ? "" : "automatic",
        verifiedAtOf(r!) ?? "",
        r!.markedAt ?? "",
        r!.checkedAt,
        r!.method ?? "",
        r!.confidence === "none" ? "" : r!.confidence,
        r!.profileUrl,
        r!.diagnostic?.code ?? "",
        r!.diagnostic?.message ?? r!.reason,
      ]),
    );
    downloadFile(`pump-usernames-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="scroll-mt-6">
      <Card id="bulk">
        <CardHeader
          icon={<Layers className="h-4 w-4" />}
          title="Bulk Checker"
          subtitle={
            assisted
              ? "Paste names, then review them one by one on pump.fun. Progress is saved."
              : "One username per line. Duplicates are removed automatically."
          }
          right={
            assisted ? undefined : (
              <Button size="sm" variant="ghost" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
                <Settings2 className="h-4 w-4" /> Settings
              </Button>
            )
          }
        />
        <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-3">
            <textarea
              value={bulk.input}
              onChange={(e) => bulk.setInput(e.target.value)}
              placeholder={EXAMPLE}
              spellCheck={false}
              aria-label="Usernames to check, one per line"
              className="h-48 w-full resize-y rounded-xl sm:h-64 border border-line-strong bg-white p-4 font-mono text-[13px] leading-6 outline-none transition-shadow placeholder:text-line-strong focus:border-ink/40 focus:ring-4 focus:ring-ink/5"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span>
                <b className="font-semibold text-ink tabular-nums">{parsed.length}</b> unique
              </span>
              {duplicates > 0 && <span>{duplicates} duplicates removed</span>}
              {invalid > 0 && <span className="text-unknown">{invalid} invalid (will stay unknown)</span>}
              {!bulk.input && (
                <button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => bulk.setInput(EXAMPLE)}>
                  Use example list
                </button>
              )}
            </div>

            {showSettings && !assisted && (
              <div className="grid gap-4 rounded-xl border border-line bg-surface/60 p-4 sm:grid-cols-2">
                <Field label="Concurrency" hint={`${settings.concurrency} at once`}>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={settings.concurrency}
                    onChange={(e) => store.updateSettings({ concurrency: Number(e.target.value) })}
                    className="w-full accent-black"
                  />
                </Field>
                <Field label="Delay between requests" hint="ms">
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    step={100}
                    value={settings.delayMs}
                    onChange={(e) => store.updateSettings({ delayMs: Math.max(0, Number(e.target.value) || 0) })}
                    className="h-9 w-full rounded-lg border border-line-strong bg-white px-3 text-sm outline-none focus:border-ink/40"
                  />
                </Field>
                <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={settings.strict}
                    onChange={(e) => store.updateSettings({ strict: e.target.checked })}
                    className="mt-0.5 h-4 w-4 accent-black"
                  />
                  <span className="text-[13px]">
                    <span className="font-medium">Strict verification</span>
                    <span className="block text-muted">
                      Only mark a name available when the public profile page also confirms it. Safer, but more results
                      may end up unknown.
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {assisted ? (
                <>
                  <Button variant="primary" onClick={start} disabled={!parsed.length}>
                    <ListChecks className="h-4 w-4" /> Review {parsed.length || ""} usernames
                  </Button>
                  {bulk.batch.length > 0 && (
                    <Button variant="ghost" onClick={bulk.clearBatch}>
                      <Trash2 className="h-4 w-4" /> Clear list
                    </Button>
                  )}
                </>
              ) : running ? (
                <Button variant="secondary" onClick={bulk.pause}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              ) : paused ? (
                <Button variant="primary" onClick={bulk.resume}>
                  <Play className="h-4 w-4" /> Resume
                </Button>
              ) : (
                <Button variant="primary" onClick={start} disabled={!parsed.length}>
                  <Play className="h-4 w-4" /> Check {parsed.length || ""} usernames
                </Button>
              )}
              {(running || paused) && (
                <Button variant="danger" onClick={bulk.stop}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            {assisted && <div className="mb-4"><ReviewDeck /></div>}
            {bulk.blocked && !assisted && (
              <div className="mb-3">
                <p className="mb-2 text-[13px] font-semibold text-unknown">
                  Paused: this problem would make every remaining check Unknown.
                </p>
                <DiagnosticBox d={bulk.blocked} compact />
              </div>
            )}
            <div className={cx("mb-3", assisted && "hidden")}>
              <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
                <span className="flex items-center gap-2">
                  {running && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-avail" />}
                  {snapshot.state === "idle" && !snapshot.total ? "Ready" : stateLabel(snapshot.state)}
                </span>
                <span className="tabular-nums">
                  {snapshot.completed} / {snapshot.total} · {pct}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className={cx("h-full rounded-full transition-all duration-300", paused ? "bg-unknown" : "bg-ink")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <Segmented<Filter>
                fill
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", count: counts.all },
                  { value: "available", label: "Available", count: counts.available },
                  { value: "taken", label: "Taken", count: counts.taken },
                  { value: "unknown", label: "Unknown", count: counts.unknown },
                ]}
              />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  size="sm"
                  onClick={() =>
                    availableNames.length
                      ? copyText(availableNames.join("\n")).then(() => toast(`Copied ${availableNames.length} available`))
                      : toast(assisted ? "No names marked “not found” yet" : "No available usernames yet")
                  }
                >
                  <Copy className="h-3.5 w-3.5" /> {assisted ? "Copy not found" : "Copy available"}
                </Button>
                <Button size="sm" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </div>

            <div className="max-h-[60vh] min-h-48 overflow-y-auto overscroll-contain rounded-xl border border-line sm:h-72 lg:h-[22rem]">
              {visible.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-subtle">
                  {rows.length
                    ? "No results in this filter."
                    : assisted
                      ? "Your list appears here. Tap a name to review it."
                      : "Live results appear here as names are checked."}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {visible.slice(0, 1000).map((r) => (
                    <li
                      key={r.username}
                      className={cx(
                        "flex min-h-12 items-center justify-between gap-3 px-4",
                        assisted && bulk.batch[bulk.reviewIndex] === r.username && "bg-surface",
                      )}
                    >
                      {assisted ? (
                        <button
                          onClick={() => bulk.setReviewIndex(bulk.batch.indexOf(r.username))}
                          className="min-w-0 flex-1 truncate py-3 text-left font-mono text-[14px] hover:underline sm:py-2.5 sm:text-[13px]"
                          title="Review this name"
                        >
                          {r.username}
                        </button>
                      ) : (
                        <a
                          href={r.result?.profileUrl ?? profileUrlFor(r.username)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate py-3 font-mono text-[14px] hover:underline sm:py-2.5 sm:text-[13px]"
                        >
                          {r.username}
                        </a>
                      )}
                      <div className="flex shrink-0 items-center gap-3">
                        {r.result && !r.checking && (
                          <CheckedLabel r={r.result} className="hidden text-[11px] text-subtle sm:inline" />
                        )}
                        {r.checking ? (
                          <StatusBadge status="checking" />
                        ) : r.result ? (
                          <span title={r.result.diagnostic?.message ?? r.result.reason} className="flex flex-col items-end gap-0.5">
                            <StatusBadge status={r.result.status} manual={r.result.method === "manual"} />
                            {r.result.status === "unknown" && r.result.diagnostic && (
                              <span className="text-[11px] font-medium text-unknown">{r.result.diagnostic.label}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
                            {assisted ? "To check" : "Queued"}
                          </span>
                        )}
                        {assisted && (
                          <a
                            href={profileUrlFor(r.username)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${r.username} on pump.fun`}
                            title="Open on pump.fun"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink sm:h-8 sm:w-8"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function stateLabel(s: string) {
  return { idle: "Ready", running: "Checking…", paused: "Paused", stopped: "Stopped", done: "Complete" }[s] ?? s;
}
