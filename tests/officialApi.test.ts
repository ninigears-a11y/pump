import { describe, expect, it } from "vitest";
import { classifyOfficialResponse, OfficialApiProvider } from "@/lib/checker/providers/officialApi";
import { UsernameChecker, checkerFromEnv } from "@/lib/checker/service";
import { cloudflare, empty, instantSleep, json, mockFetch, user } from "./helpers";

const classify = async (res: Response) => classifyOfficialResponse(res, await res.clone().text());

describe("classifyOfficialResponse (documented exists_flag contract)", () => {
  it("exists_flag true -> found", async () => {
    expect((await classify(json({ exists_flag: true }))).outcome).toBe("found");
  });
  it("exists_flag false -> not_found", async () => {
    expect((await classify(json({ exists_flag: false }))).outcome).toBe("not_found");
  });
  it.each(["API_KEY_REQUIRED", "API_KEY_INVALID", "API_KEY_REVOKED", "API_ORG_NOT_APPROVED", "API_SCOPE_FORBIDDEN"])(
    "%s -> blocked (never available)",
    async (code) => {
      const e = await classify(json({ statusCode: 401, error: code, message: "x" }, code === "API_SCOPE_FORBIDDEN" ? 403 : 401));
      expect(e.outcome).toBe("blocked");
      expect(e.detail).toContain(code);
    },
  );
  it("region restriction -> blocked", async () => {
    expect((await classify(json({ error: "API_REGION_RESTRICTED" }, 403))).outcome).toBe("blocked");
  });
  it("429 -> rate_limited with Retry-After", async () => {
    const e = await classify(json({ error: "API_KEY_RATE_LIMITED" }, 429, { "retry-after": "3" }));
    expect(e).toMatchObject({ outcome: "rate_limited", retryAfterSec: 3 });
  });
  it("503 -> error", async () => {
    expect((await classify(json({ statusCode: 503, retryAfterSeconds: 5 }, 503))).outcome).toBe("error");
  });
  it.each([["{}"], ['{"exists_flag":"false"}'], ["[]"], ["not json"], [""]])("ambiguous on %s", async (body) => {
    expect((await classify(new Response(body, { status: 200 }))).outcome).toBe("ambiguous");
  });
});

describe("OfficialApiProvider request", () => {
  it("calls the documented URL with the key in the Authorization header only", async () => {
    const fetch = mockFetch({ official: () => json({ exists_flag: false }) });
    const p = new OfficialApiProvider("pf_live_secret");
    await p.check("mr_dev", { fetch, timeoutMs: 1000 });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.pump.fun/v1/users/username-exists/mr_dev");
    expect(url).not.toContain("pf_live_secret");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer pf_live_secret");
  });
});

describe("UsernameChecker with official API", () => {
  const make = (fetch: ReturnType<typeof mockFetch>, fallback = true) =>
    new UsernameChecker({
      fetch,
      officialProvider: new OfficialApiProvider("pf_live_test"),
      unofficialFallback: fallback,
      sleep: instantSleep,
      minIntervalMs: 0,
      cache: null,
    });

  it("AVAILABLE (high) from exists_flag false with a single request", async () => {
    const fetch = mockFetch({ official: () => json({ exists_flag: false }) });
    const r = await make(fetch).check("mrfresh");
    expect(r).toMatchObject({ status: "available", confidence: "high", profileUrl: "https://pump.fun/profile/mrfresh" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("TAKEN (high) from exists_flag true", async () => {
    const fetch = mockFetch({ official: () => json({ exists_flag: true }) });
    expect(await make(fetch).check("mrnom")).toMatchObject({ status: "taken", confidence: "high" });
  });

  it("falls back to unofficial sources when the key is rejected", async () => {
    const fetch = mockFetch({
      official: () => json({ error: "API_ORG_NOT_APPROVED" }, 403),
      api: () => json(user("mrnom")),
    });
    const r = await make(fetch).check("mrnom");
    expect(r.status).toBe("taken");
    expect(r.evidence.map((e) => e.source)).toEqual(["pump-official-api", "pump-frontend-api"]);
  });

  it("UNKNOWN when the key is rejected and the fallback is blocked", async () => {
    const fetch = mockFetch({
      official: () => json({ error: "API_KEY_INVALID" }, 401),
      api: () => cloudflare(),
      page: () => cloudflare(),
    });
    const r = await make(fetch).check("mrnom");
    expect(r.status).toBe("unknown");
    expect(r.reason).toContain("API_KEY_INVALID");
  });

  it("UNKNOWN without fallback when the official API fails", async () => {
    const fetch = mockFetch({ official: () => empty(503) });
    expect((await make(fetch, false).check("mrnom")).status).toBe("unknown");
  });

  it("a failed profile-page request alone never yields AVAILABLE", async () => {
    const fetch = mockFetch({
      official: () => json({ error: "API_KEY_INVALID" }, 401),
      api: () => cloudflare(),
      page: () => new Response("<html>This page could not be found.</html>", { status: 404 }),
    });
    expect((await make(fetch).check("mrnom")).status).toBe("unknown");
  });
});

describe("checkerFromEnv", () => {
  it("uses the official API only when PUMP_API_KEY is set", () => {
    expect(checkerFromEnv({}).mode).toBe("unofficial");
    expect(checkerFromEnv({ PUMP_API_KEY: "  " }).mode).toBe("unofficial");
    expect(checkerFromEnv({ PUMP_API_KEY: "pf_live_x" }).mode).toBe("official");
  });
  it("defaults profile URLs to /profile/", () => {
    expect(checkerFromEnv({}).profileUrl("mrdevsol")).toBe("https://pump.fun/profile/mrdevsol");
  });
});
