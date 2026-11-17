import { describe, expect, it } from "vitest";
import { classifyApiResponse } from "@/lib/checker/providers/frontendApi";
import { CLOUDFLARE_HTML, user } from "./helpers";

const classify = async (username: string, res: Response) => classifyApiResponse(username, res, await res.clone().text());

describe("classifyApiResponse", () => {
  it("found: 200 with matching username", async () => {
    const e = await classify("mrnom", new Response(JSON.stringify(user("MrNom")), { status: 200 }));
    expect(e.outcome).toBe("found");
    expect(e.wallet).toMatch(/^7xKX/);
  });

  it("not_found: JSON 404", async () => {
    const e = await classify("mrnom", new Response(JSON.stringify({ message: "User not found", statusCode: 404 }), { status: 404 }));
    expect(e.outcome).toBe("not_found");
  });

  it("not_found: empty 404 and empty 200", async () => {
    expect((await classify("a", new Response("", { status: 404 }))).outcome).toBe("not_found");
    expect((await classify("a", new Response("", { status: 200 }))).outcome).toBe("not_found");
    expect((await classify("a", new Response("null", { status: 200 }))).outcome).toBe("not_found");
  });

  it("does NOT treat a missing route (NestJS 'Cannot GET') as not_found", async () => {
    const res = new Response(JSON.stringify({ message: "Cannot GET /users/mrnom", error: "Not Found", statusCode: 404 }), { status: 404 });
    expect((await classify("mrnom", res)).outcome).toBe("ambiguous");
  });

  it("does NOT treat an HTML 404 as not_found", async () => {
    const res = new Response("<html><body>404</body></html>", { status: 404, headers: { "content-type": "text/html" } });
    expect((await classify("mrnom", res)).outcome).toBe("ambiguous");
  });

  it("blocked: Cloudflare challenge (403, header)", async () => {
    const res = new Response(CLOUDFLARE_HTML, { status: 403, headers: { "cf-mitigated": "challenge" } });
    expect((await classify("mrnom", res)).outcome).toBe("blocked");
  });

  it("blocked: Cloudflare challenge served as 404 (markers only)", async () => {
    expect((await classify("mrnom", new Response(CLOUDFLARE_HTML, { status: 404 }))).outcome).toBe("blocked");
  });

  it("blocked: challenge page served with 200", async () => {
    expect((await classify("mrnom", new Response(CLOUDFLARE_HTML, { status: 200 }))).outcome).toBe("blocked");
  });

  it("blocked: 401 auth wall", async () => {
    expect((await classify("mrnom", new Response("{}", { status: 401 }))).outcome).toBe("blocked");
  });

  it("rate_limited with Retry-After", async () => {
    const e = await classify("mrnom", new Response("", { status: 429, headers: { "retry-after": "7" } }));
    expect(e.outcome).toBe("rate_limited");
    expect(e.retryAfterSec).toBe(7);
  });

  it("error on 5xx", async () => {
    expect((await classify("mrnom", new Response("", { status: 502 }))).outcome).toBe("error");
  });

  it("ambiguous on redirect", async () => {
    const res = new Response(null, { status: 302, headers: { location: "/login" } });
    expect((await classify("mrnom", res)).outcome).toBe("ambiguous");
  });

  it("ambiguous when a different user comes back", async () => {
    expect((await classify("mrnom", new Response(JSON.stringify(user("someoneelse")), { status: 200 }))).outcome).toBe("ambiguous");
  });

  it("ambiguous when a record has no username", async () => {
    expect((await classify("mrnom", new Response(JSON.stringify({ address: "abc" }), { status: 200 }))).outcome).toBe("ambiguous");
  });

  it("ambiguous on malformed JSON / arrays", async () => {
    expect((await classify("mrnom", new Response("{oops", { status: 200 }))).outcome).toBe("ambiguous");
    expect((await classify("mrnom", new Response("[]", { status: 200 }))).outcome).toBe("ambiguous");
  });
});
