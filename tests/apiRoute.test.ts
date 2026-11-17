/**
 * Integration test: Next.js route handler -> checker engine -> mocked Pump.fun.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { cloudflare, empty, html, json, user } from "./helpers";

let POST: (req: NextRequest) => Promise<Response>;
let GET: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  process.env.PUMP_MIN_REQUEST_INTERVAL_MS = "0";
  process.env.CHECK_RATE_LIMIT_PER_MINUTE = "1000";
  delete process.env.HISTORY_DB_PATH;
  ({ POST, GET } = await import("@/app/api/check/route"));
});

afterEach(() => vi.unstubAllGlobals());

function stubUpstream(api: () => Response, page: () => Response = () => cloudflare()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (String(url).includes("frontend-api") ? api() : page())),
  );
}

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/check", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("/api/check", () => {
  it("returns taken for an existing profile", async () => {
    stubUpstream(() => json(user("routetaken")));
    const res = await post({ username: "routetaken" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ username: "routetaken", status: "taken" });
  });

  it("returns available after clean double 404", async () => {
    stubUpstream(() => empty(404), () => html("", 404));
    const body = await (await post({ username: "routefree" })).json();
    expect(body).toMatchObject({ status: "available", confidence: "high" });
  });

  it("returns unknown when Cloudflare blocks", async () => {
    stubUpstream(() => cloudflare());
    const body = await (await post({ username: "routeblocked" })).json();
    expect(body.status).toBe("unknown");
  });

  it("supports GET with query params", async () => {
    stubUpstream(() => json(user("routeget")));
    const res = await GET(new NextRequest("http://localhost/api/check?username=routeget"));
    expect((await res.json()).status).toBe("taken");
  });

  it("validates input", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ username: "x".repeat(500) })).status).toBe(400);
    const bad = await POST(new NextRequest("http://localhost/api/check", { method: "POST", body: "not json" }));
    expect(bad.status).toBe(400);
  });
});
