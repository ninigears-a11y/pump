"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Layers, Search, ShieldCheck, Wand2 } from "lucide-react";
import { BulkProvider, useBulk } from "@/lib/client/bulk";
import { BulkChecker } from "./BulkChecker";
import { Generator } from "./Generator";
import { ResultsTable } from "./ResultsTable";
import { SingleChecker } from "./SingleChecker";
import { StatsBar } from "./StatsBar";
import { Segmented, ToastProvider } from "./ui";

type Tab = "single" | "bulk" | "generator";

export function Dashboard() {
  const [tab, setTab] = useState<Tab>("single");
  // Anything that sends work to the bulk checker (generator, suggestions) switches to its tab.
  const focusBulk = useCallback(() => {
    setTab("bulk");
    requestAnimationFrame(() => document.getElementById("bulk")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);
  return (
    <ToastProvider>
      <BulkProvider onFocus={focusBulk}>
        <Inner tab={tab} setTab={setTab} />
      </BulkProvider>
    </ToastProvider>
  );
}

function useVerificationMode() {
  const [mode, setMode] = useState<"official" | "unofficial" | null>(null);
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { verification?: "official" | "unofficial" }) => setMode(d.verification ?? null))
      .catch(() => setMode(null));
  }, []);
  return mode;
}

function Inner({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const bulk = useBulk();
  const mode = useVerificationMode();

  return (
    <div
      className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-14"
      style={{ paddingLeft: "max(1rem, env(safe-area-inset-left))", paddingRight: "max(1rem, env(safe-area-inset-right))" }}
    >
      <header className="mb-8 flex flex-col gap-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {mode === "official" ? (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-avail-line bg-avail-bg px-3 py-1 text-[12px] font-medium text-avail">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Verified with the official Pump.fun API
            </div>
          ) : (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-avail" aria-hidden />
              Evidence-based checks · never guesses
            </div>
          )}
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] sm:text-[44px]">Pump Username Checker</h1>
          <p className="mt-2 text-[15px] text-muted sm:text-lg">Find your next identity on Pump.fun.</p>
        </div>
      </header>

      {mode === "unofficial" && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-unknown-line bg-unknown-bg/60 p-4 text-[13px] leading-5 text-ink/80">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-unknown" aria-hidden />
          <p>
            <b className="font-semibold text-ink">Official Pump.fun API key not configured.</b> Checks use Pump.fun&apos;s
            public pages, which Cloudflare often blocks for servers, so many results may be <b>Unknown</b>. Nothing is
            ever marked available without evidence.
          </p>
        </div>
      )}

      <StatsBar />

      <nav className="sticky top-0 z-30 -mx-4 mt-6 bg-white/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/75 sm:static sm:mx-0 sm:mt-8 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Segmented<Tab>
          fill
          value={tab}
          onChange={setTab}
          options={[
            { value: "single", label: <><Search className="h-3.5 w-3.5" /> Single</> },
            { value: "bulk", label: <><Layers className="h-3.5 w-3.5" /> Bulk</>, count: bulk.snapshot.total || undefined },
            { value: "generator", label: <><Wand2 className="h-3.5 w-3.5" /> Generator</> },
          ]}
        />
      </nav>

      <main className="mt-4 flex flex-col gap-6">
        <TabSwitcher tab={tab} />
        <ResultsTable />
      </main>

      <footer className="mt-12 text-center text-[12px] leading-5 text-subtle">
        Not affiliated with Pump.fun. Results reflect public data at the time of checking; a name shown as available
        can still be claimed by someone else before you.
      </footer>
    </div>
  );
}

function TabSwitcher({ tab }: { tab: Tab }) {
  return (
    <>
      <div hidden={tab !== "single"}>
        <SingleChecker />
      </div>
      <div hidden={tab !== "bulk"}>
        <BulkChecker />
      </div>
      <div hidden={tab !== "generator"}>
        <Generator />
      </div>
    </>
  );
}
