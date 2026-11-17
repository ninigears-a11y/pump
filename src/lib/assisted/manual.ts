import type { CheckResult } from "@/lib/checker/types";
import { makeDiagnostic } from "@/lib/checker/diagnostics";
import { normalizeUsername } from "@/lib/checker/username";

export const PROFILE_BASE = "https://pump.fun/profile";
export const profileUrlFor = (u: string) => `${PROFILE_BASE}/${encodeURIComponent(u)}`;

/** What the user saw on pump.fun/profile/NAME. */
export type ManualVerdict = "exists" | "not_found" | "unsure";

/**
 * Build a result for a manual mark.
 *
 * - exists     -> TAKEN, method "manual"
 * - not_found  -> AVAILABLE, method "manual", low confidence. A missing profile page is NOT
 *                 proof the name can be registered (Pump.fun also reserves banned/unclaimed
 *                 handles), and the UI always labels it "Not found · checked by you".
 * - unsure     -> UNKNOWN
 *
 * Manual results never get `verifiedAt`; they get `markedAt`.
 */
export function manualResult(raw: string, verdict: ManualVerdict, now: Date = new Date()): CheckResult {
  const username = normalizeUsername(raw);
  const at = now.toISOString();
  const base = { username, profileUrl: profileUrlFor(username), checkedAt: at, evidence: [] };
  if (verdict === "exists") {
    return {
      ...base,
      status: "taken",
      confidence: "low",
      method: "manual",
      markedAt: at,
      reason: "You marked this profile as existing on pump.fun.",
    };
  }
  if (verdict === "not_found") {
    return {
      ...base,
      status: "available",
      confidence: "low",
      method: "manual",
      markedAt: at,
      reason:
        "You marked that no profile was found on pump.fun. This is a manual check, not proof the name can be registered: reserved or banned names can also be unavailable.",
    };
  }
  const d = makeDiagnostic("MANUAL_UNSURE");
  return { ...base, status: "unknown", confidence: "none", method: "none", diagnostic: d, reason: d.message };
}

/** Placeholder for a name that is queued for review but not looked at yet. */
export function notCheckedResult(raw: string, now: Date = new Date()): CheckResult {
  const username = normalizeUsername(raw);
  const d = makeDiagnostic("NOT_CHECKED");
  return {
    username,
    profileUrl: profileUrlFor(username),
    checkedAt: now.toISOString(),
    status: "unknown",
    confidence: "none",
    method: "none",
    diagnostic: d,
    reason: d.message,
    evidence: [],
  };
}

export const isManual = (r: Pick<CheckResult, "method">) => r.method === "manual";

/** Has this name been decided (by any method)? Unknown never counts as decided. */
export const isDecided = (r: Pick<CheckResult, "status"> | undefined) => !!r && r.status !== "unknown";

/** Index of the next name at/after `from` that is not decided yet; -1 when none. */
export function nextUndecided(
  batch: string[],
  results: Record<string, Pick<CheckResult, "status"> | undefined>,
  from: number,
): number {
  for (let i = Math.max(0, from); i < batch.length; i++) if (!isDecided(results[batch[i]!])) return i;
  return -1;
}
