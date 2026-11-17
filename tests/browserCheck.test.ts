import { describe, expect, it, vi } from "vitest";
import { browserCheckEnabled, checkInBrowser } from "@/lib/assisted/browserCheck";

const T = "https://public.example/users/{username}/exists";

describe("optional browser check (experiment)", () => {
  it("is OFF by default (no proven public endpoint)", () => {
    delete process.env.NEXT_PUBLIC_BROWSER_CHECK_URL;
    expect(browserCheckEnabled()).toBe(false);
  });

  it("returns UNKNOWN when not enabled — makes no request", async () => {
    const f = vi.fn();
    const r = await checkInBrowser("nom", { template: null, fetchImpl: f as unknown as typeof fetch });
    expect(r.status).toBe("unknown");
    expect(f).not.toHaveBeenCalled();
  });

  it("sends a plain GET without cookies and maps exists_flag", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ exists_flag: true }), { status: 200 }));
    const r = await checkInBrowser("nom", { template: T, fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ status: "taken", method: "browser" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://public.example/users/nom/exists");
    expect(init.credentials).toBe("omit");
    expect(init.headers).toBeUndefined();
  });

  it("exists_flag false -> AVAILABLE via browser", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ exists_flag: false }), { status: 200 }));
    expect((await checkInBrowser("zz", { template: T, fetchImpl: f as unknown as typeof fetch })).status).toBe("available");
  });

  it.each([
    ["CORS / network failure", async () => {
      throw new TypeError("Load failed");
    }],
    ["Cloudflare challenge", async () => new Response("<title>Just a moment...</title>", { status: 403, headers: { "cf-mitigated": "challenge" } })],
    ["401 auth", async () => new Response(JSON.stringify({ error: "API_KEY_REQUIRED" }), { status: 401 })],
    ["429", async () => new Response("", { status: 429 })],
    ["odd shape", async () => new Response(JSON.stringify({ ok: true }), { status: 200 })],
  ])("%s -> UNKNOWN", async (_n, impl) => {
    const r = await checkInBrowser("nom", { template: T, fetchImpl: vi.fn(impl) as unknown as typeof fetch });
    expect(r.status).toBe("unknown");
    expect(r.diagnostic?.code).toBe("BROWSER_CHECK_FAILED");
  });
});
