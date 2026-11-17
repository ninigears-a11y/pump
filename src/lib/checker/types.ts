/**
 * Shared types for the Pump.fun username checking engine.
 *
 * The engine is evidence-based: each provider inspects one public source and
 * reports an `Evidence` record. The verdict logic (see `verdict.ts`) combines
 * evidence into a final status and NEVER reports `available` unless the
 * evidence positively supports it.
 */

export type CheckStatus = "available" | "taken" | "unknown";

/** "none" is used for UNKNOWN: nothing was verified, so there is no confidence. */
export type Confidence = "high" | "medium" | "low" | "none";

/** Which verification method produced a definite answer. */
export type VerificationMethod = "official-api" | "unofficial" | "none";

/** Machine-readable reason a username could not be verified. See diagnostics.ts. */
export type DiagnosticCode =
  | "OFFICIAL_API_KEY_MISSING"
  | "API_KEY_REQUIRED"
  | "API_KEY_INVALID"
  | "API_KEY_REVOKED"
  | "API_ORG_NOT_APPROVED"
  | "API_ORG_SUSPENDED"
  | "API_SCOPE_FORBIDDEN"
  | "API_REGION_RESTRICTED"
  | "API_CREDENTIAL_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "UPSTREAM_UNAVAILABLE"
  | "CLOUDFLARE_BLOCKED"
  | "ACCESS_DENIED"
  | "UNEXPECTED_RESPONSE"
  | "INVALID_USERNAME"
  | "CANCELLED"
  | "CHECKER_UNREACHABLE"
  | "LOCAL_RATE_LIMIT";

export interface Diagnostic {
  code: DiagnosticCode;
  /** Short label for compact UI (e.g. a table cell). */
  label: string;
  /** What went wrong, in plain words. */
  message: string;
  /** What to do about it. */
  fix: string;
  /** True when every check will fail the same way until configuration changes. */
  blocking: boolean;
  source?: string;
  httpStatus?: number;
  /** Pump.fun's X-Request-Id, useful for support tickets. */
  requestId?: string;
}

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
  /** Machine-readable failure code (set on inconclusive outcomes). */
  code?: DiagnosticCode;
  requestId?: string;
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
  /** When the check was attempted. */
  checkedAt: string;
  /** When the status was actually verified. Only set for available/taken. */
  verifiedAt?: string;
  method: VerificationMethod;
  /** Why the username could not be verified. Only set for unknown. */
  diagnostic?: Diagnostic;
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
