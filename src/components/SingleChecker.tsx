"use client";

import { useState, type FormEvent } from "react";
import { AtSign, Copy, Link2, RotateCw, Search, Star } from "lucide-react";
import { checkUsername } from "@/lib/client/api";
import { checkInBrowser } from "@/lib/assisted/browserCheck";
import { useCheckMode } from "@/lib/client/mode";
import { store, useStore, type StoredResult } from "@/lib/client/store";
import { normalizeUsername, validateUsername } from "@/lib/checker/username";
import { profileUrlFor } from "@/lib/assisted/manual";
import { copyText } from "@/lib/client/util";
import { CheckedLabel, DiagnosticBox, methodLabel } from "./Diagnostics";
import { HowToJudge, MarkButtons, OpenProfileButton } from "./Assisted";
import { Button, Card, CardHeader, IconButton, StatusBadge, cx, useToast } from "./ui";
import { Suggestions } from "./Suggestions";
import { EvidenceList } from "./EvidenceList";

function headline(r: StoredResult | undefined): { title: string; tone: string } {
  if (!r) return { title: "— not checked yet", tone: "border-line bg-surface/60" };
  const manual = r.method === "manual";
  if (r.status === "taken") return { title: manual ? "exists (checked by you)" : "is taken", tone: "border-taken-line bg-taken-bg/50" };
  if (r.status === "available")
    return { title: manual ? "not found (checked by you)" : "is available", tone: "border-avail-line bg-avail-bg/50" };
  return { title: "is unknown", tone: "border-unknown-line bg-unknown-bg/50" };
}

export function SingleChecker() {
  const { mode } = useCheckMode();
  const automatic = mode !== "assisted";
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
    if (!automatic) return; // Free mode: show the open/mark card; nothing is fetched.
    setLoading(true);
    store.setChecking([u], true);
    try {
      const r = mode === "browser" ? await checkInBrowser(u) : await checkUsername(u, { force, strict });
      const prev = store.get().results[u];
      if (!(r.status === "unknown" && prev?.method === "manual")) store.upsert(r);
    } finally {
      store.setChecking([u], false);
      setLoading(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void check(false);
  };

  const h = headline(result);
  const isManual = result?.method === "manual";
  // Offer manual marking whenever nothing was verified automatically.
  const showMarking = !!current && (!automatic || !result || result.status === "unknown" || isManual);

  return (
    <Card id="single">
      <CardHeader
        icon={<Search className="h-4 w-4" />}
        title="Single Checker"
        subtitle={automatic ? "Check one username against Pump.fun." : "Open the profile on pump.fun and mark what you see."}
      />
      <div className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
          <div
            className={cx(
              "flex h-14 w-full shrink-0 items-center rounded-xl border bg-white pl-4 transition-shadow sm:flex-1",
              "focus-within:border-ink/40 focus-within:ring-4 focus-within:ring-ink/5",
              error ? "border-taken-line" : "border-line-strong",
            )}
          >
            <span className="hidden select-none text-[15px] text-subtle sm:inline">pump.fun/profile/</span>
            <AtSign className="h-4 w-4 text-subtle sm:hidden" aria-hidden />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="mrnom"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="go"
              aria-label="Username"
              className="h-full flex-1 rounded-xl bg-transparent pl-1 pr-4 text-lg font-medium outline-none placeholder:text-line-strong"
            />
          </div>
          <Button type="submit" size="lg" variant="primary" loading={loading} className="sm:w-48">
            Check Username
          </Button>
        </form>
        {error && <p className="mt-2 text-[13px] text-taken">{error}</p>}

        {current && loading && !result && (
          <div className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-surface/60 p-5">
            <StatusBadge status="checking" size="lg" />
            <span className="text-sm text-muted">
              Checking <span className="font-mono text-ink">{current}</span>…
            </span>
          </div>
        )}

        {current && !(loading && !result) && (
          <div className={cx("mt-5 rounded-xl border p-4 sm:p-5", h.tone)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                {result && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {loading ? (
                      <StatusBadge status="checking" size="lg" />
                    ) : (
                      <StatusBadge status={result.status} manual={isManual} size="lg" />
                    )}
                    <span className="text-[12px] text-muted">
                      <CheckedLabel r={result} />
                      {methodLabel(result) ? ` · ${methodLabel(result)}` : ""}
                      {!isManual && result.confidence !== "none" ? ` · ${result.confidence} confidence` : ""}
                      {result.cached ? " · cached" : ""}
                    </span>
                  </div>
                )}
                <p className="mt-3 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                  <span className="font-mono">{current}</span>{" "}
                  <span className="font-sans font-normal text-muted">{h.title}</span>
                </p>
                {result && result.status !== "unknown" && <p className="mt-1.5 text-sm text-ink/70">{result.reason}</p>}
              </div>
              <div className="flex items-center gap-1">
                {result && result.status === "available" && (
                  <IconButton
                    label={result.favorite ? "Remove from favorites" : "Save to favorites"}
                    onClick={() => store.toggleFavorite(result.username)}
                  >
                    <Star className={cx("h-4 w-4", result.favorite && "fill-amber-400 text-amber-500")} />
                  </IconButton>
                )}
                <IconButton label="Copy username" onClick={() => copyText(current).then(() => toast("Username copied"))}>
                  <Copy className="h-4 w-4" />
                </IconButton>
                <IconButton label="Copy URL" onClick={() => copyText(profileUrlFor(current)).then(() => toast("Profile URL copied"))}>
                  <Link2 className="h-4 w-4" />
                </IconButton>
                {automatic && (
                  <IconButton label="Recheck" disabled={loading} onClick={() => check(true, current)}>
                    <RotateCw className={cx("h-4 w-4", loading && "animate-spin")} />
                  </IconButton>
                )}
              </div>
            </div>

            {result?.status === "unknown" && result.diagnostic && automatic && (
              <div className="mt-4">
                <DiagnosticBox d={result.diagnostic} />
              </div>
            )}

            {showMarking && (
              <div className="mt-4 flex flex-col gap-3">
                <OpenProfileButton username={current} className="w-full" />
                <MarkButtons username={current} current={result} />
                <HowToJudge />
              </div>
            )}

            {result && result.evidence.length > 0 && (
              <>
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
              </>
            )}
            {result?.status === "taken" && <Suggestions username={current} />}
          </div>
        )}
      </div>
    </Card>
  );
}
