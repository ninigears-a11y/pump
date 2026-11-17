/**
 * LAB ONLY — isolated experiment with Pump.fun's internal profile lookup:
 *   GET https://frontend-api-v3.pump.fun/users/{username}
 *
 * Not used by the app's checker. Interpretation reuses the tested strict classifier:
 *   200 + matching user JSON -> EXISTS, origin 404 JSON/empty -> NOT_FOUND,
 *   403 / Cloudflare challenge / CORS block / anything else -> UNKNOWN.
 */
import { classifyApiResponse } from "@/lib/checker/providers/frontendApi";

export const INTERNAL_BASE = "https://frontend-api-v3.pump.fun";
export const LAB_INTERVAL_MS = 2000; // one request at a time, >= 2 s apart
export const LAB_MAX_NAMES = 25;
export const LAB_STOP_AFTER_BLOCKS = 3;

export type LabResult = "EXISTS" | "NOT_FOUND" | "UNKNOWN";

export interface LabRow {
  username: string;
  where: "browser" | "server";
  result: LabResult;
  why: string;
  status?: number;
  cfMitigated?: string | null;
  cfRay?: string | null;
  acao?: string | null;
  contentType?: string | null;
  snippet?: string;
  ms: number;
}

export const internalUrl = (u: string) => `${INTERNAL_BASE}/users/${encodeURIComponent(u)}`;

export function interpret(username: string, res: Response, body: string): Pick<LabRow, "result" | "why" | "status"> {
  const e = classifyApiResponse(username, res, body);
  const result: LabResult = e.outcome === "found" ? "EXISTS" : e.outcome === "not_found" ? "NOT_FOUND" : "UNKNOWN";
  return { result, why: e.detail, status: res.status };
}

/** One plain GET: only Accept (CORS-safelisted), no cookies, no Origin/Referer/User-Agent overrides. */
export async function labLookup(
  username: string,
  where: LabRow["where"],
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<LabRow> {
  const t0 = Date.now();
  try {
    const res = await fetchImpl(internalUrl(username), {
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    return {
      username,
      where,
      ...interpret(username, res, body),
      cfMitigated: res.headers.get("cf-mitigated"),
      cfRay: res.headers.get("cf-ray"),
      acao: res.headers.get("access-control-allow-origin"),
      contentType: res.headers.get("content-type"),
      snippet: body.slice(0, 120).replace(/\s+/g, " "),
      ms: Date.now() - t0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      username,
      where,
      result: "UNKNOWN",
      why:
        where === "browser"
          ? `The browser did not let this page read the response (${msg}). This happens when Pump.fun does not allow other websites (CORS) or a Cloudflare challenge is returned.`
          : `Network error: ${msg}`,
      ms: Date.now() - t0,
    };
  }
}
