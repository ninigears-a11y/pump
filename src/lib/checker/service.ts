import { ResultCache } from "./cache";
import { FrontendApiProvider, DEFAULT_API_BASE } from "./providers/frontendApi";
import { ProfilePageProvider, DEFAULT_PROFILE_BASE } from "./providers/profilePage";
import { OfficialApiProvider, DEFAULT_OFFICIAL_API_BASE } from "./providers/officialApi";
import { OutboundThrottle } from "./rateLimiter";
import type { CheckOptions, CheckResult, Evidence, EvidenceProvider, FetchLike } from "./types";
import { normalizeUsername, validateUsername } from "./username";
import { decideVerdict } from "./verdict";

export type VerificationMode = "official" | "unofficial";

export interface CheckerConfig {
  fetch?: FetchLike;
  /**
   * Authoritative provider (Pump.fun official Developer API). When it gives a
   * definite answer, no other source is consulted.
   */
  officialProvider?: EvidenceProvider | null;
  /** Use unofficial sources when the official provider is missing or inconclusive. */
  unofficialFallback?: boolean;
  /** Primary provider; must be able to return found / not_found. */
  apiProvider?: EvidenceProvider;
  /** Corroborating provider (set to null to disable). */
  pageProvider?: EvidenceProvider | null;
  profileBase?: string;
  timeoutMs?: number;
  /** Minimum ms between outbound requests per provider. */
  minIntervalMs?: number;
  /** Delay before the confirmation request. */
  confirmDelayMs?: number;
  /** Retries for rate-limit / network errors per provider call. */
  retries?: number;
  /** Max time to wait for a throttle slot before giving up. */
  maxQueueWaitMs?: number;
  cache?: ResultCache | null;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The username checking engine. Providers are pluggable so the verification
 * method can be swapped if Pump.fun changes its infrastructure.
 */
export class UsernameChecker {
  private readonly fetchImpl: FetchLike;
  private readonly official: EvidenceProvider | null;
  private readonly fallback: boolean;
  private readonly api: EvidenceProvider;
  private readonly page: EvidenceProvider | null;
  private readonly profileBase: string;
  private readonly timeoutMs: number;
  private readonly confirmDelayMs: number;
  private readonly retries: number;
  private readonly cache: ResultCache | null;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly throttles = new Map<string, OutboundThrottle>();
  private readonly minIntervalMs: number;
  private readonly maxQueueWaitMs: number;
  private readonly now: () => number;
  private readonly inflight = new Map<string, Promise<CheckResult>>();

  constructor(cfg: CheckerConfig = {}) {
    this.fetchImpl = cfg.fetch ?? ((input, init) => fetch(input, init));
    this.official = cfg.officialProvider ?? null;
    this.fallback = cfg.unofficialFallback ?? true;
    this.api = cfg.apiProvider ?? new FrontendApiProvider();
    this.page = cfg.pageProvider === undefined ? new ProfilePageProvider() : cfg.pageProvider;
    this.profileBase = (cfg.profileBase ?? DEFAULT_PROFILE_BASE).replace(/\/+$/, "");
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
    this.confirmDelayMs = cfg.confirmDelayMs ?? 400;
    this.retries = cfg.retries ?? 1;
    this.cache = cfg.cache === undefined ? new ResultCache() : cfg.cache;
    this.sleep = cfg.sleep ?? defaultSleep;
    this.minIntervalMs = cfg.minIntervalMs ?? 400;
    this.maxQueueWaitMs = cfg.maxQueueWaitMs ?? 8_000;
    this.now = cfg.now ?? Date.now;
  }

  get mode(): VerificationMode {
    return this.official ? "official" : "unofficial";
  }

  profileUrl(username: string): string {
    return `${this.profileBase}/${encodeURIComponent(username)}`;
  }

  async check(raw: string, options: CheckOptions = {}): Promise<CheckResult> {
    const username = normalizeUsername(raw);
    const key = `${username}|${options.strict ? "s" : "n"}`;
    if (!options.force) {
      const cached = this.cache?.get(key);
      if (cached) return { ...cached, cached: true };
      const pending = this.inflight.get(key);
      if (pending) return pending;
    }
    const p = this.run(username, options).finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    const result = await p;
    this.cache?.set(key, result);
    return result;
  }

  private async run(username: string, options: CheckOptions): Promise<CheckResult> {
    const base = {
      username,
      profileUrl: this.profileUrl(username),
    };
    const validation = validateUsername(username);
    if (!validation.valid) {
      return {
        ...base,
        status: "unknown",
        confidence: "low",
        reason: `Not checked: ${validation.error}`,
        checkedAt: new Date(this.now()).toISOString(),
        evidence: [],
      };
    }

    const evidence: Evidence[] = [];
    const finish = (v: ReturnType<typeof decideVerdict>): CheckResult => ({
      ...base,
      status: v.status,
      confidence: v.confidence,
      reason: v.reason,
      wallet: v.wallet,
      checkedAt: new Date(this.now()).toISOString(),
      evidence,
    });

    let official: Evidence | undefined;
    if (this.official) {
      official = await this.runProvider(this.official, username, options.signal);
      evidence.push(official);
      const decisive = official.outcome === "found" || official.outcome === "not_found";
      if (decisive || !this.fallback) {
        return finish(decideVerdict({ official, strict: !!options.strict }));
      }
    }

    const api = await this.runProvider(this.api, username, options.signal);
    evidence.push(api);

    let apiConfirm: Evidence | undefined;
    let page: Evidence | undefined;

    if (api.outcome !== "found") {
      if (api.outcome === "not_found") {
        await this.sleep(this.confirmDelayMs);
        apiConfirm = await this.runProvider(this.api, username, options.signal);
        evidence.push({ ...apiConfirm, source: `${apiConfirm.source} (confirm)` });
      }
      if (this.page) {
        page = await this.runProvider(this.page, username, options.signal);
        evidence.push(page);
      }
    }

    return finish(decideVerdict({ official, api, apiConfirm, page, strict: !!options.strict }));
  }

  private throttleFor(name: string): OutboundThrottle {
    let t = this.throttles.get(name);
    if (!t) {
      t = new OutboundThrottle(this.minIntervalMs, this.maxQueueWaitMs, this.now, this.sleep);
      this.throttles.set(name, t);
    }
    return t;
  }

  private async runProvider(provider: EvidenceProvider, username: string, signal?: AbortSignal): Promise<Evidence> {
    const throttle = this.throttleFor(provider.name);
    let last: Evidence | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (signal?.aborted) {
        return { source: provider.name, outcome: "error", detail: "Check was cancelled." };
      }
      const acquired = await throttle.acquire();
      if (!acquired) {
        return (
          last ?? {
            source: provider.name,
            outcome: "rate_limited",
            detail: `Cooling down after rate limiting (${Math.ceil(throttle.cooldownRemaining() / 1000)}s left).`,
          }
        );
      }
      last = await provider.check(username, { fetch: this.fetchImpl, timeoutMs: this.timeoutMs, signal });
      if (last.outcome === "rate_limited") {
        throttle.report429(last.retryAfterSec);
        continue;
      }
      if (last.outcome === "error") {
        await this.sleep(500 * (attempt + 1));
        continue;
      }
      throttle.reportSuccess();
      return last;
    }
    return last!;
  }
}

export function checkerFromEnv(env: Record<string, string | undefined> = process.env): UsernameChecker {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  const profileBase = env.PUMP_PROFILE_BASE || DEFAULT_PROFILE_BASE;
  const apiKey = env.PUMP_API_KEY?.trim();
  return new UsernameChecker({
    officialProvider: apiKey
      ? new OfficialApiProvider(apiKey, env.PUMP_OFFICIAL_API_BASE || DEFAULT_OFFICIAL_API_BASE)
      : null,
    unofficialFallback: env.PUMP_UNOFFICIAL_FALLBACK !== "0",
    apiProvider: new FrontendApiProvider(env.PUMP_API_BASE || DEFAULT_API_BASE),
    pageProvider: env.PUMP_DISABLE_PAGE_CHECK === "1" ? null : new ProfilePageProvider(profileBase),
    profileBase,
    timeoutMs: num(env.PUMP_REQUEST_TIMEOUT_MS, 10_000),
    minIntervalMs: num(env.PUMP_MIN_REQUEST_INTERVAL_MS, 400),
  });
}

let singleton: UsernameChecker | undefined;
export function getChecker(): UsernameChecker {
  singleton ??= checkerFromEnv();
  return singleton;
}
