import { describe, expect, it } from "vitest";
import { UsernameChecker } from "@/lib/checker/service";
import { OfficialApiProvider } from "@/lib/checker/providers/officialApi";
import { cloudflare, empty, instantSleep, json, mockFetch } from "./helpers";

const make = (fetch: ReturnType<typeof mockFetch>, extra = {}) =>
  new UsernameChecker({
    fetch,
    officialProvider: new OfficialApiProvider("pf_live_test"),
    unofficialFallback: false,
    sleep: instantSleep,
    minIntervalMs: 0,
    cache: null,
    retries: 0,
    ...extra,
  });

describe("diagnostics on UNKNOWN results", () => {
  it.each([
    ["API_KEY_INVALID", () => json({ error: "API_KEY_INVALID" }, 401), true],
    ["API_KEY_REVOKED", () => json({ error: "API_KEY_REVOKED" }, 403), true],
    ["API_ORG_NOT_APPROVED", () => json({ error: "API_ORG_NOT_APPROVED" }, 403), true],
    ["API_SCOPE_FORBIDDEN", () => json({ error: "API_SCOPE_FORBIDDEN" }, 403), true],
    ["API_REGION_RESTRICTED", () => json({ error: "API_REGION_RESTRICTED" }, 403), true],
    ["RATE_LIMITED", () => json({ error: "API_KEY_RATE_LIMITED" }, 429), false],
    ["UPSTREAM_UNAVAILABLE", () => empty(503), false],
    ["CLOUDFLARE_BLOCKED", () => cloudflare(403), true],
    ["UNEXPECTED_RESPONSE", () => json({ something: 1 }), false],
  ] as const)("%s", async (code, handler, blocking) => {
    const r = await make(mockFetch({ official: handler }), { maxQueueWaitMs: 0 }).check("nom");
    expect(r.status).toBe("unknown");
    expect(r.confidence).toBe("none");
    expect(r.verifiedAt).toBeUndefined();
    expect(r.method).toBe("none");
    expect(r.diagnostic).toMatchObject({ code, blocking });
    expect(r.diagnostic!.fix.length).toBeGreaterThan(10);
  });

  it("TIMEOUT", async () => {
    const fetch = mockFetch({
      official: (_u, init) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))),
    });
    const r = await make(fetch, { timeoutMs: 20 }).check("nom");
    expect(r.diagnostic?.code).toBe("TIMEOUT");
  });

  it("NETWORK_ERROR", async () => {
    const r = await make(
      mockFetch({
        official: () => {
          throw new TypeError("fetch failed");
        },
      }),
    ).check("nom");
    expect(r.diagnostic?.code).toBe("NETWORK_ERROR");
  });

  it("INVALID_USERNAME makes no request", async () => {
    const fetch = mockFetch({});
    const r = await make(fetch).check("bad name!");
    expect(r.diagnostic?.code).toBe("INVALID_USERNAME");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("verified results carry verifiedAt and no diagnostic", async () => {
    const r = await make(mockFetch({ official: () => json({ exists_flag: false }) })).check("zzfresh");
    expect(r).toMatchObject({ status: "available", method: "official-api" });
    expect(r.verifiedAt).toBe(r.checkedAt);
    expect(r.diagnostic).toBeUndefined();
  });

  it("probe reports ok / diagnostic", async () => {
    expect((await make(mockFetch({ official: () => json({ exists_flag: true }) })).probe()).ok).toBe(true);
    const bad = await make(mockFetch({ official: () => json({ error: "API_KEY_INVALID" }, 401) })).probe();
    expect(bad).toMatchObject({ ok: false, diagnostic: { code: "API_KEY_INVALID" } });
    const none = await new UsernameChecker({ unofficialFallback: false }).probe();
    expect(none.diagnostic?.code).toBe("OFFICIAL_API_KEY_MISSING");
  });
});
