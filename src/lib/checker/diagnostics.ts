import type { Diagnostic, DiagnosticCode, Evidence } from "./types";

const VERCEL_ENV_FIX =
  "In Vercel open your project → Settings → Environment Variables, set PUMP_API_KEY (Production), then Deployments → ⋯ → Redeploy.";

const CATALOG: Record<DiagnosticCode, Omit<Diagnostic, "code">> = {
  OFFICIAL_API_KEY_MISSING: {
    label: "API key not set",
    message: "The server has no Pump.fun API key, so no authorized check can be made.",
    fix: `Apply for a key at developers.pump.fun (sign in with Pump.fun, request the profiles.read scope). Once approved, create a key. ${VERCEL_ENV_FIX}`,
    blocking: true,
  },
  API_KEY_REQUIRED: {
    label: "API key not sent",
    message: "Pump.fun's API received no key (401 API_KEY_REQUIRED).",
    fix: VERCEL_ENV_FIX,
    blocking: true,
  },
  API_KEY_INVALID: {
    label: "API key invalid",
    message: "Pump.fun rejected the configured key as invalid (401 API_KEY_INVALID).",
    fix: `The key must be the full 57-character value starting with pf_live_, with no quotes, spaces or "Bearer". ${VERCEL_ENV_FIX}`,
    blocking: true,
  },
  API_KEY_REVOKED: {
    label: "API key revoked",
    message: "The configured key has been revoked (403 API_KEY_REVOKED).",
    fix: `Create a new key at developers.pump.fun. ${VERCEL_ENV_FIX}`,
    blocking: true,
  },
  API_ORG_NOT_APPROVED: {
    label: "Not approved yet",
    message: "Your Pump.fun developer application has not been approved yet (API_ORG_NOT_APPROVED).",
    fix: "Wait for approval in the developer console at developers.pump.fun, or email developers@pump.fun.",
    blocking: true,
  },
  API_ORG_SUSPENDED: {
    label: "Org suspended",
    message: "Your Pump.fun developer organisation is suspended (API_ORG_SUSPENDED).",
    fix: "Contact developers@pump.fun with your organisation name and key prefix.",
    blocking: true,
  },
  API_SCOPE_FORBIDDEN: {
    label: "Missing scope",
    message: "The key is not allowed to call the username check (needs the profiles.read scope).",
    fix: "Create a key with the profiles.read scope at developers.pump.fun, or ask developers@pump.fun to add it.",
    blocking: true,
  },
  API_REGION_RESTRICTED: {
    label: "Region blocked",
    message: "Pump.fun refuses requests from the region the server runs in (403 API_REGION_RESTRICTED).",
    fix: "In Vercel open Settings → Functions → Function Region and choose a region where pump.fun is available, then redeploy.",
    blocking: true,
  },
  API_CREDENTIAL_NOT_ALLOWED: {
    label: "Credential refused",
    message: "Pump.fun refused the credential type (400 API_CREDENTIAL_NOT_ALLOWED).",
    fix: "Use an API key from developers.pump.fun, not a pump.fun session token or JWT.",
    blocking: true,
  },
  RATE_LIMITED: {
    label: "Rate limited",
    message: "Pump.fun's rate limit was reached (HTTP 429).",
    fix: "Wait a minute and recheck. In the bulk checker, lower concurrency or raise the delay.",
    blocking: false,
  },
  TIMEOUT: {
    label: "Timed out",
    message: "Pump.fun did not answer in time.",
    fix: "Recheck in a moment.",
    blocking: false,
  },
  NETWORK_ERROR: {
    label: "Network error",
    message: "The server could not connect to Pump.fun.",
    fix: "Recheck in a moment. If it persists, Pump.fun may be down.",
    blocking: false,
  },
  UPSTREAM_UNAVAILABLE: {
    label: "Pump.fun error",
    message: "Pump.fun's API returned a server error (5xx).",
    fix: "Recheck in a moment. Pump.fun's API fails closed while its key store is unavailable.",
    blocking: false,
  },
  CLOUDFLARE_BLOCKED: {
    label: "Cloudflare 403",
    message: "Pump.fun's Cloudflare protection blocked the request (HTTP 403). Public Pump.fun pages cannot be checked from servers.",
    fix: `Use the official API instead: ${VERCEL_ENV_FIX}`,
    blocking: true,
  },
  ACCESS_DENIED: {
    label: "Access denied",
    message: "Pump.fun denied access to the request.",
    fix: "Check the API key and its scopes in the developer console.",
    blocking: true,
  },
  UNEXPECTED_RESPONSE: {
    label: "Unexpected reply",
    message: "Pump.fun returned a response that does not match its documented format.",
    fix: "Recheck later. If it persists, the API may have changed.",
    blocking: false,
  },
  INVALID_USERNAME: {
    label: "Invalid name",
    message: "This is not a valid username, so it was not checked.",
    fix: "Use letters, numbers and underscores only (max 32 characters).",
    blocking: false,
  },
  CANCELLED: {
    label: "Cancelled",
    message: "The check was cancelled before it finished.",
    fix: "Run the check again.",
    blocking: false,
  },
  CHECKER_UNREACHABLE: {
    label: "App offline",
    message: "Your device could not reach this app's server.",
    fix: "Check your connection and try again.",
    blocking: false,
  },
  LOCAL_RATE_LIMIT: {
    label: "Slow down",
    message: "Too many checks were sent to this app in a short time.",
    fix: "Wait a minute; the bulk checker slows down automatically.",
    blocking: false,
  },
};

export function makeDiagnostic(code: DiagnosticCode, extra: Partial<Diagnostic> = {}): Diagnostic {
  return { code, ...CATALOG[code], ...extra };
}

/** Best-effort code for an inconclusive evidence record that lacks one. */
export function codeForEvidence(e: Evidence): DiagnosticCode {
  if (e.code) return e.code;
  switch (e.outcome) {
    case "rate_limited":
      return "RATE_LIMITED";
    case "blocked":
      return "ACCESS_DENIED";
    case "error":
      return /timed out/i.test(e.detail) ? "TIMEOUT" : /cancel/i.test(e.detail) ? "CANCELLED" : "NETWORK_ERROR";
    default:
      return "UNEXPECTED_RESPONSE";
  }
}

export function diagnosticFromEvidence(e: Evidence): Diagnostic {
  return makeDiagnostic(codeForEvidence(e), {
    source: e.source,
    httpStatus: e.httpStatus,
    requestId: e.requestId,
  });
}
