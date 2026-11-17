"use client";

import { useMemo, useState } from "react";
import { Copy, Send, Wand2 } from "lucide-react";
import { CATEGORY_LABELS, generateUsernames, type GeneratorCategory } from "@/lib/generator";
import { useBulk } from "@/lib/client/bulk";
import { useStore } from "@/lib/client/store";
import { copyText } from "@/lib/client/util";
import { Button, Card, CardHeader, cx, useToast } from "./ui";

const COUNTS = [10, 50, 100, 500, 1000] as const;
const ALL = Object.keys(CATEGORY_LABELS) as GeneratorCategory[];

export function Generator() {
  const [cats, setCats] = useState<GeneratorCategory[]>(["mr", "the"]);
  const [count, setCount] = useState<number>(50);
  const [keyword, setKeyword] = useState("");
  const [skipChecked, setSkipChecked] = useState(true);
  const [ideas, setIdeas] = useState<string[]>([]);
  const results = useStore((s) => s.results);
  const bulk = useBulk();
  const toast = useToast();

  const toggle = (c: GeneratorCategory) =>
    setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  function generate() {
    const list = generateUsernames({
      count,
      categories: cats,
      keyword,
      exclude: skipChecked ? Object.keys(results) : [],
    });
    setIdeas(list);
    if (list.length < count) toast(`Generated ${list.length} unique ideas (category space exhausted)`);
  }

  const preview = useMemo(() => ideas.slice(0, 300), [ideas]);

  return (
    <Card id="generator">
      <CardHeader
        icon={<Wand2 className="h-4 w-4" />}
        title="Username Generator"
        subtitle="Generate ideas, then send them straight to the bulk checker."
      />
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium">Categories</span>
            <button
              className="text-[12px] font-medium text-muted hover:text-ink"
              onClick={() => setCats(cats.length === ALL.length ? [] : ALL)}
            >
              {cats.length === ALL.length ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ALL.map((c) => {
              const on = cats.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggle(c)}
                  aria-pressed={on}
                  className={cx(
                    "rounded-xl border px-3.5 py-2.5 text-left transition-all",
                    on ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink/30",
                  )}
                >
                  <div className="text-[13px] font-semibold">{CATEGORY_LABELS[c].label}</div>
                  <div className={cx("mt-0.5 truncate text-[12px]", on ? "text-white/60" : "text-subtle")}>
                    {CATEGORY_LABELS[c].example}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div>
            <span className="mb-1.5 block text-[13px] font-medium">How many</span>
            <div className="inline-flex rounded-xl border border-line bg-surface p-1">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-[13px] font-medium tabular-nums transition-all",
                    count === n ? "bg-white shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
                  )}
                >
                  {n.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
          <label className="flex-1">
            <span className="mb-1.5 block text-[13px] font-medium">
              Keyword <span className="font-normal text-subtle">(optional)</span>
            </span>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. nom"
              className="h-10 w-full rounded-xl border border-line-strong bg-white px-3.5 text-sm outline-none focus:border-ink/40 focus:ring-4 focus:ring-ink/5"
            />
          </label>
          <Button variant="primary" onClick={generate} disabled={!cats.length && !keyword}>
            <Wand2 className="h-4 w-4" /> Generate
          </Button>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          <input type="checkbox" checked={skipChecked} onChange={(e) => setSkipChecked(e.target.checked)} className="h-4 w-4 accent-black" />
          Skip usernames already checked
        </label>

        {ideas.length > 0 && (
          <div className="rounded-xl border border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <span className="text-[13px] font-medium">
                {ideas.length.toLocaleString()} ideas
                {ideas.length > preview.length && <span className="font-normal text-subtle"> · showing {preview.length}</span>}
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => copyText(ideas.join("\n")).then(() => toast(`Copied ${ideas.length} ideas`))}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button size="sm" onClick={() => { bulk.setInput(ideas.join("\n")); bulk.focus(); }}>
                  Edit in bulk
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => bulk.run(ideas)}
                >
                  <Send className="h-3.5 w-3.5" /> Check all
                </Button>
              </div>
            </div>
            <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto p-4">
              {preview.map((u) => (
                <span key={u} className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[12px]">
                  {u}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
