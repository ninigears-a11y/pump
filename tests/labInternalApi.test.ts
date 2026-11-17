import { describe, expect, it, vi } from "vitest";
import { labLookup } from "@/lib/lab/internalApi";
import { CLOUDFLARE_HTML } from "./helpers";

const run = (impl: () => Promise<Response> | Response, where: "browser" | "server" = "server") =>
  labLookup("nom", where, vi.fn(async () => impl()) as unknown as typeof fetch);

describe("lab: internal profile lookup interpretation", () => {
  it("200 matching user -> EXISTS", async () => {
    expect((await run(() => new Response(JSON.stringify({ username: "nom", address: "W" }), { status: 200 }))).result).toBe("EXISTS");
  });
  it("origin 404 JSON -> NOT_FOUND", async () => {
    expect((await run(() => new Response(JSON.stringify({ message: "User not found", statusCode: 404 }), { status: 404 }))).result).toBe("NOT_FOUND");
  });
  it("403 Cloudflare challenge -> UNKNOWN", async () => {
    const r = await run(() => new Response(CLOUDFLARE_HTML, { status: 403, headers: { "cf-mitigated": "challenge" } }));
    expect(r).toMatchObject({ result: "UNKNOWN", status: 403, cfMitigated: "challenge" });
  });
  it("challenge served as 404 -> UNKNOWN (never NOT_FOUND)", async () => {
    expect((await run(() => new Response(CLOUDFLARE_HTML, { status: 404 }))).result).toBe("UNKNOWN");
  });
  it("429 -> UNKNOWN", async () => {
    expect((await run(() => new Response("", { status: 429 }))).result).toBe("UNKNOWN");
  });
  it("browser CORS block (fetch throws) -> UNKNOWN with explanation", async () => {
    const r = await run(() => {
      throw new TypeError("Load failed");
    }, "browser");
    expect(r.result).toBe("UNKNOWN");
    expect(r.why).toMatch(/CORS/);
  });
  it("sends no cookies and no custom identity headers", async () => {
    const f = vi.fn(async () => new Response("", { status: 404 }));
    await labLookup("nom", "browser", f as unknown as typeof fetch);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe("omit");
    expect(Object.keys(init.headers as object)).toEqual(["Accept"]);
  });
});
