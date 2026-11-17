"use client";

import { useState, type FormEvent } from "react";
import { AtSign, Copy, ExternalLink, RotateCw, Search, Star } from "lucide-react";
import { checkUsername } from "@/lib/client/api";
import { store, useStore } from "@/lib/client/store";
import { normalizeUsername, validateUsername } from "@/lib/checker/username";
import { copyText, timeAgo } from "@/lib/client/util";
import { Button, Card, CardHeader, IconButton, StatusBadge, cx, useToast } from "./ui";
import { Suggestions } from "./Suggestions";
import { EvidenceList } from "./EvidenceList";

const STATUS_COPY = {
  available: { title: "is available", tone: "border-avail-line bg-avail-bg/50" },
  taken: { title: "is taken", tone: "border-taken-line bg-taken-bg/50" },
  unknown: { title: "could not be verified", tone: "border-unknown-line bg-unknown-bg/50" },
} as const;

export function SingleChecker() {
  const [value, setValue] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const result = useStore((s) => (current ? s.results[current] : undefined));
  const strict = useStore((s) => s.settings.strict);
  const toast = useToast();

  async function check(force = false, raw = value) {
    const u = normalizeUsername(raw);
    const v = validateUsername(u);
    if (!v.valid) {
      setError(v.error ?? "Invalid username.");
      return;
    }
    setError(null);
    setCurrent(u);
    setLoading(true);
    store.setChecking([u], true);
    try {
      const r = await checkUsername(u, { force, strict });
      store.upsert(r);
    } finally {
      store.setChecking([u], false);
      setLoading(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void check(false);
  };

  return (
    <Card id="single">
      <CardHeader icon={<Search className="h-4 w-4" />} title="Single Checker" subtitle="Check one username against Pump.fun." />
      <div className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div
            className={cx(
              "flex h-14 w-full shrink-0 items-center rounded-xl border bg-white pl-4 transition-shadow sm:flex-1",
              "focus-within:border-ink/40 focus-within:ring-4 focus-within:ring-ink/5",
              error ? "border-taken-line" : "border-line-strong",
            )}
          >
            <span className="hidden select-none text-[15px] text-subtle sm:inline">pump.fun/u/</span>
            <AtSign className="h-4 w-4 text-subtle sm:hidden" aria-hidden />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="mrnom"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Username"
              className="h-full flex-1 rounded-xl bg-transparent pl-1 pr-4 text-lg font-medium outline-none placeholder:text-line-strong"
            />
          </div>
          <Button type="submit" size="lg" variant="primary" loading={loading} className="sm:w-48">
            Check Username
          </Button>
        </form>
        {error && <p className="mt-2 text-[13px] text-taken">{error}</p>}

        {current && (loading && !result ? (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-surface/60 p-5">
            <StatusBadge status="checking" size="lg" />
            <span className="text-sm text-muted">
              Checking <span className="font-mono text-ink">{current}</span>…
            </span>
          </div>
        ) : result ? (
          <div className={cx("mt-5 rounded-xl border p-5", STATUS_COPY[result.status].tone)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {loading ? <StatusBadge status="checking" size="lg" /> : <StatusBadge status={result.status} size="lg" />}
                  <span className="text-[12px] text-muted">
                    {result.confidence} confidence · verified {timeAgo(result.checkedAt)}
                    {result.cached ? " · cached" : ""}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                  <span className="font-mono">{result.username}</span>{" "}
                  <span className="whitespace-nowrap font-sans font-normal text-muted">{STATUS_COPY[result.status].title}</span>
                </p>
                <p className="mt-1.5 text-sm text-ink/70">{result.reason}</p>
              </div>
              <div className="flex items-center gap-1">
                {result.status === "available" && (
                  <IconButton
                    label={result.favorite ? "Remove from favorites" : "Save to favorites"}
                    onClick={() => store.toggleFavorite(result.username)}
                  >
                    <Star className={cx("h-4 w-4", result.favorite && "fill-amber-400 text-amber-500")} />
                  </IconButton>
                )}
                <IconButton label="Copy username" onClick={() => copyText(result.username).then(() => toast("Username copied"))}>
                  <Copy className="h-4 w-4" />
                </IconButton>
                <a
                  href={result.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open Pump.fun profile"
                  title="Open Pump.fun profile"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-white hover:text-ink"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <IconButton label="Recheck" disabled={loading} onClick={() => check(true, result.username)}>
                  <RotateCw className={cx("h-4 w-4", loading && "animate-spin")} />
                </IconButton>
              </div>
            </div>
            <button
              onClick={() => setShowDetails((s) => !s)}
              className="mt-4 text-[12px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              {showDetails ? "Hide" : "Show"} verification details
            </button>
            {showDetails && (
              <div className="mt-3">
                <EvidenceList evidence={result.evidence} />
              </div>
            )}
            {result.status === "taken" && <Suggestions username={result.username} />}
            {result.status === "unknown" && (
              <p className="mt-4 text-[13px] text-unknown">
                We never guess. Try rechecking in a moment, or open the profile on Pump.fun to verify manually.
              </p>
            )}
          </div>
        ) : null)}
      </div>
    </Card>
  );
}
