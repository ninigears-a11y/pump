import type { CheckStatus, Confidence, Evidence } from "./types";

export interface Verdict {
  status: CheckStatus;
  confidence: Confidence;
  reason: string;
  wallet?: string;
}

export interface VerdictInput {
  /** Primary API evidence (first request). */
  api: Evidence;
  /** Optional second API request used to confirm a not_found. */
  apiConfirm?: Evidence;
  /** Optional public profile page evidence. */
  page?: Evidence;
  /** Require the page to confirm not_found before returning available. */
  strict: boolean;
}

/**
 * Combine evidence into a verdict.
 *
 * Rules (in order):
 *  1. Any source positively identifying the profile  -> TAKEN.
 *  2. AVAILABLE requires the API to return a clean not_found on BOTH the
 *     primary and the confirmation request, and the profile page must not
 *     contradict it. In strict mode the page must also return not_found.
 *  3. Everything else                                -> UNKNOWN.
 *
 * A page `not_found` alone is never enough for AVAILABLE.
 */
export function decideVerdict({ api, apiConfirm, page, strict }: VerdictInput): Verdict {
  const all = [api, apiConfirm, page].filter((x): x is Evidence => !!x);

  const found = all.find((x) => x.outcome === "found");
  if (found) {
    const conflicting = all.some((x) => x.outcome === "not_found");
    return {
      status: "taken",
      confidence: found.source === api.source && !conflicting ? "high" : "medium",
      reason: conflicting
        ? `${found.detail} (Sources disagree; treated as taken to stay safe.)`
        : found.detail,
      wallet: found.wallet ?? all.find((x) => x.wallet)?.wallet,
    };
  }

  const apiClean = api.outcome === "not_found" && apiConfirm?.outcome === "not_found";

  if (apiClean) {
    if (page?.outcome === "not_found") {
      return {
        status: "available",
        confidence: "high",
        reason: "No profile found: the API confirmed twice and the profile page returned not found.",
      };
    }
    if (strict) {
      return {
        status: "unknown",
        confidence: "low",
        reason: `API reports no user, but strict mode needs the profile page to confirm (${page ? page.detail : "page check skipped"}).`,
      };
    }
    return {
      status: "available",
      confidence: "medium",
      reason: `No profile found: the Pump.fun API returned "no user" on two consecutive checks.${
        page ? ` Profile page was inconclusive (${page.outcome}).` : ""
      }`,
    };
  }

  if (api.outcome === "not_found" && apiConfirm && apiConfirm.outcome !== "not_found") {
    return {
      status: "unknown",
      confidence: "low",
      reason: `Confirmation request failed: ${apiConfirm.detail}`,
    };
  }

  if (api.outcome === "not_found" && !apiConfirm) {
    return { status: "unknown", confidence: "low", reason: "Availability not confirmed by a second request." };
  }

  return { status: "unknown", confidence: "low", reason: api.detail };
}
