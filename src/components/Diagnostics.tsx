"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FlaskConical, Hand } from "lucide-react";
import { useCheckMode } from "@/lib/client/mode";
import type { Diagnostic } from "@/lib/checker/types";
import { verifiedAtOf } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/util";
import type { StoredResult } from "@/lib/client/store";
import { cx } from "./ui";

/**
 * Honest time label:
 *  - automatic AVAILABLE/TAKEN -> "Verified 2m ago"
 *  - manual marks              -> "Checked by you 2m ago"
 *  - everything else           -> "Not verified · tried 2m ago"
 */
export function CheckedLabel({ r, className }: { r: StoredResult; className?: string }) {
  if (r.method === "manual" && r.status !== "unknown") {
    const at = r.markedAt ?? r.checkedAt;
    return (
      <span className={className} title={`Marked by you ${new Date(at).toLocaleString()}`}>
        Checked by you {timeAgo(at)}
      </span>
    );
  }
  const v = verifiedAtOf(r);
  if (v) {
    return (
      <span className={className} title={`Verified ${new Date(v).toLocaleString()}`}>
        Verified {timeAgo(v)}
      </span>
    );
  }
  const label = r.diagnostic?.code === "NOT_CHECKED" || r.diagnostic?.code === "OFFICIAL_API_KEY_MISSING" ? "Not checked yet" : `Not verified · tried ${timeAgo(r.checkedAt)}`;
  return (
    <span className={cx("text-unknown", className)} title={`Attempted ${new Date(r.checkedAt).toLocaleString()}`}>
      {label}
    </span>
  );
}

export function methodLabel(r: StoredResult): string {
  if (r.status === "unknown") return "";
  switch (r.method) {
    case "official-api":
      return "Official Pump.fun API";
    case "browser":
      return "Automatic browser check";
    case "unofficial":
      return "Unofficial source";
    case "manual":
      return "Manual check on pump.fun";
    default:
      return "";
  }
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

/**
 * Small status line under the title. Free (assisted) mode is the normal state and shows a
 * neutral note — no warnings. Only an optional integration that is configured but failing
 * shows its diagnostic.
 */
export function ModeStatus() {
  const { mode, ready } = useCheckMode();
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    if (mode !== "server") return;
    fetch("/api/health?probe=1", { cache: "no-store" })
      .then((r) => r.json())
      .then(setH)
      .catch(() => setH(null));
  }, [mode]);

  if (!ready) return null;
  if (mode === "assisted") {
    return (
      <div className="mb-6 inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-muted">
        <Hand className="h-3.5 w-3.5 shrink-0 text-ink" aria-hidden />
        <span>Free mode · open each profile on pump.fun and mark what you see</span>
      </div>
    );
  }
  if (mode === "browser") {
    return (
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-muted">
        <FlaskConical className="h-3.5 w-3.5 text-ink" aria-hidden /> Automatic browser check (experimental)
      </div>
    );
  }
  if (!h) return null;
  if (h.probe?.ok) {
    return (
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-avail-line bg-avail-bg px-3 py-1.5 text-[12px] font-medium text-avail">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        Automatic checks · official Pump.fun API · {h.probe.latencyMs} ms
      </div>
    );
  }
  return h.probe?.diagnostic ? (
    <div className="mb-6">
      <p className="mb-2 text-[13px] font-semibold text-ink">
        The optional Pump.fun API key is configured but not working. Manual checking still works.
      </p>
      <DiagnosticBox d={h.probe.diagnostic} compact />
    </div>
  ) : null;
}
