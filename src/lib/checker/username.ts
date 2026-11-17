/**
 * Username normalisation and validation.
 *
 * Pump.fun does not publish its username rules. We accept a conservative
 * character set (letters, digits, underscore). Anything outside it is never
 * sent upstream and is reported as `unknown` with an explanation, so we can
 * never mislabel an unsupported name as available.
 */

export const USERNAME_MIN = 1;
export const USERNAME_MAX = 32;
const USERNAME_RE = /^[a-z0-9_]+$/;

/**
 * Turn raw user input into a canonical username.
 * Accepts `mrnom`, `@mrnom`, ` MrNom `, `pump.fun/profile/mrnom`, `https://pump.fun/profile/mrnom?x=1`
 * (legacy `pump.fun/u/...` links are accepted too).
 */
export function normalizeUsername(raw: string): string {
  let s = (raw ?? "").trim();
  const urlMatch = s.match(/pump\.fun\/(?:u|profile)\/([^/?#\s]+)/i);
  if (urlMatch?.[1]) s = urlMatch[1];
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as-is */
  }
  s = s.replace(/^@+/, "").trim();
  return s.toLowerCase();
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateUsername(username: string): ValidationResult {
  if (username.length < USERNAME_MIN) return { valid: false, error: "Username is empty." };
  if (username.length > USERNAME_MAX)
    return { valid: false, error: `Username is longer than ${USERNAME_MAX} characters.` };
  if (!USERNAME_RE.test(username))
    return {
      valid: false,
      error: "Only letters, numbers and underscores are supported.",
    };
  return { valid: true };
}

/** Base58 strings of wallet length can collide with wallet lookups. */
export function looksLikeWalletAddress(s: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
}

/**
 * Parse a multi-line / comma separated list into unique normalised usernames,
 * preserving first-seen order.
 */
export function parseUsernameList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[\n,;\t]+/)) {
    const u = normalizeUsername(part);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}
