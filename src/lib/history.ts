import type { CheckResult } from "./checker/types";

/**
 * Optional server-side check history using Node's built-in SQLite (`node:sqlite`).
 * Enabled only when HISTORY_DB_PATH is set. Fails soft: if SQLite is
 * unavailable, history is simply disabled and checks still work.
 */
export interface HistoryRow {
  username: string;
  status: string;
  confidence: string;
  reason: string;
  wallet: string | null;
  checked_at: string;
  verified_at: string | null;
  method: string | null;
  diagnostic_code: string | null;
}

interface Db {
  exec(sql: string): void;
  prepare(sql: string): { run(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] };
}

let db: Db | null | undefined;

function open(): Db | null {
  if (db !== undefined) return db;
  const path = process.env.HISTORY_DB_PATH;
  if (!path) return (db = null);
  try {
    // Loaded at runtime so bundlers do not try to resolve it.
    const req = eval("require") as NodeJS.Require;
    const { DatabaseSync } = req("node:sqlite") as { DatabaseSync: new (p: string) => Db };
    const fs = req("node:fs") as typeof import("node:fs");
    const nodePath = req("node:path") as typeof import("node:path");
    fs.mkdirSync(nodePath.dirname(path), { recursive: true });
    const d = new DatabaseSync(path);
    d.exec(`CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      status TEXT NOT NULL,
      confidence TEXT NOT NULL,
      reason TEXT NOT NULL,
      wallet TEXT,
      checked_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_checks_username ON checks(username);
    CREATE INDEX IF NOT EXISTS idx_checks_checked_at ON checks(checked_at);`);
    for (const col of ["verified_at TEXT", "method TEXT", "diagnostic_code TEXT"]) {
      try {
        d.exec(`ALTER TABLE checks ADD COLUMN ${col}`);
      } catch {
        /* column already exists */
      }
    }
    db = d;
  } catch (err) {
    console.warn("[history] SQLite unavailable, history disabled:", err instanceof Error ? err.message : err);
    db = null;
  }
  return db;
}

export function historyEnabled(): boolean {
  return open() !== null;
}

export function recordCheck(r: CheckResult): void {
  const d = open();
  if (!d) return;
  try {
    d.prepare(
      "INSERT INTO checks (username, status, confidence, reason, wallet, checked_at, verified_at, method, diagnostic_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      r.username,
      r.status,
      r.confidence,
      r.reason,
      r.wallet ?? null,
      r.checkedAt,
      r.verifiedAt ?? null,
      r.method,
      r.diagnostic?.code ?? null,
    );
  } catch (err) {
    console.warn("[history] insert failed:", err);
  }
}

export function listHistory(opts: { limit?: number; username?: string } = {}): HistoryRow[] {
  const d = open();
  if (!d) return [];
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 200));
  if (opts.username) {
    return d
      .prepare("SELECT username, status, confidence, reason, wallet, checked_at, verified_at, method, diagnostic_code FROM checks WHERE username = ? ORDER BY id DESC LIMIT ?")
      .all(opts.username, limit) as HistoryRow[];
  }
  return d
    .prepare("SELECT username, status, confidence, reason, wallet, checked_at, verified_at, method, diagnostic_code FROM checks ORDER BY id DESC LIMIT ?")
    .all(limit) as HistoryRow[];
}

export function clearHistory(): void {
  open()?.exec("DELETE FROM checks");
}

/** Test hook. */
export function _resetHistoryForTests(): void {
  db = undefined;
}
