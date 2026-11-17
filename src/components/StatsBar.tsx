"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/client/store";
import { cx } from "./ui";

export function StatsBar() {
  const results = useStore((s) => s.results);
  const stats = useMemo(() => {
    const all = Object.values(results);
    return {
      total: all.length,
      available: all.filter((r) => r.status === "available").length,
      taken: all.filter((r) => r.status === "taken").length,
      unknown: all.filter((r) => r.status === "unknown").length,
    };
  }, [results]);

  const items = [
    { label: "Total Checked", value: stats.total, dot: "bg-ink" },
    { label: "Available", value: stats.available, dot: "bg-avail" },
    { label: "Taken", value: stats.taken, dot: "bg-taken" },
    { label: "Unknown", value: stats.unknown, dot: "bg-unknown" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl border border-line bg-white px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
            <span className={cx("h-1.5 w-1.5 rounded-full", i.dot)} />
            {i.label}
          </div>
          <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-[28px]">
            {i.value.toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
