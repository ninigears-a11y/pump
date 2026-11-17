"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { Diagnostic } from "@/lib/checker/types";
import { verifiedAtOf } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/util";
import type { StoredResult } from "@/lib/client/store";
import { cx } from "./ui";

/** "Verified 2m ago" only when something was actually verified; otherwise "Attempted …, not verified". */
export function CheckedLabel({ r, className }: { r: StoredResult; className?: string }) {
  const v = verifiedAtOf(r);
  return v ? (
    <span className={className} title={`Verified ${new Date(v).toLocaleString()}`}>
      Verified {timeAgo(v)}
    </span>
  ) : (
    <span className={cx("text-unknown", className)} title={`Attempted ${new Date(r.checkedAt).toLocaleString()}`}>
      Not verified · tried {timeAgo(r.checkedAt)}
    </span>
  );
}

export function methodLabel(r: StoredResult): string {
  if (r.status === "unknown") return "";
  return r.method === "official-api" ? "Official Pump.fun API" : r.method === "unofficial" ? "Unofficial source" : "";
}

/** Full explanation box for an UNKNOWN result. */
export function DiagnosticBox({ d, compact }: { d: Diagnostic; compact?: boolean }) {
  return (
    <div className={cx("rounded-xl border border-unknown-line bg-white/70", compact ? "p-3" : "p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-unknown-bg px-2 py-0.5 font-mono text-[11px] font-semibold text-unknown">{d.code}</span>
        {d.httpStatus ? <span className="text-[12px] text-muted">HTTP {d.httpStatus}</span> : null}
        {d.source ? <span className="text-[12px] text-subtle">{d.source}</span> : null}
      </div>
      <p className="mt-2 text-[14px] font-medium text-ink">{d.message}</p>
      <p className="mt-1 text-[13px] leading-5 text-ink/70">
        <span className="font-semibold text-ink/80">How to fix: </span>
        {d.fix}
      </p>
      {d.requestId && <p className="mt-1.5 break-all font-mono text-[11px] text-subtle">Request ID: {d.requestId}</p>}
    </div>
  );
}

interface Health {
  verification: "official" | "unofficial" | "unconfigured";
  probe?: { ok: boolean; diagnostic?: Diagnostic; latencyMs: number; checkedAt: string };
}

/** Top-of-page status: is real checking actually working right now? */
export function SetupStatus() {
  const [h, setH] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/health?probe=1", { cache: "no-store" })
      .then((r) => r.json())
      .then(setH)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  if (!h) {
    return (
      <div className="mb-6 flex items-center gap-2 text-[13px] text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking connection to Pump.fun…
      </div>
    );
  }
  if (h.verification === "official" && h.probe?.ok) {
    return (
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-avail-line bg-avail-bg px-3 py-1.5 text-[12px] font-medium text-avail">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Official Pump.fun API connected · {h.probe.latencyMs} ms
      </div>
    );
  }
  const d = h.probe?.diagnostic;
  const unconfigured = h.verification === "unconfigured" || d?.code === "OFFICIAL_API_KEY_MISSING";
  return (
    <div className="mb-6 rounded-2xl border border-unknown-line bg-unknown-bg/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {unconfigured ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-unknown" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-taken" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">
            {unconfigured
              ? "Username checking is not set up yet"
              : h.verification === "unofficial"
                ? "Running without the official API"
                : "The official Pump.fun API is not accepting requests"}
          </p>
          {unconfigured ? (
            <>
              <p className="mt-1 text-[13px] leading-5 text-ink/75">
                Pump.fun only allows username checks through its official API, which needs an approved key. Until one is
                added, every result is <b>Unknown</b>. Nothing is guessed.
              </p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13px] leading-5 text-ink/80">
                <li>
                  Open{" "}
                  <a className="font-medium underline" href="https://developers.pump.fun" target="_blank" rel="noopener noreferrer">
                    developers.pump.fun
                  </a>
                  , sign in with Pump.fun and apply (request the <code className="font-mono">profiles.read</code> scope).
                </li>
                <li>When approved, create a key (starts with <code className="font-mono">pf_live_</code>) and copy it.</li>
                <li>
                  In Vercel: your project → Settings → Environment Variables → add <code className="font-mono">PUMP_API_KEY</code>.
                </li>
                <li>Deployments → ⋯ → Redeploy. This banner turns green when it works.</li>
              </ol>
            </>
          ) : d ? (
            <div className="mt-3">
              <DiagnosticBox d={d} compact />
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-ink/75">
              Results come from unofficial Pump.fun sources that Cloudflare often blocks, so many will be Unknown.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
