"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { suggestVariations } from "@/lib/suggestions";
import { useBulk } from "@/lib/client/bulk";
import { useCheckMode } from "@/lib/client/mode";
import { useStore } from "@/lib/client/store";
import { Button, cx } from "./ui";

export function Suggestions({ username }: { username: string }) {
  const results = useStore((s) => s.results);
  const bulk = useBulk();
  const { mode } = useCheckMode();
  const ideas = useMemo(() => suggestVariations(username, 16), [username]);
  if (!ideas.length) return null;

  return (
    <div className="mt-5 rounded-xl border border-line bg-surface/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <Sparkles className="h-4 w-4" aria-hidden /> Try a variation
        </div>
        <Button size="sm" variant="primary" onClick={() => bulk.run(ideas)}>
          {mode === "assisted" ? "Review" : "Check"} all {ideas.length} suggestions
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ideas.map((s) => {
          const st = results[s]?.status;
          return (
            <button
              key={s}
              onClick={() => bulk.run([s])}
              title={st ? `Last result: ${st}` : "Check this username"}
              className={cx(
                "rounded-lg border px-2.5 py-1 font-mono text-[13px] transition-colors",
                st === "available" && "border-avail-line bg-avail-bg text-avail",
                st === "taken" && "border-taken-line bg-taken-bg text-taken line-through decoration-1",
                st === "unknown" && "border-unknown-line bg-unknown-bg text-unknown",
                !st && "border-line bg-white text-ink hover:border-ink/30",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
