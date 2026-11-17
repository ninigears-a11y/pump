/**
 * Shared types for the Pump.fun username checking engine.
 *
 * The engine is evidence-based: each provider inspects one public source and
 * reports an `Evidence` record. The verdict logic (see `verdict.ts`) combines
 * evidence into a final status and NEVER reports `available` unless the
 * evidence positively supports it.
 */

export type CheckStatus = "available" | "taken" | "unknown";

export type Confidence = "high" | "medium" | "low";

/** What a single source told us about a username. */
export type EvidenceOutcome =
  /** The source positively identified an existing profile with this username. */
  | "found"
  /** The source gave a clean, well-formed "no such user" response. */
  | "not_found"
  /** Cloudflare / WAF challenge, CAPTCHA or auth wall. We do not bypass these. */
  | "blocked"
  /** HTTP 429 or equivalent. */
  | "rate_limited"
  /** Network failure, timeout or 5xx. */
  | "error"
  /** A response we could not interpret confidently. */
  | "ambiguous"
  /** Provider not run (e.g. disabled or short-circuited). */
  | "skipped";

export interface Evidence {
  source: string;
  outcome: EvidenceOutcome;
  httpStatus?: number;
  detail: string;
  /** Wallet address attached to the profile, if the source exposed it. */
  wallet?: string;
  /** Seconds to wait before retrying, when the source sent Retry-After. */
  retryAfterSec?: number;
  url?: string;
  durationMs?: number;
}

export interface CheckResult {
  username: string;
  status: CheckStatus;
  confidence: Confidence;
  /** Human-readable explanation of the verdict. */
  reason: string;
  profileUrl: string;
  checkedAt: string;
  wallet?: string;
  evidence: Evidence[];
  cached?: boolean;
}

export interface CheckOptions {
  /** Bypass the in-memory cache. */
  force?: boolean;
  /**
   * Strict mode: require the public profile page to independently confirm
   * that no profile exists before reporting `available`.
   */
  strict?: boolean;
  signal?: AbortSignal;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** A source of evidence. Implement this to add/replace verification methods. */
export interface EvidenceProvider {
  readonly name: string;
  check(username: string, ctx: ProviderContext): Promise<Evidence>;
}

export interface ProviderContext {
  fetch: FetchLike;
  timeoutMs: number;
  signal?: AbortSignal;
}
