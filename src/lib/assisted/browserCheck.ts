/**
 * OPTIONAL automatic in-browser check (experiment). OFF by default.
 *
 * It is only active when NEXT_PUBLIC_BROWSER_CHECK_URL is set at build time to an
 * endpoint template such as `https://example/{username}`. Set it ONLY after proving
 * the endpoint is (1) public and unauthenticated, (2) not behind a bot challenge for
 * normal browsers, (3) allows cross-origin reads (Access-Control-Allow-Origin), and
 * (4) returns the documented `{ "exists_flag": boolean }` contract.
 *
 * The request is a plain cross-origin GET from the user's own browser: no cookies
 * (credentials: "omit"), no spoofed headers. Anything other than a clean boolean
 * answer becomes UNKNOWN.
 */
import type { CheckResult } from "@/lib/checker/types";
import { classifyOfficialResponse } from "@/lib/checker/providers/officialApi";
import { makeDiagnostic } from "@/lib/checker/diagnostics";
import { normalizeUsername } from "@/lib/checker/username";
import { profileUrlFor } from "./manual";

export function browserCheckTemplate(): string | null {
  const t = process.env.NEXT_PUBLIC_BROWSER_CHECK_URL?.trim();
  return t && t.includes("{username}") && /^https:\/\//.test(t) ? t : null;
}

export const browserCheckEnabled = () => browserCheckTemplate() !== null;

export async function checkInBrowser(
  raw: string,
  opts: { signal?: AbortSignal; template?: string | null; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<CheckResult> {
  const username = normalizeUsername(raw);
  const template = opts.template === undefined ? browserCheckTemplate() : opts.template;
  const now = new Date().toISOString();
  const base = { username, profileUrl: profileUrlFor(username), checkedAt: now, evidence: [] as CheckResult["evidence"] };
  const unknown = (detail: string, httpStatus?: number): CheckResult => {
    const d = makeDiagnostic("BROWSER_CHECK_FAILED", { httpStatus, source: "browser" });
    return { ...base, status: "unknown", confidence: "none", method: "none", diagnostic: { ...d, message: `${d.message} ${detail}` }, reason: detail };
  };
  if (!template) return unknown("The browser check is not enabled.");

  const url = template.replace("{username}", encodeURIComponent(username));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000);
  opts.signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { credentials: "omit", cache: "no-store", signal: ctrl.signal });
    const body = await res.text();
    const e = classifyOfficialResponse(res, body, { source: "browser" });
    base.evidence = [{ ...e, url }];
    if (e.outcome === "found") {
      return { ...base, status: "taken", confidence: "medium", method: "browser", verifiedAt: now, reason: "Browser check: profile exists." };
    }
    if (e.outcome === "not_found") {
      return { ...base, status: "available", confidence: "medium", method: "browser", verifiedAt: now, reason: "Browser check: username not reserved." };
    }
    return unknown(e.detail, e.httpStatus);
  } catch (err) {
    // CORS refusals, Cloudflare challenges and network failures all land here in a browser.
    return unknown(ctrl.signal.aborted ? "The request timed out or was cancelled." : "The browser blocked or could not complete the request (CORS / network).");
  } finally {
    clearTimeout(timer);
  }
}
