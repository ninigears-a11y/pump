import { describe, expect, it } from "vitest";
import { IpRateLimiter } from "@/lib/ipRateLimit";

describe("IpRateLimiter", () => {
  it("limits per key within a window and resets", () => {
    let t = 0;
    const l = new IpRateLimiter(2, 1000, () => t);
    expect(l.take("a").ok).toBe(true);
    expect(l.take("a").ok).toBe(true);
    expect(l.take("a").ok).toBe(false);
    expect(l.take("b").ok).toBe(true);
    t = 1001;
    expect(l.take("a").ok).toBe(true);
  });
});
