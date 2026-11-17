/**
 * Integration: Next.js route handlers -> checker engine -> mocked Pump.fun.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cloudflare, json } from "./helpers";

type Handler = (req: NextRequest) => Promise<Response>;

async function loadRoutes(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of ["PUMP_API_KEY", "PUMP_UNOFFICIAL_FALLBACK", "HISTORY_DB_PATH"]) delete process.env[k];
  Object.assign(process.env, { PUMP_MIN_REQUEST_INTERVAL_MS: "0", CHECK_RATE_LIMIT_PER_MINUTE: "1000", ...env });
  const check = (await import("@/app/api/check/route")) as { POST: Handler; GET: Handler };
  const health = (await import("@/app/api/health/route")) as { GET: Handler };
  return { POST: check.POST, GET: check.GET, HEALTH: health.GET };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PUMP_API_KEY;
});

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => handler(String(url), init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const post = (POST: Handler, body: unknown) =>
  POST(new NextRequest("http://localhost/api/check", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("/api/check with PUMP_API_KEY (official API)", () => {
  it("TAKEN from exists_flag true, with verifiedAt and method", async () => {
    const { POST } = await loadRoutes({ PUMP_API_KEY: "pf_live_test" });
    const fetch = stubFetch(() => json({ exists_flag: true }));
    const body = await (await post(POST, { username: "nom" })).json();
    expect(body).toMatchObject({ status: "taken", confidence: "high", method: "official-api", profileUrl: "https://pump.fun/profile/nom" });
    expect(body.verifiedAt).toBe(body.checkedAt);
    expect(fetch.mock.calls[0]![0]).toBe("https://api.pump.fun/v1/users/username-exists/nom");
  });

  it("AVAILABLE from exists_flag false", async () => {
    const { GET } = await loadRoutes({ PUMP_API_KEY: "pf_live_test" });
    stubFetch(() => json({ exists_flag: false }));
    const body = await (await GET(new NextRequest("http://localhost/api/check?username=zzfresh"))).json();
    expect(body).toMatchObject({ status: "available", method: "official-api" });
  });

  it("UNKNOWN with API_KEY_INVALID diagnostic (no verifiedAt, no confidence)", async () => {
    const { POST } = await loadRoutes({ PUMP_API_KEY: "pf_live_bad" });
    stubFetch(() => json({ statusCode: 401, error: "API_KEY_INVALID" }, 401, { "x-request-id": "req-123" }));
    const body = await (await post(POST, { username: "neo" })).json();
    expect(body.status).toBe("unknown");
    expect(body.confidence).toBe("none");
    expect(body.verifiedAt).toBeUndefined();
    expect(body.diagnostic).toMatchObject({ code: "API_KEY_INVALID", blocking: true, httpStatus: 401, requestId: "req-123" });
  });

  it("UNKNOWN with CLOUDFLARE_BLOCKED on a 403 challenge", async () => {
    const { POST } = await loadRoutes({ PUMP_API_KEY: "pf_live_test" });
    stubFetch(() => cloudflare(403));
    const body = await (await post(POST, { username: "zen" })).json();
    expect(body.status).toBe("unknown");
    expect(body.diagnostic.code).toBe("CLOUDFLARE_BLOCKED");
  });

  it("UNKNOWN with NETWORK_ERROR when Pump.fun is unreachable", async () => {
    const { POST } = await loadRoutes({ PUMP_API_KEY: "pf_live_test" });
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    const body = await (await post(POST, { username: "vex" })).json();
    expect(body).toMatchObject({ status: "unknown", diagnostic: { code: "NETWORK_ERROR" } });
  });
});

describe("/api/check without a key", () => {
  it("UNKNOWN OFFICIAL_API_KEY_MISSING and makes NO outbound request", async () => {
    const { POST } = await loadRoutes({});
    const fetch = stubFetch(() => json({}));
    const body = await (await post(POST, { username: "nom" })).json();
    expect(body).toMatchObject({ status: "unknown", confidence: "none", method: "none", diagnostic: { code: "OFFICIAL_API_KEY_MISSING", blocking: true } });
    expect(body.verifiedAt).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("validates input", async () => {
    const { POST } = await loadRoutes({});
    expect((await post(POST, {})).status).toBe(400);
    expect((await post(POST, { username: "x".repeat(500) })).status).toBe(400);
  });
});

describe("/api/health", () => {
  it("reports unconfigured and never leaks the key", async () => {
    const { HEALTH } = await loadRoutes({});
    const body = await (await HEALTH(new NextRequest("http://localhost/api/health?probe=1"))).json();
    expect(body).toMatchObject({ verification: "unconfigured", probe: { ok: false, diagnostic: { code: "OFFICIAL_API_KEY_MISSING" } } });
  });

  it("probe ok with a working key; key not in response", async () => {
    const { HEALTH } = await loadRoutes({ PUMP_API_KEY: "pf_live_secret_value" });
    stubFetch(() => json({ exists_flag: true }));
    const res = await HEALTH(new NextRequest("http://localhost/api/health?probe=1"));
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ verification: "official", probe: { ok: true } });
    expect(text).not.toContain("pf_live_secret_value");
  });

  it("probe surfaces the diagnostic for a rejected key", async () => {
    const { HEALTH } = await loadRoutes({ PUMP_API_KEY: "pf_live_x" });
    stubFetch(() => json({ error: "API_ORG_NOT_APPROVED" }, 403));
    const body = await (await HEALTH(new NextRequest("http://localhost/api/health?probe=1"))).json();
    expect(body.probe).toMatchObject({ ok: false, diagnostic: { code: "API_ORG_NOT_APPROVED" } });
  });
});
