import type { Evidence, EvidenceProvider, ProviderContext } from "../types";
import {
  isChallengeResponse,
  isJsonContentType,
  parseRetryAfter,
  safeFetch,
  tryParseJson,
} from "../http";

export const DEFAULT_API_BASE = "https://frontend-api-v3.pump.fun";

/**
 * Evidence provider backed by Pump.fun's public frontend API:
 *
 *   GET {base}/users/{usernameOrWallet}
 *
 * Observed behaviour (third-party documentation and client code, see README):
 *   - existing user  -> 200 JSON `{ address, username, profile_image, bio, followers, ... }`
 *   - unknown user   -> 404 JSON, or 200 with an empty body
 *
 * Guarding against false "available" results:
 *   - Cloudflare / challenge pages are `blocked`, even when served as 404.
 *   - HTML or other non-JSON 404s are `ambiguous` (the route may have moved).
 *   - NestJS "Cannot GET /users/..." 404s mean the ROUTE is missing, not the user -> `ambiguous`.
 *   - A 200 whose `username` does not match the query is `ambiguous`
 *     (the endpoint also resolves wallet addresses).
 */
export class FrontendApiProvider implements EvidenceProvider {
  readonly name = "pump-frontend-api";

  constructor(private readonly base: string = DEFAULT_API_BASE) {}

  url(username: string): string {
    return `${this.base.replace(/\/+$/, "")}/users/${encodeURIComponent(username)}`;
  }

  async check(username: string, ctx: ProviderContext): Promise<Evidence> {
    const url = this.url(username);
    const res = await safeFetch(ctx.fetch, url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "PumpUsernameChecker/1.0",
      },
      redirect: "manual",
      cache: "no-store",
      timeoutMs: ctx.timeoutMs,
      signal: ctx.signal,
    });
    const base = { source: this.name, url, durationMs: res.durationMs };

    if (!res.ok || !res.response) {
      return { ...base, outcome: "error", detail: res.error ?? "Network error" };
    }
    return classifyApiResponse(username, res.response, res.body ?? "", base);
  }
}

export function classifyApiResponse(
  username: string,
  response: Response,
  body: string,
  base: Pick<Evidence, "source"> & Partial<Evidence> = { source: "pump-frontend-api" },
): Evidence {
  const status = response.status;
  const e = (outcome: Evidence["outcome"], detail: string, extra: Partial<Evidence> = {}): Evidence => ({
    ...base,
    outcome,
    detail,
    httpStatus: status,
    ...extra,
  });

  if (status === 429) {
    return e("rate_limited", "Pump.fun API rate limit reached (HTTP 429).", {
      retryAfterSec: parseRetryAfter(response),
    });
  }
  if (isChallengeResponse(response, body)) {
    return e("blocked", `Request was challenged by Cloudflare/anti-bot protection (HTTP ${status}).`);
  }
  if (status >= 300 && status < 400) {
    return e("ambiguous", `Unexpected redirect (HTTP ${status}) to ${response.headers.get("location") ?? "unknown"}.`);
  }
  if (status === 401 || status === 403) {
    return e("blocked", `Access denied by Pump.fun API (HTTP ${status}).`);
  }
  if (status >= 500) {
    return e("error", `Pump.fun API server error (HTTP ${status}).`);
  }

  const trimmed = body.trim();

  if (status === 404) {
    if (trimmed === "") return e("not_found", "API returned 404 with an empty body: no user with this name.");
    const parsed = tryParseJson(trimmed);
    if (!parsed.ok) {
      return e("ambiguous", "API returned a non-JSON 404; the endpoint may have changed.");
    }
    const msg = extractMessage(parsed.value);
    if (msg && /^cannot (get|post|put|delete)\b/i.test(msg)) {
      return e("ambiguous", `API route not found ("${msg}"); the endpoint may have changed.`);
    }
    return e("not_found", `API returned a JSON 404${msg ? ` ("${msg}")` : ""}: no user with this name.`);
  }

  if (status === 200) {
    if (trimmed === "" || trimmed === "null") {
      return e("not_found", "API returned 200 with no user record.");
    }
    const parsed = tryParseJson(trimmed);
    if (!parsed.ok) {
      return e(
        "ambiguous",
        isJsonContentType(response)
          ? "API returned malformed JSON."
          : "API returned a non-JSON response; the endpoint may have changed.",
      );
    }
    const v = parsed.value;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const rec = v as Record<string, unknown>;
      const returnedName = typeof rec.username === "string" ? rec.username : undefined;
      const address = typeof rec.address === "string" ? rec.address : undefined;
      if (returnedName && returnedName.toLowerCase() === username.toLowerCase()) {
        return e("found", `Profile exists${address ? ` (wallet ${shortWallet(address)})` : ""}.`, {
          wallet: address,
        });
      }
      if (address && address === username) {
        return e("ambiguous", "Query matched a wallet address rather than a username.", { wallet: address });
      }
      if (address && !returnedName) {
        return e("ambiguous", "API returned a user record without a username field.", { wallet: address });
      }
      if (returnedName) {
        return e("ambiguous", `API returned a different user ("${returnedName}").`, { wallet: address });
      }
      return e("ambiguous", "API returned an object that is not a recognisable user record.");
    }
    return e("ambiguous", "API returned an unexpected JSON shape.");
  }

  return e("ambiguous", `Unexpected HTTP ${status} from Pump.fun API.`);
}

function extractMessage(v: unknown): string | undefined {
  if (v && typeof v === "object") {
    const m = (v as Record<string, unknown>).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m) && typeof m[0] === "string") return m[0];
  }
  return undefined;
}

export function shortWallet(a: string): string {
  return a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}
