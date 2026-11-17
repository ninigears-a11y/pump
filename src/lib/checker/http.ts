import type { FetchLike } from "./types";

export interface FetchOutcome {
  ok: boolean;
  response?: Response;
  body?: string;
  error?: string;
  timedOut?: boolean;
  durationMs: number;
}

/** Fetch with a hard timeout that never throws. Body is read as text (max 2 MB). */
export async function safeFetch(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit & { timeoutMs: number },
): Promise<FetchOutcome> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  const onOuterAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const { timeoutMs: _t, ...rest } = init;
    const response = await fetchImpl(url, { ...rest, signal: controller.signal });
    let body = "";
    try {
      body = await response.text();
      if (body.length > 2_000_000) body = body.slice(0, 2_000_000);
    } catch {
      body = "";
    }
    return { ok: true, response, body, durationMs: Date.now() - started };
  } catch (err) {
    const timedOut = controller.signal.aborted && !init.signal?.aborted;
    return {
      ok: false,
      error: timedOut ? "Request timed out." : describeNetworkError(err),
      timedOut,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", onOuterAbort);
  }
}

const CHALLENGE_MARKERS = [
  "just a moment...",
  "cf-chl",
  "challenges.cloudflare.com",
  "attention required! | cloudflare",
  "cf-error-details",
  "enable javascript and cookies to continue",
  "checking your browser",
  "captcha",
  "ddos protection by",
];

/** Detect Cloudflare / WAF challenge or block pages. */
export function isChallengeResponse(res: Response | undefined, body: string): boolean {
  if (res?.headers.get("cf-mitigated")) return true;
  const lower = body.slice(0, 20_000).toLowerCase();
  return CHALLENGE_MARKERS.some((m) => lower.includes(m));
}

export function parseRetryAfter(res: Response | undefined): number | undefined {
  const v = res?.headers.get("retry-after");
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs);
  const date = Date.parse(v);
  if (!Number.isNaN(date)) return Math.max(0, Math.round((date - Date.now()) / 1000));
  return undefined;
}

export function isJsonContentType(res: Response | undefined): boolean {
  return (res?.headers.get("content-type") ?? "").toLowerCase().includes("json");
}

export function tryParseJson(body: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

function describeNetworkError(err: unknown): string {
  if (!(err instanceof Error)) return `Network error: ${String(err)}`;
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ?? cause?.message;
  return `Network error: ${err.message}${code ? ` (${code})` : ""}.`;
}
