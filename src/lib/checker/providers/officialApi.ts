import type { Evidence, EvidenceProvider, ProviderContext } from "../types";
import { isChallengeResponse, parseRetryAfter, safeFetch, tryParseJson } from "../http";

export const DEFAULT_OFFICIAL_API_BASE = "https://api.pump.fun/v1";

/**
 * Pump.fun's official Developer API (https://docs.pump.fun):
 *
 *   GET {base}/users/username-exists/{username}
 *   Authorization: Bearer pf_live_...
 *   200 -> { "exists_flag": boolean }   // "Whether the handle is already reserved"
 *
 * Needs an API key issued at developers.pump.fun after the application is
 * approved. The key is read from a server-side environment variable only and
 * is never sent to the browser.
 *
 * This is the only AUTHORITATIVE source: `exists_flag: false` alone is enough
 * for AVAILABLE. Every other response (401/403 key problems, 429, 5xx, odd
 * shapes) is inconclusive, and the engine falls back to the unofficial sources.
 */
export class OfficialApiProvider implements EvidenceProvider {
  readonly name = "pump-official-api";
  readonly authoritative = true;

  constructor(
    private readonly apiKey: string,
    private readonly base: string = DEFAULT_OFFICIAL_API_BASE,
  ) {}

  url(username: string): string {
    return `${this.base.replace(/\/+$/, "")}/users/username-exists/${encodeURIComponent(username)}`;
  }

  async check(username: string, ctx: ProviderContext): Promise<Evidence> {
    const url = this.url(username);
    const res = await safeFetch(ctx.fetch, url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${this.apiKey}` },
      redirect: "manual",
      cache: "no-store",
      timeoutMs: ctx.timeoutMs,
      signal: ctx.signal,
    });
    const base = { source: this.name, url, durationMs: res.durationMs };
    if (!res.ok || !res.response) return { ...base, outcome: "error", detail: res.error ?? "Network error" };
    return classifyOfficialResponse(res.response, res.body ?? "", base);
  }
}

const KEY_PROBLEMS: Record<string, string> = {
  API_KEY_REQUIRED: "No API key was sent.",
  API_KEY_INVALID: "The configured API key is invalid.",
  API_KEY_REVOKED: "The configured API key has been revoked.",
  API_ORG_NOT_APPROVED: "The Pump.fun developer organisation is not approved yet.",
  API_ORG_SUSPENDED: "The Pump.fun developer organisation is suspended.",
  API_SCOPE_FORBIDDEN: "The API key lacks the profiles.read scope.",
  API_REGION_RESTRICTED: "The server's region is not allowed by the Pump.fun API.",
  API_CREDENTIAL_NOT_ALLOWED: "Pump.fun refused the credential type.",
};

export function classifyOfficialResponse(
  response: Response,
  body: string,
  base: Pick<Evidence, "source"> & Partial<Evidence> = { source: "pump-official-api" },
): Evidence {
  const status = response.status;
  const e = (outcome: Evidence["outcome"], detail: string, extra: Partial<Evidence> = {}): Evidence => ({
    ...base,
    outcome,
    detail,
    httpStatus: status,
    ...extra,
  });
  const parsed = tryParseJson(body.trim());
  const errCode =
    parsed.ok && parsed.value && typeof parsed.value === "object"
      ? (parsed.value as Record<string, unknown>).error
      : undefined;

  if (status === 429) {
    return e("rate_limited", "Official API rate limit reached (HTTP 429).", { retryAfterSec: parseRetryAfter(response) });
  }
  if (status === 401 || status === 403 || status === 400) {
    const code = typeof errCode === "string" ? errCode : undefined;
    return e("blocked", `Official API refused the request${code ? ` (${code})` : ""}: ${(code && KEY_PROBLEMS[code]) || `HTTP ${status}.`}`);
  }
  if (isChallengeResponse(response, body)) return e("blocked", `Official API request was challenged (HTTP ${status}).`);
  if (status >= 500) return e("error", `Official API unavailable (HTTP ${status}).`, { retryAfterSec: parseRetryAfter(response) });
  if (status !== 200) return e("ambiguous", `Unexpected HTTP ${status} from the official API.`);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") {
    return e("ambiguous", "Official API returned a response that is not the documented JSON object.");
  }
  const flag = (parsed.value as Record<string, unknown>).exists_flag;
  if (flag === true) return e("found", "Official Pump.fun API: this username is already reserved (exists_flag = true).");
  if (flag === false) return e("not_found", "Official Pump.fun API: this username is not reserved (exists_flag = false).");
  return e("ambiguous", "Official API response has no boolean exists_flag.");
}
