"use client";

import { useMemo, useState } from "react";
import { Copy, Download, Layers, Pause, Play, Square, Settings2 } from "lucide-react";
import { parseUsernameList, validateUsername } from "@/lib/checker/username";
import { useBulk } from "@/lib/client/bulk";
import { store, useStore } from "@/lib/client/store";
import { copyText, downloadFile, timeAgo } from "@/lib/client/util";
import { toCsv } from "@/lib/csv";
import type { CheckStatus } from "@/lib/checker/types";
import { Button, Card, CardHeader, Field, Segmented, StatusBadge, cx, useToast } from "./ui";

const EXAMPLE = "mrnom\nmrdev\nmrsol\nmrking\nmrwhale\nmrbased\nmralpha\nmrlegend\nmrcrypto\nmrdegen";
type Filter = "all" | CheckStatus;

export function BulkChecker() {
  const bulk = useBulk();
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
        result: bulk.done[u] ? results[u] : undefined,
        checking: !!checking[u],
      })),
    [bulk.batch, bulk.done, results, checking],
  );
  const counts = useMemo(() => {
    const c = { all: rows.length, available: 0, taken: 0, unknown: 0 };
    rows.forEach((r) => r.result && c[r.result.status]++);
    return c;
  }, [rows]);
  const visible = rows.filter((r) => filter === "all" || r.result?.status === filter);

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
      ["username", "status", "confidence", "profile_url", "last_checked", "reason"],
      data.map(({ result: r }) => [r!.username, r!.status, r!.confidence, r!.profileUrl, r!.checkedAt, r!.reason]),
    );
    downloadFile(`pump-usernames-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="scroll-mt-6">
      <Card id="bulk">
        <CardHeader
          icon={<Layers className="h-4 w-4" />}
          title="Bulk Checker"
          subtitle="One username per line. Duplicates are removed automatically."
          right={
            <Button size="sm" variant="ghost" onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
              <Settings2 className="h-4 w-4" /> Settings
            </Button>
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
              className="h-64 w-full resize-y rounded-xl border border-line-strong bg-white p-4 font-mono text-[13px] leading-6 outline-none transition-shadow placeholder:text-line-strong focus:border-ink/40 focus:ring-4 focus:ring-ink/5"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span>
                <b className="font-semibold text-ink tabular-nums">{parsed.length}</b> unique
              </span>
              {duplicates > 0 && <span>{duplicates} duplicates removed</span>}
              {invalid > 0 && <span className="text-unknown">{invalid} invalid (will be skipped as unknown)</span>}
              {!bulk.input && (
                <button className="font-medium text-ink underline-offset-2 hover:underline" onClick={() => bulk.setInput(EXAMPLE)}>
                  Use example list
                </button>
              )}
            </div>

            {showSettings && (
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

            <div className="flex flex-wrap gap-2">
              {running ? (
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
            <div className="mb-3">
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

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All", count: counts.all },
                  { value: "available", label: "Available", count: counts.available },
                  { value: "taken", label: "Taken", count: counts.taken },
                  { value: "unknown", label: "Unknown", count: counts.unknown },
                ]}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    availableNames.length
                      ? copyText(availableNames.join("\n")).then(() => toast(`Copied ${availableNames.length} available`))
                      : toast("No available usernames yet")
                  }
                >
                  <Copy className="h-3.5 w-3.5" /> Copy available
                </Button>
                <Button size="sm" onClick={exportCsv}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
              </div>
            </div>

            <div className="h-72 overflow-y-auto rounded-xl border border-line lg:h-[22rem]">
              {visible.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-subtle">
                  {rows.length ? "No results in this filter." : "Live results appear here as names are checked."}
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {visible.slice(0, 1000).map((r) => (
                    <li key={r.username} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <a
                        href={r.result?.profileUrl ?? `https://pump.fun/u/${r.username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-[13px] hover:underline"
                      >
                        {r.username}
                      </a>
                      <div className="flex shrink-0 items-center gap-3">
                        {r.result && !r.checking && (
                          <span className="hidden text-[11px] text-subtle sm:inline">{timeAgo(r.result.checkedAt)}</span>
                        )}
                        {r.checking ? (
                          <StatusBadge status="checking" />
                        ) : r.result ? (
                          <span title={r.result.reason}>
                            <StatusBadge status={r.result.status} />
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">Queued</span>
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
