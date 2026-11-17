/** Fixed-window in-memory limiter for our own API (per server instance). */
export class IpRateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string): { ok: boolean; retryAfterSec: number } {
    const t = this.now();
    let h = this.hits.get(key);
    if (!h || h.reset <= t) {
      h = { count: 0, reset: t + this.windowMs };
      this.hits.set(key, h);
      if (this.hits.size > 10_000) this.prune(t);
    }
    h.count++;
    return { ok: h.count <= this.limit, retryAfterSec: Math.ceil((h.reset - t) / 1000) };
  }

  private prune(t: number) {
    for (const [k, v] of this.hits) if (v.reset <= t) this.hits.delete(k);
  }
}
