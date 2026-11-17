import { describe, expect, it } from "vitest";
import { classifyPageResponse } from "@/lib/checker/providers/profilePage";
import { CLOUDFLARE_HTML } from "./helpers";

const classify = async (u: string, res: Response) => classifyPageResponse(u, res, await res.clone().text());

describe("classifyPageResponse", () => {
  it("found: username embedded in RSC payload", async () => {
    const body = `<html><script>self.__next_f.push([1,"{\\"user\\":{\\"username\\":\\"mrnom\\",\\"address\\":\\"7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\\"}}"])</script></html>`;
    const e = await classify("mrnom", new Response(body, { status: 200 }));
    expect(e.outcome).toBe("found");
    expect(e.wallet).toBe("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
  });

  it("found: og:title contains @username", async () => {
    const body = `<html><head><meta property="og:title" content="@mrnom on pump.fun"/></head></html>`;
    expect((await classify("mrnom", new Response(body, { status: 200 }))).outcome).toBe("found");
  });

  it("found: redirect to wallet profile", async () => {
    const res = new Response(null, { status: 307, headers: { location: "/profile/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" } });
    expect((await classify("mrnom", res)).outcome).toBe("found");
  });

  it("does not match a username that merely starts with the query", async () => {
    const body = `<html><head><title>@mrnomnom | pump.fun</title></head></html>`;
    expect((await classify("mrnom", new Response(body, { status: 200 }))).outcome).toBe("ambiguous");
  });

  it("not_found on origin 404", async () => {
    expect((await classify("mrnom", new Response("<html>This page could not be found.</html>", { status: 404 }))).outcome).toBe("not_found");
  });

  it("not_found on explicit message", async () => {
    expect((await classify("mrnom", new Response("<div>User not found</div>", { status: 200 }))).outcome).toBe("not_found");
  });

  it("ambiguous on a generic client-rendered shell", async () => {
    expect((await classify("mrnom", new Response("<html><div id=root></div></html>", { status: 200 }))).outcome).toBe("ambiguous");
  });

  it("blocked on Cloudflare", async () => {
    expect((await classify("mrnom", new Response(CLOUDFLARE_HTML, { status: 403 }))).outcome).toBe("blocked");
  });
});
