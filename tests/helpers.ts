import { vi } from "vitest";
import type { FetchLike } from "@/lib/checker/types";

export type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

export const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html", ...headers } });

export const empty = (status = 200) => new Response(null, { status });

export const CLOUDFLARE_HTML =
  '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title></head><body>' +
  '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body></html>';

export const cloudflare = (status = 403) => html(CLOUDFLARE_HTML, status, { "cf-mitigated": "challenge" });

/** Build a fetch mock that dispatches on host: api vs profile page. */
export function mockFetch(handlers: { api?: Route; page?: Route }) {
  const fn = vi.fn<FetchLike>(async (url, init) => {
    if (url.includes("frontend-api")) {
      if (!handlers.api) throw new Error("unexpected api call");
      return handlers.api(url, init);
    }
    if (url.includes("pump.fun/u/")) {
      if (!handlers.page) throw new Error("unexpected page call");
      return handlers.page(url, init);
    }
    throw new Error(`unmocked url ${url}`);
  });
  return fn;
}

export const instantSleep = async () => {};

export const user = (username: string, address = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU") => ({
  address,
  username,
  profile_image: null,
  bio: "",
  followers: 12,
  following: 3,
});
