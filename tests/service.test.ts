import { describe, expect, it, vi } from "vitest";
import { UsernameChecker } from "@/lib/checker/service";
import { ResultCache } from "@/lib/checker/cache";
import { cloudflare, empty, html, instantSleep, json, mockFetch, user } from "./helpers";

const make = (fetch: ReturnType<typeof mockFetch>, extra: Partial<ConstructorParameters<typeof UsernameChecker>[0]> = {}) =>
  new UsernameChecker({ fetch, sleep: instantSleep, minIntervalMs: 0, cache: null, ...extra });

describe("UsernameChecker (mocked upstream)", () => {
  it("TAKEN when the API returns the profile; skips extra requests", async () => {
    const fetch = mockFetch({ api: () => json(user("mrnom")) });
    const r = await make(fetch).check("MrNom");
    expect(r).toMatchObject({ username: "mrnom", status: "taken", profileUrl: "https://pump.fun/u/mrnom" });
    expect(r.wallet).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("AVAILABLE (medium) when API returns 404 twice and page is challenged", async () => {
    const fetch = mockFetch({ api: () => json({ message: "Not Found" }, 404), page: () => cloudflare() });
    const r = await make(fetch).check("mrfreshname");
    expect(r.status).toBe("available");
    expect(r.confidence).toBe("medium");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("AVAILABLE (high) when page also returns 404", async () => {
    const fetch = mockFetch({ api: () => empty(404), page: () => html("not found", 404) });
    expect(await make(fetch).check("mrfreshname")).toMatchObject({ status: "available", confidence: "high" });
  });

  it("UNKNOWN in strict mode when page can't confirm", async () => {
    const fetch = mockFetch({ api: () => empty(404), page: () => cloudflare() });
    expect((await make(fetch).check("mrfreshname", { strict: true })).status).toBe("unknown");
  });

  it("UNKNOWN when the API is behind Cloudflare (never available)", async () => {
    const fetch = mockFetch({ api: () => cloudflare(), page: () => cloudflare() });
    const r = await make(fetch).check("mrnom");
    expect(r.status).toBe("unknown");
    expect(r.reason).toMatch(/Cloudflare/);
  });

  it("UNKNOWN when the 404 is a challenge page in disguise", async () => {
    const fetch = mockFetch({ api: () => cloudflare(404), page: () => html("", 404) });
    expect((await make(fetch).check("mrnom")).status).toBe("unknown");
  });

  it("UNKNOWN when the confirmation request disagrees (flaky upstream)", async () => {
    let n = 0;
    const fetch = mockFetch({ api: () => (n++ === 0 ? empty(404) : new Response("", { status: 503 })), page: () => cloudflare() });
    expect((await make(fetch, { retries: 0 }).check("mrnom")).status).toBe("unknown");
  });

  it("TAKEN when confirmation finds the profile (race)", async () => {
    let n = 0;
    const fetch = mockFetch({ api: () => (n++ === 0 ? empty(404) : json(user("mrnom"))), page: () => cloudflare() });
    expect((await make(fetch).check("mrnom")).status).toBe("taken");
  });

  it("retries after 429 and succeeds", async () => {
    let n = 0;
    const fetch = mockFetch({
      api: () => (n++ === 0 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : json(user("mrnom"))),
    });
    const r = await make(fetch, { maxQueueWaitMs: 5_000 }).check("mrnom");
    expect(r.status).toBe("taken");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("UNKNOWN when rate limited persistently", async () => {
    const fetch = mockFetch({ api: () => new Response("", { status: 429 }), page: () => new Response("", { status: 429 }) });
    const r = await make(fetch, { maxQueueWaitMs: 0 }).check("mrnom");
    expect(r.status).toBe("unknown");
    expect(r.evidence[0]?.outcome).toBe("rate_limited");
  });

  it("UNKNOWN on network errors and timeouts", async () => {
    const fetch = mockFetch({
      api: () => {
        throw new TypeError("fetch failed");
      },
      page: () => {
        throw new TypeError("fetch failed");
      },
    });
    const r = await make(fetch).check("mrnom");
    expect(r.status).toBe("unknown");
    expect(r.reason).toMatch(/Network error/);
  });

  it("times out slow upstreams", async () => {
    const fetch = mockFetch({
      api: (_u, init) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
      page: () => cloudflare(),
    });
    const r = await make(fetch, { timeoutMs: 20, retries: 0 }).check("mrnom");
    expect(r.status).toBe("unknown");
    expect(r.evidence[0]?.detail).toMatch(/timed out/i);
  });

  it("does not hit the network for invalid usernames", async () => {
    const fetch = mockFetch({});
    const r = await make(fetch).check("not valid!");
    expect(r.status).toBe("unknown");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caches taken results and bypasses cache with force", async () => {
    const fetch = mockFetch({ api: () => json(user("mrnom")) });
    const c = make(fetch, { cache: new ResultCache() });
    await c.check("mrnom");
    const second = await c.check("mrnom");
    expect(second.cached).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    await c.check("mrnom", { force: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("never caches unknown results", async () => {
    const fetch = mockFetch({ api: () => cloudflare(), page: () => cloudflare() });
    const c = make(fetch, { cache: new ResultCache() });
    await c.check("mrnom");
    await c.check("mrnom");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("dedupes concurrent checks of the same name", async () => {
    const fetch = mockFetch({ api: () => json(user("mrnom")) });
    const c = make(fetch);
    await Promise.all([c.check("mrnom"), c.check("MRNOM"), c.check("@mrnom")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("sends requests to the expected endpoints", async () => {
    const fetch = mockFetch({ api: () => empty(404), page: () => html("", 404) });
    await make(fetch).check("mr_dev");
    const urls = fetch.mock.calls.map((c) => c[0]);
    expect(urls).toContain("https://frontend-api-v3.pump.fun/users/mr_dev");
    expect(urls).toContain("https://pump.fun/u/mr_dev");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
  });

  it("supports swapping providers (modular engine)", async () => {
    const custom = { name: "custom", check: vi.fn(async () => ({ source: "custom", outcome: "found" as const, detail: "custom says taken" })) };
    const c = new UsernameChecker({ apiProvider: custom, pageProvider: null, sleep: instantSleep, minIntervalMs: 0, cache: null });
    expect(await c.check("mrnom")).toMatchObject({ status: "taken", reason: "custom says taken" });
  });
});
