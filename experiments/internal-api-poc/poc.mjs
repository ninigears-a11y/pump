#!/usr/bin/env node
/**
 * ISOLATED proof-of-concept: Pump.fun internal profile lookup.
 *
 *   GET https://frontend-api-v3.pump.fun/users/{username}
 *
 * Rules (see README.md):
 *  - plain requests only: no spoofed Origin/Referer/User-Agent, no cookies, no session tokens
 *  - conservative throttle: 1 request at a time, >= MIN_INTERVAL_MS apart, stop on 429/challenge streaks
 *  - strict interpretation:
 *      200 + JSON user whose username matches     -> EXISTS
 *      404 + JSON/empty body (origin, not a WAF)  -> NOT_FOUND
 *      403 / Cloudflare challenge / anything else -> UNKNOWN
 *
 * Usage: node poc.mjs nom neo zen            (or --file names.txt)
 */
import { readFileSync } from "node:fs";

const BASE = process.env.POC_BASE || "https://frontend-api-v3.pump.fun";
const MIN_INTERVAL_MS = Number(process.env.POC_INTERVAL_MS || 2000);
const MAX_NAMES = 50;
const STOP_AFTER_BLOCKS = 3; // consecutive challenges/429s -> stop instead of hammering

export function classify(username, status, headers, body) {
  const get = (h) => headers.get?.(h) ?? headers[h];
  const ct = (get("content-type") || "").toLowerCase();
  const challenged = !!get("cf-mitigated") || /just a moment|challenges\.cloudflare\.com|cf-chl/i.test(body.slice(0, 5000));
  if (challenged) return { result: "UNKNOWN", why: `Cloudflare challenge (HTTP ${status})` };
  if (status === 429) return { result: "UNKNOWN", why: `Rate limited (429, retry-after=${get("retry-after") ?? "?"})`, rateLimited: true };
  if (status === 404) {
    const t = body.trim();
    if (t === "") return { result: "NOT_FOUND", why: "404 with empty body" };
    try {
      const j = JSON.parse(t);
      if (typeof j?.message === "string" && /^cannot get/i.test(j.message)) return { result: "UNKNOWN", why: "404 route missing (endpoint changed?)" };
      return { result: "NOT_FOUND", why: "404 JSON" };
    } catch {
      return { result: "UNKNOWN", why: `404 non-JSON (${ct || "no content-type"})` };
    }
  }
  if (status === 200) {
    const t = body.trim();
    if (t === "" || t === "null") return { result: "NOT_FOUND", why: "200 with no user record" };
    try {
      const j = JSON.parse(t);
      if (typeof j?.username === "string" && j.username.toLowerCase() === username.toLowerCase())
        return { result: "EXISTS", why: `200 user record (wallet ${String(j.address ?? "?").slice(0, 4)}…)` };
      return { result: "UNKNOWN", why: "200 but not a matching user record" };
    } catch {
      return { result: "UNKNOWN", why: "200 non-JSON" };
    }
  }
  return { result: "UNKNOWN", why: `HTTP ${status}` };
}

async function lookup(username) {
  const url = `${BASE}/users/${encodeURIComponent(username)}`;
  const t0 = Date.now();
  try {
    // Plain GET: only an Accept header. No Origin/Referer/User-Agent overrides, no cookies.
    const res = await fetch(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(10000) });
    const body = await res.text();
    return {
      username, url, status: res.status, ms: Date.now() - t0,
      cfMitigated: res.headers.get("cf-mitigated"), cfRay: res.headers.get("cf-ray"),
      acao: res.headers.get("access-control-allow-origin"),
      snippet: body.slice(0, 90).replace(/\s+/g, " "),
      ...classify(username, res.status, res.headers, body),
    };
  } catch (e) {
    return { username, url, status: 0, ms: Date.now() - t0, result: "UNKNOWN", why: `network error: ${e.cause?.code ?? e.message}` };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  let names = args[0] === "--file" ? readFileSync(args[1], "utf8").split(/\s+/) : args;
  names = [...new Set(names.map((n) => n.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))].slice(0, MAX_NAMES);
  if (!names.length) return console.error("usage: node poc.mjs <name> [...]");
  console.log(`POC: ${names.length} name(s), 1 at a time, >= ${MIN_INTERVAL_MS} ms apart, base ${BASE}\n`);
  let blocks = 0;
  const rows = [];
  for (const [i, n] of names.entries()) {
    if (i) await sleep(MIN_INTERVAL_MS);
    const r = await lookup(n);
    rows.push(r);
    console.log(JSON.stringify(r));
    blocks = r.status === 403 || r.rateLimited ? blocks + 1 : 0;
    if (blocks >= STOP_AFTER_BLOCKS) {
      console.log(`\nSTOPPED: ${blocks} consecutive blocked/rate-limited responses. Not continuing (no hammering, no evasion).`);
      break;
    }
  }
  const tally = rows.reduce((a, r) => ((a[r.result] = (a[r.result] || 0) + 1), a), {});
  console.log(`\nSummary: ${JSON.stringify(tally)} of ${rows.length} requested`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
