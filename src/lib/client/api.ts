import type { CheckResult, DiagnosticCode } from "@/lib/checker/types";
import { makeDiagnostic } from "@/lib/checker/diagnostics";

export const PROFILE_BASE = "https://pump.fun/profile";
export const profileUrlFor = (u: string) => `${PROFILE_BASE}/${encodeURIComponent(u)}`;

export type ClientCheckResult = CheckResult & { cooldownMs?: number };

function unknownResult(username: string, code: DiagnosticCode, cooldownMs?: number, detail?: string): ClientCheckResult {
  const diagnostic = makeDiagnostic(code);
  return {
    username,
    status: "unknown",
    confidence: "none",
    reason: detail ?? diagnostic.message,
    profileUrl: profileUrlFor(username),
    checkedAt: new Date().toISOString(),
    method: "none",
    diagnostic,
    evidence: [],
    cooldownMs,
  };
}

/** Call our backend. Never throws: failures become UNKNOWN results with a diagnostic. */
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
      return unknownResult(username, "LOCAL_RATE_LIMIT", Math.max(1, sec) * 1000);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return unknownResult(username, "CHECKER_UNREACHABLE", undefined, body.error ?? `This app's server returned HTTP ${res.status}.`);
    }
    const result = (await res.json()) as CheckResult;
    if (result.status === "unknown" && result.diagnostic?.code === "RATE_LIMITED") {
      const retry = result.evidence.find((e) => e.retryAfterSec)?.retryAfterSec;
      return { ...result, cooldownMs: (retry ?? 10) * 1000 };
    }
    return result;
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return unknownResult(username, "CANCELLED");
    return unknownResult(username, "CHECKER_UNREACHABLE");
  }
}

/** Results stored by older versions lack verifiedAt/method; derive them safely. */
export function verifiedAtOf(r: Pick<CheckResult, "status" | "checkedAt" | "verifiedAt">): string | undefined {
  if (r.status === "unknown") return undefined;
  return r.verifiedAt ?? r.checkedAt;
}
