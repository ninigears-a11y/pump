import type { CheckResult } from "./types";

/** Small TTL cache. Unknown results are never cached. */
export class ResultCache {
  private store = new Map<string, { value: CheckResult; expires: number }>();

  constructor(
    private readonly ttl: { taken: number; available: number } = { taken: 10 * 60_000, available: 2 * 60_000 },
    private readonly maxEntries = 5_000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): CheckResult | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: CheckResult): void {
    if (value.status === "unknown") return;
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    const ttl = value.status === "taken" ? this.ttl.taken : this.ttl.available;
    this.store.set(key, { value, expires: this.now() + ttl });
  }

  clear(): void {
    this.store.clear();
  }
}
