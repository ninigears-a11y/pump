import { describe, expect, it } from "vitest";
import { OutboundThrottle } from "@/lib/checker/rateLimiter";

function clock() {
  let t = 0;
  const slept: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
    slept,
    advance: (ms: number) => (t += ms),
  };
}

describe("OutboundThrottle", () => {
  it("spaces requests by minInterval", async () => {
    const c = clock();
    const th = new OutboundThrottle(300, 10_000, c.now, c.sleep);
    await th.acquire();
    await th.acquire();
    await th.acquire();
    expect(c.slept).toEqual([300, 300]);
  });

  it("honours Retry-After cooldown", async () => {
    const c = clock();
    const th = new OutboundThrottle(0, 10_000, c.now, c.sleep);
    th.report429(5);
    expect(th.cooldownRemaining()).toBe(5000);
    expect(await th.acquire()).toBe(true);
    expect(c.slept).toEqual([5000]);
  });

  it("refuses to wait longer than maxWait", async () => {
    const c = clock();
    const th = new OutboundThrottle(0, 1000, c.now, c.sleep);
    th.report429(30);
    expect(await th.acquire()).toBe(false);
  });

  it("backs off exponentially without Retry-After", () => {
    const c = clock();
    const th = new OutboundThrottle(0, 1000, c.now, c.sleep);
    th.report429();
    expect(th.cooldownRemaining()).toBe(2000);
    th.report429();
    expect(th.cooldownRemaining()).toBe(4000);
    th.reportSuccess();
    c.advance(4000);
    th.report429();
    expect(th.cooldownRemaining()).toBe(2000);
  });
});
