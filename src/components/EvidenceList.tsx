"use client";

import type { Evidence } from "@/lib/checker/types";
import { cx } from "./ui";

const OUTCOME_CLS: Record<Evidence["outcome"], string> = {
  found: "text-taken",
  not_found: "text-avail",
  blocked: "text-unknown",
  rate_limited: "text-unknown",
  error: "text-unknown",
  ambiguous: "text-unknown",
  skipped: "text-subtle",
};

export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <p className="text-[13px] text-muted">No network requests were made.</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {evidence.map((e, i) => (
        <li key={i} className="flex flex-col gap-1 px-3.5 py-2.5 text-[13px] sm:flex-row sm:items-center sm:gap-3">
          <span className="w-44 shrink-0 font-mono text-[12px] text-muted">{e.source}</span>
          <span className={cx("w-24 shrink-0 font-semibold", OUTCOME_CLS[e.outcome])}>
            {e.outcome.replace("_", " ")}
            {e.httpStatus ? <span className="ml-1 font-normal text-subtle">· {e.httpStatus}</span> : null}
          </span>
          <span className="text-ink/80">{e.detail}</span>
        </li>
      ))}
    </ul>
  );
}
