"use client";

import { useRef, useState } from "react";
import { FlaskConical, Play, Square } from "lucide-react";
import {
  internalUrl,
  labLookup,
  LAB_INTERVAL_MS,
  LAB_MAX_NAMES,
  LAB_STOP_AFTER_BLOCKS,
  type LabRow,
} from "@/lib/lab/internalApi";
import { parseUsernameList } from "@/lib/checker/username";
import { Button, Card, CardHeader, Segmented, ToastProvider, cx } from "@/components/ui";

type Where = "browser" | "server";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TONE: Record<LabRow["result"], string> = {
  EXISTS: "text-taken",
  NOT_FOUND: "text-avail",
  UNKNOWN: "text-unknown",
};

export function InternalApiLab() {
  const [input, setInput] = useState("nom\nneo\nzen\nvex\nzzq_unclaimed_7731");
  const [where, setWhere] = useState<Where>("browser");
  const [rows, setRows] = useState<LabRow[]>([]);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const stopRef = useRef(false);

  async function run() {
    const names = parseUsernameList(input).slice(0, LAB_MAX_NAMES);
    setRows([]);
    setNote(null);
    setRunning(true);
    stopRef.current = false;
    let blocks = 0;
    for (const [i, n] of names.entries()) {
      if (stopRef.current) break;
      if (i) await sleep(LAB_INTERVAL_MS);
      const r =
        where === "browser"
          ? await labLookup(n, "browser")
          : await fetch(`/api/lab/internal-api?username=${encodeURIComponent(n)}`, { cache: "no-store" })
              .then((x) => x.json() as Promise<LabRow>)
              .catch((e) => ({ username: n, where: "server" as const, result: "UNKNOWN" as const, why: String(e), ms: 0 }));
      setRows((prev) => [...prev, r]);
      blocks = r.result === "UNKNOWN" ? blocks + 1 : 0;
      if (blocks >= LAB_STOP_AFTER_BLOCKS) {
        setNote(`Stopped after ${blocks} inconclusive responses in a row — not retrying or hammering.`);
        break;
      }
    }
    setRunning(false);
  }

  const tally = rows.reduce<Record<string, number>>((a, r) => ((a[r.result] = (a[r.result] ?? 0) + 1), a), {});
  const report = rows
    .map((r) => `${r.where}\t${r.username}\t${r.status ?? "-"}\tcf=${r.cfMitigated ?? "-"}\tacao=${r.acao ?? "-"}\t${r.result}\t${r.why}`)
    .join("\n");

  return (
    <ToastProvider>
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Lab · not part of the app
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight">Internal lookup experiment</h1>
        <p className="mt-2 text-[14px] leading-6 text-muted">
          Tests <code className="font-mono text-ink">GET frontend-api-v3.pump.fun/users/USERNAME</code> with plain requests:
          no cookies, no faked headers, one request every {LAB_INTERVAL_MS / 1000}s, stops after {LAB_STOP_AFTER_BLOCKS}{" "}
          blocked responses. 200 = exists, origin 404 = not found, 403/Cloudflare/CORS = unknown.
        </p>

        <Card className="mt-6">
          <CardHeader title="Run the test" subtitle={`Up to ${LAB_MAX_NAMES} names.`} />
          <div className="flex flex-col gap-4 p-5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Usernames"
              className="h-32 w-full rounded-xl border border-line-strong p-3 font-mono text-[14px] outline-none focus:border-ink/40"
            />
            <Segmented<Where>
              fill
              value={where}
              onChange={setWhere}
              options={[
                { value: "browser", label: "From this browser" },
                { value: "server", label: "From our server" },
              ]}
            />
            <div className="grid grid-cols-1 gap-2 sm:flex">
              {running ? (
                <Button variant="danger" onClick={() => (stopRef.current = true)}>
                  <Square className="h-3.5 w-3.5" /> Stop
                </Button>
              ) : (
                <Button variant="primary" onClick={run}>
                  <Play className="h-4 w-4" /> Run test
                </Button>
              )}
              <a
                href={internalUrl(parseUsernameList(input)[0] ?? "nom")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-line-strong px-4 text-[15px] font-medium sm:h-10 sm:text-sm"
              >
                Open raw URL in a new tab
              </a>
            </div>
          </div>
        </Card>

        {rows.length > 0 && (
          <Card className="mt-6">
            <CardHeader title="Raw results" subtitle={Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join(" · ")} />
            <ul className="divide-y divide-line">
              {rows.map((r, i) => (
                <li key={i} className="px-5 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[14px] font-medium">{r.username}</span>
                    <span className={cx("font-semibold", TONE[r.result])}>{r.result}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] leading-5 text-muted [overflow-wrap:anywhere]">
                    {r.where} · HTTP {r.status ?? "— (not readable)"} · cf-mitigated: {r.cfMitigated ?? "—"} · ACAO:{" "}
                    {r.acao ?? "—"} · {r.ms} ms
                  </div>
                  <div className="mt-1 text-ink/75">{r.why}</div>
                </li>
              ))}
            </ul>
            {note && <p className="border-t border-line px-5 py-3 text-[13px] text-unknown">{note}</p>}
            <div className="border-t border-line p-5">
              <p className="mb-2 text-[12px] font-medium text-muted">Copyable report (contains no cookies or tokens)</p>
              <textarea readOnly value={report} className="h-28 w-full rounded-lg border border-line bg-surface p-2 font-mono text-[11px]" />
            </div>
          </Card>
        )}
      </div>
    </ToastProvider>
  );
}
