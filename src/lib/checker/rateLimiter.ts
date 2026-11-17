/**
 * Process-wide outbound throttle for requests to Pump.fun.
 *
 * - Enforces a minimum interval between request starts.
 * - Enters a cooldown after a 429 (honouring Retry-After, with exponential
 *   back-off). While cooling down, callers are told to stop instead of
 *   waiting indefinitely (important on serverless platforms with short
 *   execution limits).
 */
export class OutboundThrottle {
  private nextSlot = 0;
  private cooldownUntil = 0;
  private consecutive429 = 0;

  constructor(
    public minIntervalMs: number,
    private readonly maxWaitMs = 8_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Remaining cooldown in ms (0 when not cooling down). */
  cooldownRemaining(): number {
    return Math.max(0, this.cooldownUntil - this.now());
  }

  /**
   * Wait for a slot. Returns false if the wait would exceed maxWaitMs
   * (the caller should report the result as rate limited / unknown).
   */
  async acquire(): Promise<boolean> {
    const t = this.now();
    const start = Math.max(t, this.nextSlot, this.cooldownUntil);
    const wait = start - t;
    if (wait > this.maxWaitMs) return false;
    this.nextSlot = start + this.minIntervalMs;
    if (wait > 0) await this.sleep(wait);
    return true;
  }

  report429(retryAfterSec?: number): void {
    this.consecutive429 += 1;
    const backoff = Math.min(60_000, 2_000 * 2 ** (this.consecutive429 - 1));
    const ms = retryAfterSec !== undefined ? Math.max(retryAfterSec * 1000, 1_000) : backoff;
    this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + ms);
  }

  reportSuccess(): void {
    this.consecutive429 = 0;
  }
}
