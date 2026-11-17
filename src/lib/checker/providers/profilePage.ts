import type { Evidence, EvidenceProvider, ProviderContext } from "../types";
import { failureCode, isChallengeResponse, parseRetryAfter, safeFetch } from "../http";

export const DEFAULT_PROFILE_BASE = "https://pump.fun/profile";

/**
 * Corroborating evidence from the public profile page `https://pump.fun/profile/{username}`.
 *
 * The page is a client-rendered Next.js app, so this provider is deliberately
 * conservative: it only reports `found` when the HTML embeds the username in a
 * profile context, and only reports `not_found` on an origin (non-challenge)
 * 404 or an explicit "not found" message. Everything else is `ambiguous`.
 *
 * Page evidence alone can never make a username `available`; see verdict.ts.
 */
export class ProfilePageProvider implements EvidenceProvider {
  readonly name = "pump-profile-page";

  constructor(private readonly base: string = DEFAULT_PROFILE_BASE) {}

  url(username: string): string {
    return `${this.base.replace(/\/+$/, "")}/${encodeURIComponent(username)}`;
  }

  async check(username: string, ctx: ProviderContext): Promise<Evidence> {
    const url = this.url(username);
    const res = await safeFetch(ctx.fetch, url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "PumpUsernameChecker/1.0",
      },
      redirect: "manual",
      cache: "no-store",
      timeoutMs: ctx.timeoutMs,
      signal: ctx.signal,
    });
    const base = { source: this.name, url, durationMs: res.durationMs };
    if (!res.ok || !res.response) {
      return { ...base, outcome: "error", detail: res.error ?? "Network error", code: failureCode(res) };
    }
    return classifyPageResponse(username, res.response, res.body ?? "", base);
  }
}

const NOT_FOUND_MARKERS = [
  "user not found",
  "profile not found",
  "this page could not be found",
  "page not found",
];

export function classifyPageResponse(
  username: string,
  response: Response,
  body: string,
  base: Pick<Evidence, "source"> & Partial<Evidence> = { source: "pump-profile-page" },
): Evidence {
  const status = response.status;
  const e = (outcome: Evidence["outcome"], detail: string, extra: Partial<Evidence> = {}): Evidence => ({
    ...base,
    outcome,
    detail,
    httpStatus: status,
    code: autoCode(outcome, detail, status),
    ...extra,
  });

  if (status === 429) {
    return e("rate_limited", "Profile page rate limited (HTTP 429).", { retryAfterSec: parseRetryAfter(response) });
  }
  if (isChallengeResponse(response, body)) {
    return e("blocked", `Profile page is behind a Cloudflare challenge (HTTP ${status}).`);
  }
  if (status >= 300 && status < 400) {
    const loc = response.headers.get("location") ?? "";
    const m = loc.match(/\/profile\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (m?.[1]) return e("found", "Profile page redirects to a wallet profile.", { wallet: m[1] });
    return e("ambiguous", `Profile page redirected to ${loc || "an unknown location"}.`);
  }
  if (status === 401 || status === 403) return e("blocked", `Profile page access denied (HTTP ${status}).`);
  if (status >= 500) return e("error", `Profile page server error (HTTP ${status}).`);

  const lower = body.toLowerCase();
  const name = escapeRegExp(username.toLowerCase());

  if (status === 200) {
    // Embedded JSON / RSC payload: "username":"name" or \"username\":\"name\"
    const jsonRe = new RegExp(`\\\\?"username\\\\?"\\s*:\\s*\\\\?"${name}\\\\?"`, "i");
    const titleRe = new RegExp(`<title[^>]*>[^<]*@?${name}\\b[^<]*</title>`, "i");
    const ogRe = new RegExp(`property=["']og:title["'][^>]*content=["'][^"']*@?${name}\\b`, "i");
    if (jsonRe.test(body) || titleRe.test(body) || ogRe.test(body)) {
      const wallet = body.match(/\\?"address\\?"\s*:\s*\\?"([1-9A-HJ-NP-Za-km-z]{32,44})\\?"/)?.[1];
      return e("found", "Profile page shows this username.", { wallet });
    }
    if (NOT_FOUND_MARKERS.some((m) => lower.includes(m))) {
      return e("not_found", "Profile page states that the user does not exist.");
    }
    return e("ambiguous", "Profile page loaded but did not show a server-rendered profile.");
  }
  if (status === 404) {
    return e("not_found", "Profile page returned an origin 404.");
  }
  return e("ambiguous", `Unexpected HTTP ${status} from profile page.`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function autoCode(outcome: Evidence["outcome"], detail: string, status: number): Evidence["code"] {
  switch (outcome) {
    case "found":
    case "not_found":
    case "skipped":
      return undefined;
    case "rate_limited":
      return "RATE_LIMITED";
    case "blocked":
      return /cloudflare|challenge/i.test(detail) ? "CLOUDFLARE_BLOCKED" : "ACCESS_DENIED";
    case "error":
      return status >= 500 ? "UPSTREAM_UNAVAILABLE" : "NETWORK_ERROR";
    default:
      return "UNEXPECTED_RESPONSE";
  }
}
