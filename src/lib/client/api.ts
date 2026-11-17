import type { CheckResult } from "@/lib/checker/types";

export const PROFILE_BASE = "https://pump.fun/u";
export const profileUrlFor = (u: string) => `${PROFILE_BASE}/${encodeURIComponent(u)}`;

function unknownResult(username: string, reason: string, cooldownMs?: number): CheckResult & { cooldownMs?: number } {
  return {
    username,
    status: "unknown",
    confidence: "low",
    reason,
    profileUrl: profileUrlFor(username),
    checkedAt: new Date().toISOString(),
    evidence: [],
    cooldownMs,
  };
}

export type ClientCheckResult = CheckResult & { cooldownMs?: number };

/** Call our backend. Never throws: failures become UNKNOWN results. */
export async function checkUsername(
  username: string,
  opts: { force?: boolean; strict?: boolean; signal?: AbortSignal } = {},
): Promise<ClientCheckResult> {
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, force: !!opts.force, strict: !!opts.strict }),
      signal: opts.signal,
    });
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
      const sec = body.retryAfterSec ?? (Number(res.headers.get("retry-after")) || 10);
      return unknownResult(username, "Local rate limit reached; slowing down.", Math.max(1, sec) * 1000);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return unknownResult(username, body.error ?? `Checker returned HTTP ${res.status}.`);
    }
    const result = (await res.json()) as CheckResult;
    const rateLimited = result.status === "unknown" && result.evidence.some((e) => e.outcome === "rate_limited");
    const retry = result.evidence.find((e) => e.retryAfterSec)?.retryAfterSec;
    return rateLimited ? { ...result, cooldownMs: (retry ?? 10) * 1000 } : result;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return unknownResult(username, "Check was cancelled.");
    return unknownResult(username, "Could not reach the checker service.");
  }
}
