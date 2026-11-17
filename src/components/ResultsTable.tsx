"use client";

import { useMemo, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, Clock, Copy, Download, ExternalLink, History, Link2, RotateCw, Search, Star, Trash2 } from "lucide-react";
import { store, useStore, type StoredResult } from "@/lib/client/store";
import { checkUsername } from "@/lib/client/api";
import { copyText, downloadFile, timeAgo } from "@/lib/client/util";
import { toCsv } from "@/lib/csv";
import type { CheckStatus } from "@/lib/checker/types";
import { Button, Card, CardHeader, IconButton, Segmented, StatusBadge, cx, useToast } from "./ui";

type Filter = "all" | CheckStatus | "favorites";
type Sort = "recent" | "az" | "za";
const PAGE = 100;

export function ResultsTable() {
  const results = useStore((s) => s.results);
  const checking = useStore((s) => s.checking);
  const strict = useStore((s) => s.settings.strict);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [limit, setLimit] = useState(PAGE);
  const toast = useToast();

  const all = useMemo(() => Object.values(results), [results]);
  const counts = useMemo(
    () => ({
      all: all.length,
      available: all.filter((r) => r.status === "available").length,
      taken: all.filter((r) => r.status === "taken").length,
      unknown: all.filter((r) => r.status === "unknown").length,
      favorites: all.filter((r) => r.favorite).length,
    }),
    [all],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = all.filter((r) => {
      if (filter === "favorites" ? !r.favorite : filter !== "all" && r.status !== filter) return false;
      return !needle || r.username.includes(needle);
    });
    list = [...list].sort((a, b) =>
      sort === "az"
        ? a.username.localeCompare(b.username)
        : sort === "za"
          ? b.username.localeCompare(a.username)
          : b.checkedAt.localeCompare(a.checkedAt),
    );
    return list;
  }, [all, q, filter, sort]);

  async function recheck(u: string) {
    store.setChecking([u], true);
    try {
      store.upsert(await checkUsername(u, { force: true, strict }));
    } finally {
      store.setChecking([u], false);
    }
  }

  function exportAll() {
    if (!rows.length) return toast("Nothing to export");
    downloadFile(
      `pump-username-history-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        ["username", "status", "confidence", "profile_url", "last_checked", "favorite", "reason"],
        rows.map((r) => [r.username, r.status, r.confidence, r.profileUrl, r.checkedAt, r.favorite ? "yes" : "", r.reason]),
      ),
    );
  }

  const SortIcon = sort === "za" ? ArrowUpAZ : sort === "az" ? ArrowDownAZ : Clock;

  return (
    <Card id="history">
      <CardHeader
        icon={<History className="h-4 w-4" />}
        title="Results History"
        subtitle="Saved in this browser. Favorites are kept when you clear."
        right={
          <div className="flex gap-2">
            <Button size="sm" onClick={exportAll}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Clear all results except favorites?")) store.clear(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        }
      />
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-white px-3 focus-within:border-ink/40 lg:w-72">
          <Search className="h-4 w-4 text-subtle" aria-hidden />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Search usernames"
            aria-label="Search usernames"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full overflow-x-auto">
            <Segmented<Filter>
              value={filter}
              onChange={(f) => {
                setFilter(f);
                setLimit(PAGE);
              }}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "available", label: "Available", count: counts.available },
                { value: "taken", label: "Taken", count: counts.taken },
                { value: "unknown", label: "Unknown", count: counts.unknown },
                { value: "favorites", label: <Star className="h-3.5 w-3.5" aria-label="Favorites" />, count: counts.favorites },
              ]}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSort(sort === "recent" ? "az" : sort === "az" ? "za" : "recent")}
            title="Change sort order"
          >
            <SortIcon className="h-3.5 w-3.5" />
            {sort === "recent" ? "Recent" : sort === "az" ? "A–Z" : "Z–A"}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-14 text-center text-sm text-subtle">
          {all.length ? "No usernames match your filters." : "Checked usernames will appear here."}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] font-medium text-muted">
                  <th className="px-6 py-3 font-medium">Username</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Profile URL</th>
                  <th className="px-3 py-3 font-medium">Last Checked</th>
                  <th className="px-6 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, limit).map((r) => (
                  <Row key={r.username} r={r} checking={!!checking[r.username]} onRecheck={recheck} />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="divide-y divide-line md:hidden">
            {rows.slice(0, limit).map((r) => (
              <li key={r.username} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[14px] font-medium">{r.username}</span>
                  <StatusBadge status={checking[r.username] ? "checking" : r.status} />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[12px] text-subtle">{timeAgo(r.checkedAt)}</span>
                  <Actions r={r} checking={!!checking[r.username]} onRecheck={recheck} />
                </div>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <div className="border-t border-line p-4 text-center">
              <Button size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Show more ({rows.length - limit} remaining)
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Row({ r, checking, onRecheck }: { r: StoredResult; checking: boolean; onRecheck: (u: string) => void }) {
  return (
    <tr className="group hover:bg-surface/60">
      <td className="px-6 py-3">
        <div className="flex items-center gap-2">
          {r.favorite && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="Favorite" />}
          <span className="font-mono text-[13px] font-medium">{r.username}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <span title={`${r.confidence} confidence — ${r.reason}`}>
          <StatusBadge status={checking ? "checking" : r.status} />
        </span>
      </td>
      <td className="max-w-[16rem] px-3 py-3">
        <a
          href={r.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-[13px] text-muted hover:text-ink hover:underline"
        >
          {r.profileUrl.replace(/^https:\/\//, "")}
        </a>
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-[13px] text-muted" title={new Date(r.checkedAt).toLocaleString()}>
        {timeAgo(r.checkedAt)}
      </td>
      <td className="px-6 py-3">
        <div className="flex justify-end">
          <Actions r={r} checking={checking} onRecheck={onRecheck} />
        </div>
      </td>
    </tr>
  );
}

function Actions({ r, checking, onRecheck }: { r: StoredResult; checking: boolean; onRecheck: (u: string) => void }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        label={r.favorite ? "Remove from favorites" : "Save to favorites"}
        onClick={() => store.toggleFavorite(r.username)}
      >
        <Star className={cx("h-4 w-4", r.favorite && "fill-amber-400 text-amber-500")} />
      </IconButton>
      <IconButton label="Copy username" onClick={() => copyText(r.username).then(() => toast("Username copied"))}>
        <Copy className="h-4 w-4" />
      </IconButton>
      <a
        href={r.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open Pump.fun profile"
        title="Open Pump.fun profile"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <IconButton label="Recheck" disabled={checking} onClick={() => onRecheck(r.username)}>
        <RotateCw className={cx("h-4 w-4", checking && "animate-spin")} />
      </IconButton>
      <IconButton label="Copy URL" onClick={() => copyText(r.profileUrl).then(() => toast("Profile URL copied"))}>
        <Link2 className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
