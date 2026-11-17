import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _resetHistoryForTests, clearHistory, historyEnabled, listHistory, recordCheck } from "@/lib/history";

const dir = mkdtempSync(join(tmpdir(), "pump-hist-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("history (node:sqlite)", () => {
  it("is disabled without HISTORY_DB_PATH", () => {
    delete process.env.HISTORY_DB_PATH;
    _resetHistoryForTests();
    expect(historyEnabled()).toBe(false);
    expect(listHistory()).toEqual([]);
  });

  it("records, lists and clears checks", () => {
    process.env.HISTORY_DB_PATH = join(dir, "sub", "h.db");
    _resetHistoryForTests();
    expect(historyEnabled()).toBe(true);
    const base = { profileUrl: "https://pump.fun/u/x", evidence: [], confidence: "high" as const, reason: "r" };
    recordCheck({ ...base, username: "mrnom", status: "taken", checkedAt: "2026-01-01T00:00:00Z", wallet: "W" });
    recordCheck({ ...base, username: "mrfree", status: "available", checkedAt: "2026-01-02T00:00:00Z" });
    expect(listHistory().map((r) => r.username)).toEqual(["mrfree", "mrnom"]);
    expect(listHistory({ username: "mrnom" })[0]).toMatchObject({ status: "taken", wallet: "W" });
    clearHistory();
    expect(listHistory()).toEqual([]);
    delete process.env.HISTORY_DB_PATH;
    _resetHistoryForTests();
  });
});
